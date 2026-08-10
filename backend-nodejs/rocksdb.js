const level = require("level-rocksdb");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const basePath = "./csm_datas/"; 
const dbInstances = {}; 

async function getDB(app_id, tableName) {
    const dbPath = path.join(basePath, app_id, tableName);
    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

    if (!dbInstances[dbPath]) {
        try {
            dbInstances[dbPath] = level(dbPath, {
                valueEncoding: "json",
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

async function processExcelFiles(app_id, tableName, folderPath) {
    console.log(`🚀 Nhập dữ liệu vào bảng ${tableName}...`);
    const db = await getDB(app_id, tableName);

    try {
        const files = fs.readdirSync(folderPath)
            .filter(file => file.endsWith(".xlsx"))
            .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || 0) - parseInt(b.match(/\d+/)?.[0] || 0));

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            console.log(`📂 Đang xử lý file: ${filePath}`);
            
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            const worksheet = workbook.worksheets[0];

            const fieldNames = worksheet.getRow(1).values.slice(1);
            let batch = db.batch();
            let count = 0;

            for (let i = 2; i <= worksheet.rowCount; i++) {
                const row = worksheet.getRow(i);
                const record = {};

                fieldNames.forEach((name, index) => {
                    record[name] = row.getCell(index + 1).value ? row.getCell(index + 1).value.toString() : "";
                });

                record.id = record.id || uuidv4();
                if (record.company_name) {
                    batch.put(record.company_name.trim().toUpperCase(), record);
                    count++;

                    if (count === 1000) {
                        await batch.write();
                        console.log(`🚀 Đã nhập 1000 bản ghi...`);
                        batch = db.batch();
                        count = 0;
                    }
                }
            }

            if (count > 0) await batch.write();
            console.log(`✅ Đã nhập xong từ ${filePath}.`);

            // Cập nhật meta_totalCount sau khi nhập dữ liệu từ file
            let totalCount = 0;
            try {
                totalCount = await db.get("__meta_totalCount") || 0; // Nếu không có, trả về 0
            } catch (error) {
                if (error.notFound) {
                    totalCount = 0; // Nếu khóa không tồn tại, gán mặc định là 0
                } else {
                    throw error; // Các lỗi khác
                }
            }

            await db.put("__meta_totalCount", totalCount + count); // Cập nhật tổng số dòng
        }

    } catch (error) {
        console.error("❌ Lỗi trong quá trình nhập dữ liệu:", error);
    }
}

async function loadData(app_id, tableName, limit = 100) {
    console.log(`🚀 Đang tải dữ liệu từ bảng ${tableName}...`);
    console.time("⏳ Thời gian tải");
    const db = await getDB(app_id, tableName);
    
    const items = [];
    for await (const [key, value] of db.iterator({ limit: limit, keyAsBuffer: false, valueAsBuffer: false })) {
        items.push(value);
    }
    console.timeEnd("⏳ Thời gian tải");
    console.log(`✅ Đọc xong ${items.length} bản ghi từ bảng ${tableName}.`);
}

async function resetMeta(app_id, tableName) {
    console.log(`🚀 Đang tải dữ liệu từ bảng ${tableName}...`);
    console.time("⏳ Thời gian tải");

    const db = await getDB(app_id, tableName);
    let totalCount = 0; // Biến lưu số lượng bản ghi

    // Duyệt qua tất cả các bản ghi trong cơ sở dữ liệu mà không cần đọc giá trị
    for await (const _ of db.iterator({ keyAsBuffer: false, valueAsBuffer: false, values: false })) {
        totalCount++;
    }

    console.timeEnd("⏳ Thời gian tải");
    console.log(`✅ Đọc xong ${totalCount} bản ghi từ bảng ${tableName}.`);

    // Cập nhật lại meta count trong cơ sở dữ liệu
    try {
        await db.put("__meta_totalCount", totalCount); // Cập nhật lại tổng số bản ghi
        console.log("✅ Đã cập nhật lại meta tổng số bản ghi.");
    } catch (error) {
        console.error("❌ Lỗi khi cập nhật lại meta tổng số bản ghi:", error);
    }
}

async function keyExists(app_id, tableName, key) {
    const db = await getDB(app_id, tableName);
    try {
        await db.get(key);
        console.log(`✅ Key [${key}] tồn tại.`);
        return true;
    } catch (error) {
        if (error.notFound) {
            console.log(`❌ Key [${key}] không tồn tại.`);
            return false;
        }
        throw error;
    }
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
    const tableName = "fid_doanhnghiep";
    const folderPath = "./doanh_nghiep";
    const app_id = "fidovnemail";
    // await resetMeta(app_id,tableName)
    // await processExcelFiles(app_id, tableName, folderPath);
    await loadData(app_id, tableName, 10000);
})();