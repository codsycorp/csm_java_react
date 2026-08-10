const fs = require("fs");
const path = require("path");
const Datastore = require("nedb");
const Realm = require("realm");

// 📂 Thư mục chứa tất cả dữ liệu của các appid
const DATA_FOLDER = path.join(__dirname, "data");

// 📌 Đọc dữ liệu từ NeDB
function readNeDB(filePath) {
  return new Promise((resolve, reject) => {
    const db = new Datastore({ filename: filePath, autoload: true });
    db.find({}, (err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
}

// 📌 Lấy danh sách appid từ thư mục `data/`
function getAppIDs() {
  return fs
    .readdirSync(DATA_FOLDER)
    .filter((dir) => fs.statSync(path.join(DATA_FOLDER, dir)).isDirectory());
}

// 📌 Lấy danh sách bảng từ `index.db` của từng appid
async function getTablesFromIndex(appid) {
  const indexPath = path.join(DATA_FOLDER, appid, "index.db");
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Không tìm thấy index.db cho appid: ${appid}`);
    return [];
  }

  const indexData = await readNeDB(indexPath);
  return indexData
    .filter((table) => table.id !== "menu") // Loại bỏ menu
    .map((table) => ({
      id: table.id, // Tên bảng
      struct: table.struct, // Cấu trúc bảng
    }));
}

// 📌 Xác định kiểu dữ liệu từ `defaultValue`
function detectFieldType(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "boolean") return "bool";
  return "string";
}

// 📌 Tạo schema Realm từ danh sách bảng của từng appid
async function generateSchemas(appid) {
  const tables = await getTablesFromIndex(appid);
  let schemas = [];

  tables.forEach(({ id, struct }) => {
    if (!struct || !struct.fields || !struct.fieldsPK || !struct.defaultValue)
      return;

    let properties = {};
    Object.entries(struct.defaultValue).forEach(([field, value]) => {
      properties[field] = detectFieldType(value);
    });

    schemas.push({
      name: `${appid}_${id}`, // Tránh trùng tên bảng giữa các appid
      primaryKey: struct.fieldsPK[0], // Dùng khóa chính đầu tiên
      properties,
    });
  });

  return schemas;
}

// 📌 Đồng bộ dữ liệu từ NeDB -> Realm cho từng appid
async function syncDataForAppID(appid) {
  const schemas = await generateSchemas(appid);
  if (schemas.length === 0) {
    console.log(`❌ Không có schema nào cho appid: ${appid}`);
    return;
  }

  console.log(`🔄 Đang đồng bộ dữ liệu cho appid: ${appid}...`);

  // ⚡ Khởi tạo Realm với các schema động
  const realm = await Realm.open({
    path: `database_${appid}.realm`,
    schema: schemas,
  });

  for (const schema of schemas) {
    const tableFile = path.join(DATA_FOLDER, appid, schema.name.replace(`${appid}_`, "") + ".db");

    if (fs.existsSync(tableFile)) {
      const data = await readNeDB(tableFile);

      realm.write(() => {
        data.forEach((record) => {
          realm.create(schema.name, record, "modified");
        });
      });

      console.log(`✅ Đã đồng bộ ${data.length} bản ghi vào bảng ${schema.name}`);
    } else {
      console.log(`⚠️ Không tìm thấy dữ liệu cho bảng ${schema.name}`);
    }
  }

  console.log(`🎉 Đồng bộ hoàn tất cho appid: ${appid}!`);
}

// 📌 Đồng bộ tất cả appid trong `data/`
async function syncAllData() {
  const appIDs = getAppIDs();
  if (appIDs.length === 0) {
    console.log("❌ Không tìm thấy appid nào!");
    return;
  }

  for (const appid of appIDs) {
    await syncDataForAppID(appid);
  }

  console.log("🎉 Tất cả dữ liệu đã được đồng bộ vào Realm!");
}

// 🔥 Chạy đồng bộ
syncAllData().catch(console.error);
