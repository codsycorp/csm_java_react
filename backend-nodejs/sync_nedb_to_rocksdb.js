const fs = require("fs");
const path = require("path");
const Datastore = require("nedb");
const level = require("level-rocksdb");
const crypto = require("crypto");
const { compile } = require("squirrelly");

// 📂 Thư mục chứa dữ liệu NeDB
const DATA_FOLDER = path.join(__dirname, "data");
const DATA_FOLDER_ROCKSDB = path.join(__dirname, "database");

// 📌 Cấu hình mã hóa NeDB
const algorithm = "aes-256-cbc";
const secret = "Công Ty Cổ Phần CODSY";
const key = crypto.createHash("sha256").update(String(secret)).digest("base64").substr(0, 32);

// 📌 Tạo NeDB có mã hóa
function createEncryptedDB(filePath) {
  console.log(`🔐 Đang tạo NeDB có mã hóa: ${filePath}`);
  return new Datastore({
    filename: filePath,
    autoload: true,
    afterSerialization(plaintext) {
      const iv = crypto.randomBytes(16);
      const aes = crypto.createCipheriv(algorithm, key, iv);
      let ciphertext = aes.update(plaintext);
      ciphertext = Buffer.concat([iv, ciphertext, aes.final()]);
      return ciphertext.toString("base64");
    },
    beforeDeserialization(ciphertext) {
      const ciphertextBytes = Buffer.from(ciphertext, "base64");
      const iv = ciphertextBytes.slice(0, 16);
      const data = ciphertextBytes.slice(16);
      const aes = crypto.createDecipheriv(algorithm, key, iv);
      let plaintextBytes = Buffer.from(aes.update(data));
      plaintextBytes = Buffer.concat([plaintextBytes, aes.final()]);
      return plaintextBytes.toString();
    },
  });
}

// 📌 Đọc dữ liệu từ NeDB (hỗ trợ mã hóa)
function readNeDB(filePath) {
  return new Promise((resolve) => {
    try {
      const db = createEncryptedDB(filePath);
      db.find({}, (err, docs) => {
        if (err) {
          console.error(`❌ Lỗi đọc NeDB: ${filePath} -`, err.message);
          resolve([]);
        } else {
          resolve(docs);
        }
      });
    } catch (error) {
      console.error(`❌ Lỗi khi giải mã NeDB: ${filePath} -`, error.message);
      resolve([]);
    }
  });
}

// 📌 Lấy danh sách appid từ thư mục `data/`
function getAppIDs() {
  return fs
    .readdirSync(DATA_FOLDER)
    .filter((dir) => fs.statSync(path.join(DATA_FOLDER, dir)).isDirectory());
}

// 📌 Lấy danh sách bảng từ `index.db`
async function getTablesFromIndex(appid) {
  const indexPath = path.join(DATA_FOLDER, appid, "index.db");
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Không tìm thấy index.db cho appid: ${appid}`);
    return [];
  }

  const indexData = await readNeDB(indexPath);
  return indexData
    // .filter((table) => table.id !== "menu") // Loại bỏ menu
    .map((table) => ({
      id: table.id,
      struct: table.struct,
    }));
}


// 📌 Đảm bảo dữ liệu phù hợp schema
function sanitizeRecord(record, schema) {
  let sanitized = {};

  // Xử lý các trường theo schema
  for (let field in schema.properties) {
    let expectedType = schema.properties[field];

    if (record[field] === undefined || record[field] === null) {
      sanitized[field] = expectedType === "int" ? 0 
                        : expectedType === "float" ? 0.0 
                        : expectedType === "bool" ? false 
                        : "";
    } else {
      if (expectedType === "int") {
        sanitized[field] = parseInt(record[field]) || 0;
      } else if (expectedType === "float") {
        sanitized[field] = parseFloat(record[field]) || 0.0;
      } else if (expectedType === "bool") {
        sanitized[field] = Boolean(record[field]);
      } else {
        sanitized[field] = String(record[field]);
      }
    }
  }

  // Giữ lại các trường không có trong schema
  for (let field in record) {
    if (!schema.properties.hasOwnProperty(field)) {
      sanitized[field] = record[field];
    }
  }

  return sanitized;
}

async function getDB(app_id,tableName) {
  const dbPath = path.join(DATA_FOLDER_ROCKSDB,app_id, tableName);
  console.log(`📂 Đang mở DB tại: ${dbPath}`);
  if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

  try {
      const db = level(dbPath, {
          valueEncoding: "json",
          filter: {
              bloomFilter: 10,
          }
      });

      await db.open(); // 🔹 Đảm bảo DB được mở
      return db;
  } catch (error) {
      console.error("❌ Lỗi khi mở DB:", error);
      throw error;
  }
}
// 📌 Đồng bộ dữ liệu từ NeDB -> LevelDB cho từng appid
async function syncDataForAppID(appid) {
  try {
      console.log(`🔄 Đồng bộ dữ liệu cho appid: ${appid}...`);

      const tables = await getTablesFromIndex(appid);
      if (tables.length === 0) {
          console.log(`❌ Không có bảng nào cho appid: ${appid}`);
          return;
      }

      let dbIndex = await getDB(appid, "index");
      let batchOps = [];

      for (const recordI of tables) {
          delete recordI["_id"];
          batchOps.push({ type: "put", key: `${recordI.id}`, value: recordI});

          if (batchOps.length >= 1000) {
              await dbIndex.batch(batchOps);
              batchOps = [];
          }
      }

      if (batchOps.length > 0) {
          await dbIndex.batch(batchOps);
      }

      console.log(`✅ Đồng bộ ${tables.length} bản ghi vào bảng Index`);
      await dbIndex.close();
      console.log(`🔒 Đã đóng LevelDB cho appid: ${appid}`);

      for (const { id, struct } of tables) {
          const tableFile = path.join(DATA_FOLDER, appid, id + ".db");
          if (!fs.existsSync(tableFile)) {
              console.log(`⚠️ Không tìm thấy dữ liệu cho bảng ${id}`);
              continue;
          }

          const data = await readNeDB(tableFile);
          let db = await getDB(appid, `${id}`);
          let batchOps = [];

          for (const record of data) {
              const sanitizedRecord = sanitizeRecord(record, { properties: struct.defaultValue });
          
              // Tạo key từ tất cả các khóa chính (fieldsPK)
              const primaryKeys = struct.fieldsPK.length > 0 ? struct.fieldsPK : ["id"];
          
              // Mã hóa các giá trị của khóa chính trước khi kết hợp chúng
              const keyParts = primaryKeys.map(pk => {
                  // Mã hóa giá trị khóa chính để tránh xung đột với dấu phân cách
                  return encodeURIComponent(sanitizedRecord[pk] || "null");
              }).join(":");
          
              delete sanitizedRecord["_id"];
              
              // Tạo composite key mới với `id` làm phần đầu (nếu cần)
              batchOps.push({ 
                  type: "put", 
                  key: `${encodeURIComponent(id)}:${keyParts}`, // Mã hóa cả phần id
                  value: sanitizedRecord
              });
          
              // Thực hiện batch nếu đã đủ số lượng
              if (batchOps.length >= 50) {
                  await db.batch(batchOps);
                  batchOps = [];
              }
          }        

          if (batchOps.length > 0) {
              await db.batch(batchOps);
          }

          console.log(`✅ Đồng bộ ${data.length} bản ghi vào bảng ${id}`);
          await db.close();
          console.log(`🔒 Đã đóng LevelDB cho appid: ${appid}`);
      }

      console.log(`🎉 Đồng bộ hoàn tất cho appid: ${appid}!`);
  } catch (error) {
      console.error(`❌ Lỗi khi đồng bộ dữ liệu cho appid: ${appid}:`, error.message);
  }
}

// 📌 Đồng bộ tất cả appid trong `data/`
async function syncAllData() {
  try {
    const appIDs = getAppIDs();
    if (appIDs.length === 0) {
      console.log("❌ Không tìm thấy appid nào!");
      return;
    }

    for (const appid of appIDs) {
      if(appid==="csm")
        await syncDataForAppID(appid);
    }

    console.log("🎉 Tất cả dữ liệu đã được đồng bộ vào ROCKSDB!");
  } catch (error) {
    console.error("❌ Lỗi khi đồng bộ tất cả dữ liệu:", error.message);
  }
}

// 🔥 Chạy đồng bộ
syncAllData().catch(console.error);
