// const Realm = require("realm");
// const ExcelJS = require("exceljs");
// const fs = require("fs");
// const path = require("path");

// // 🔹 Thư mục chứa file Excel
// const folderPath = "./doanh_nghiep";

// // 🔹 Lọc file Excel
// const files = fs.readdirSync(folderPath)
//     .filter(file => file.endsWith(".xlsx"))
//     .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

// async function processExcelFiles() {
//     console.log("🚀 Bắt đầu nhập dữ liệu từ Excel vào bảng `fid_danhnghiep`...");

//     let realm = null;
//     let schemaCreated = false;
//     let dynamicSchema = null;

//     for (const file of files) {
//         const filePath = path.join(folderPath, file);
//         console.log(`📂 Đang xử lý file: ${filePath}`);

//         const workbook = new ExcelJS.Workbook();
//         await workbook.xlsx.readFile(filePath);
//         const worksheet = workbook.worksheets[0];

//         // 🔹 Lấy tên cột từ dòng đầu tiên
//         const headerRow = worksheet.getRow(1);
//         const fieldNames = headerRow.values.slice(1); // Bỏ qua giá trị đầu tiên (index 0)

//         // 🔹 Nếu chưa có schema, tạo schema động
//         if (!schemaCreated) {
//             const properties = {};
//             fieldNames.forEach(name => {
//                 properties[name] = "string"; // Mặc định lưu tất cả dạng chuỗi
//             });

//             dynamicSchema = { name: "fid_danhnghiep", properties };
//             realm = new Realm({ path: "data/fidovnemail.realm", schema: [dynamicSchema] });
//             schemaCreated = true;
//         }

//         // 🔹 Ghi dữ liệu vào RealmDB
//         realm.write(() => {
//             for (let i = 2; i <= worksheet.rowCount; i++) {
//                 const row = worksheet.getRow(i);
//                 const record = {};

//                 fieldNames.forEach((name, index) => {
//                     record[name] = row.getCell(index + 1).value ? row.getCell(index + 1).value.toString() : "";
//                 });

//                 realm.create("fid_danhnghiep", record);
//             }
//         });

//         console.log(`✅ Đã nhập dữ liệu từ ${filePath} vào bảng \`fid_danhnghiep\`.`);
//     }

//     console.log("🎉 Hoàn tất nhập dữ liệu vào bảng `fid_danhnghiep`!");
// }

// // 🔹 Chạy hàm nhập dữ liệu
// processExcelFiles();

const Realm = require("realm");

    // 🔹 Mở database
async function loadData(appid,tableName) {
    const realm = new Realm({ path: `data/${appid}.realm` });
    console.log(`🚀 Đang tải dữ liệu từ bảng \`${tableName}\`...`);

    try {
        // 🔹 Kiểm tra bảng có tồn tại không
        const schema = realm.schema.find(s => s.name === tableName);
        if (!schema) {
            console.error(`❌ Lỗi: Bảng \`${tableName}\` không tồn tại trong Realm!`);
            return;
        }

        // 📌 Hiển thị schema bảng
        console.log(`📋 Cấu trúc bảng \`${tableName}\`:\n`, JSON.stringify(schema.properties, null, 2));


        // 🔹 Lấy tất cả dữ liệu từ bảng
        const records = realm.objects(tableName);
        console.log(`✅ Tải thành công ${records.length} bản ghi!`);

        // Chuyển đổi tất cả records thành JSON (tự động hỗ trợ nested objects)
        const jsonData = records.slice(0, 100).map(record => JSON.parse(JSON.stringify(record)));

        // 📌 Hiển thị JSON đẹp
        console.log("📌 Hiển thị 100 bản ghi đầu tiên:");
        console.log(JSON.stringify(jsonData, null, 2));

        console.log("🎉 Hoàn tất tải dữ liệu!");
    } catch (error) {
        console.error("❌ Lỗi khi tải dữ liệu:", error);
    }
}

// 🔥 Gọi hàm với bảng động
loadData("fidovnemail","fid_danhnghiep");
