const level = require("level-rocksdb");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const basePath = "./csm_datas/";
const dbInstances = {};

const phone = "0937.528.839";
const writeby = "base._co.osa";

// Mã hoá base64 rồi hoán đổi ký tự
function la_encrypt(d_code) {
  const base64 = Buffer.from(d_code, 'utf8').toString('base64');
  return strtr(base64, phone + writeby, writeby + phone);
}

function la_decrypt(e_code) {
  const swapped = strtr(e_code, writeby + phone, phone + writeby);
  return Buffer.from(swapped, 'base64').toString('utf8');
}

function strtr(str, from, to) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const idx = from.indexOf(str[i]);
    result += idx !== -1 ? to[idx] : str[i];
  }
  return result;
}

async function getDB(app_id, tableName) {
  const dbPath = path.join(basePath, app_id, tableName);
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

  if (!dbInstances[dbPath]) {
    try {
      dbInstances[dbPath] = level(dbPath, {
        valueEncoding: "utf8",
        filter: { bloomFilter: 10 },
      });
      await dbInstances[dbPath].open();
    } catch (error) {
      console.error("❌ Lỗi khi mở DB:", error);
      throw error;
    }
  }
  return dbInstances[dbPath];
}

function walkDir(dir, fileList = [], extensions = [".ts", ".tsx"]) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, fileList, extensions);
    } else if (extensions.includes(path.extname(file))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function clearType2Records(db) {
  const keysToDelete = [];

  return new Promise((resolve, reject) => {
    db.createReadStream()
      .on("data", ({ key, value }) => {
        if (!key.startsWith("__meta") && key.startsWith("2|")) {
          keysToDelete.push(key);
        }
      })
      .on("end", async () => {
        if (keysToDelete.length > 0) {
          const batch = db.batch();
          for (const k of keysToDelete) {
            batch.del(k);
          }
          await batch.write();
          console.log(`🧹 Đã xóa ${keysToDelete.length} bản ghi có p_type=2`);
        } else {
          console.log("✅ Không có bản ghi p_type=2 để xóa.");
        }
        resolve();
      })
      .on("error", reject);
  });
}

async function processTSFiles(app_id, tableName, sourceFolder) {
  console.log(`🚀 Nhập dữ liệu từ file .ts/.tsx vào bảng ${tableName}`);
  const db = await getDB(app_id, tableName);

  // ❗ Xoá dữ liệu p_type = 2 trước
  await clearType2Records(db);

  const filePaths = walkDir(sourceFolder);
  let batch = db.batch();
  let count = 0;

  for (const filePath of filePaths) {
    const relativePath = path.relative(sourceFolder, filePath).replace(/\\/g, "/");
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath, "utf8");

    const record = {
      id: fileName,
      p_type: 2,
      p_path: relativePath,
      p_code: la_encrypt(fileContent),
    };

    batch.put(`${record.p_type}|${relativePath}`, JSON.stringify(record));
    count++;

    if (count === 500) {
      await batch.write();
      console.log(`✅ Đã lưu 500 file...`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.write();
    console.log(`✅ Đã lưu thêm ${count} file cuối.`);
  }

  await db.put("__meta_totalCount", filePaths.length.toString());
  console.log(`✅ Tổng cộng đã lưu ${filePaths.length} file vào bảng ${tableName}.`);
}

async function readDecryptedData(app_id, tableName) {
  const db = await getDB(app_id, tableName);
  const records = [];

  return new Promise((resolve, reject) => {
    db.createReadStream()
      .on("data", ({ key, value }) => {
        if (!key.startsWith("__meta")) {
          try {
            const obj = JSON.parse(value);
            if (obj.p_type === 2) {
              obj.p_code_decoded = la_decrypt(obj.p_code);
              records.push(obj);
            }
          } catch (e) {
            console.error("❌ Lỗi khi giải mã:", e);
          }
        }
      })
      .on("end", () => {
        console.log(`📦 Tổng cộng đọc được ${records.length} file từ DB.`);
        records.slice(0, 3).forEach((r, i) => {
          console.log(`--- #${i + 1} ---`);
          console.log("ID:", r.id);
          console.log("Path:", r.p_path);
          console.log("Decoded:", r.p_code_decoded.slice(0, 200), "...");
        });
        resolve(records);
      })
      .on("error", reject);
  });
}

process.on("SIGINT", async () => {
  console.log("🛑 Đang đóng tất cả database...");
  for (const path in dbInstances) {
    await dbInstances[path].close();
  }
  console.log("✅ Đã đóng tất cả database.");
  process.exit();
});

(async () => {
  const app_id = "dbsys";
  const tableName = "sys_autos";
  const folderPath = path.resolve("frontend", "src");

  await processTSFiles(app_id, tableName, folderPath);
  await readDecryptedData(app_id, tableName);
})();
