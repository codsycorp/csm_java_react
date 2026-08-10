const XLSX = require("xlsx");
const level = require('level-rocksdb');
// const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fetch = require('node-fetch');
const axios = require('axios');
const OSS = require('ali-oss');
const { json } = require('stream/consumers');
// const mysql = require('mysql');

// Hàm kết nối đến MySQL và truy xuất dữ liệu từ bảng t_recruitment_job
function fetchJobsFromMySQL(callback) {
    const connection = mysql.createConnection({
        host: '47.238.111.179',           // Thay thế bằng thông tin của bạn
        user: 'fidovn',                   // Thay thế bằng thông tin của bạn
        password: 'fidovndb-app-dev@0621!',   // Thay thế bằng thông tin của bạn
        database: 'db_fidovn'             // Thay thế bằng thông tin của bạn
    });

    connection.connect((err) => {
        if (err) {
            console.error('❌ Lỗi khi kết nối MySQL:', err);
            callback(err, null);
            return;
        }
        connection.query('SELECT * FROM t_recruitment_job', (error, results) => {
            connection.end();
            if (error) {
                console.error('❌ Lỗi khi truy vấn MySQL:', error);
                callback(error, null);
                return;
            }
            callback(null, results);
        });
    });
}
// Hàm kết nối đến MySQL và truy xuất dữ liệu từ bảng t_recruitment_job_category
function fetchJobCategoriesFromMySQL(callback) {
    const connection = mysql.createConnection({
        host: '47.238.111.179',      // Thay thế bằng thông tin của bạn
        user: 'fidovn',              // Thay thế bằng thông tin của bạn
        password: 'fidovndb-app-dev@0621!', // Thay thế bằng thông tin của bạn
        database: 'db_fidovn'        // Thay thế bằng thông tin của bạn
    });

    connection.connect((err) => {
        if (err) {
            console.error('❌ Lỗi khi kết nối MySQL:', err);
            callback(err, null);
            return;
        }
        connection.query('SELECT * FROM t_recruitment_job_category', (error, results) => {
            connection.end();
            if (error) {
                console.error('❌ Lỗi khi truy vấn MySQL:', error);
                callback(error, null);
                return;
            }
            callback(null, results);
        });
    });
}

const basePath = './csm_datas/';

// Hàm băm MD5
function md5Hash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}
const apiBase = 'https://api-dev.fidovn.com';
// Hàm đăng nhập
async function fidovn_login(loginName, loginPasswd, fidovnClientId, type_Login = "loginByName") {
    console.time('⏱️ Thời gian đăng nhập');
    var baseAdmin = '';
    if (type_Login === "loginByName") {
        baseAdmin = 'fidovn-admin';
    }
    else
        baseAdmin = 'fidovn-user';
    const apiUrl = `${apiBase}/${baseAdmin}/account/${type_Login}`;
    console.log(apiUrl);
    var pLogin = {};
    if (type_Login === "loginByEmail") {
        pLogin = { email: loginName, passwd: loginPasswd, loginRole: 1 };
    }
    else if (type_Login === "loginByMobile") {
        pLogin = { mobileCountryCode: '+84', mobileNumber: loginName, passwd: loginPasswd, loginRole: 1 };
    }
    else {
        pLogin = { loginName, loginPasswd };
    }
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "Fidovn-Accept-Language": 'vi',
                "Fidovn-Device-Info": "autopost",
                "Fidovn-Client-Id": fidovnClientId,
                "fidovn-client-type": "Web",
            },
            body: JSON.stringify(pLogin)
        });

        const result = await response.json();
        // console.log("✅ Kết quả Header đăng nhập:", response.headers);
        const fidovnToken = response.headers.get('fidovn-auth-token');

        if (!response.ok) {
            console.error('❌ Lỗi khi đăng nhập:', pLogin, result);
            throw new Error(`Lỗi đăng nhập: ${result.message || response.status}`);
        }

        console.timeEnd('⏱️ Thời gian đăng nhập');
        console.log('✅ Đăng nhập thành công');
        return fidovnToken;
    } catch (error) {
        console.timeEnd('⏱️ Thời gian đăng nhập');
        console.error('❌ Lỗi khi đăng nhập:', error);
        return null;
    }
}
// fidovn_login('leducanh',md5Hash('1223456'));
// Hàm lấy STS
async function getOssSts(fidovnToken, fileName, fidovnClientId) {
    const url = `${apiBase}/fidovn-admin/file/getOssSts`;
    const headers = {
        "Content-Type": "application/json",
        "fidovn-accept-language": "vi",
        "fidovn-auth-token": fidovnToken,
        "fidovn-client-id": fidovnClientId,
        "fidovn-client-type": "Web",
    };

    const body = { fileName: fileName, type: 1 };

    const response = await axios.post(url, body, { headers });

    console.log("✅ STS:", response.data);

    // Chờ 1 giây trước khi trả về kết quả
    await new Promise(resolve => setTimeout(resolve, 1000));

    return response.data.data;
}

// Hàm tải ảnh dưới dạng buffer
async function fetchImageAsBuffer(imageUrl) {
    console.time('⏱️ Thời gian tải ảnh');
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        console.log("✅ Đã tải ảnh, kích thước:", response.data.byteLength);
        return Buffer.from(response.data);
    } catch (error) {
        console.error('❌ Lỗi khi tải ảnh:', error);
        throw error;
    } finally {
        console.timeEnd('⏱️ Thời gian tải ảnh'); // Ensure the timer ends even if an error occurs
    }
}

// Hàm tải lên OSS
async function uploadToOss(fileBuffer, sts) {
    console.time('⏱️ Thời gian tải lên OSS');
    const client = new OSS({
        accessKeyId: sts.accessKeyId,
        accessKeySecret: sts.accessKeySecret,
        stsToken: sts.securityToken,
        bucket: sts.bucketName,
        endpoint: sts.endpoint,
        secure: true,
    });

    const result = await client.put(sts.fileName, fileBuffer);
    console.timeEnd('⏱️ Thời gian tải ảnh lên OSS (圖片上傳到OSS的時間)');
    console.log("🎉 Tải ảnh lên OSS thành công (上傳照片至OSS成功):", result.url);
    // console.log("🎉 Thong tin", result);
    // return result.name;
    return `https://upload.fidovn.com/${result.name}`;
}

// Hàm lấy hoặc tạo cơ sở dữ liệu với chỉ mục phụ
const dbConnections = new Map();

async function getDB(app_id, tableName) {
    const dbPath = path.join(basePath, app_id, tableName);
    // console.log(`📂 Đang mở DB tại: ${dbPath}`);

    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

    // Dùng DB đã mở trước đó nếu có
    if (dbConnections.has(dbPath)) {
        return dbConnections.get(dbPath);
    }

    try {
        const db = level(dbPath, { valueEncoding: 'json' });
        dbConnections.set(dbPath, db);
        return db;
    } catch (error) {
        console.error('❌ Lỗi khi mở DB:', error);
        throw error;
    }
}
/**** MYSQL Thống kê số lượng nhà tuyển dụng và số tin theo số điện thoại liên hệ
 * 
 * 
SELECT a.contact_phone_number, COUNT(a.recruitment_job_id) AS so_tin
FROM t_recruitment_job a
WHERE a.contact_phone_number = '0964014947'
GROUP BY a.contact_phone_number;
SELECT COUNT(b.merchant_id) 
FROM t_merchant b
WHERE b.merchant_id IN (
    SELECT merchant_id 
    FROM t_recruitment_job 
    WHERE contact_phone_number = '0964014947'
);
SELECT count(a.merchant_id) from t_merchant a where create_time >= '2025-04-01 00:00:00' and create_time <= '2025-04-07 23:59:59' and channel_name = 'System';

 * 
 * *****/
// Đóng tất cả DB khi ứng dụng kết thúc
async function closeAllDB() {
    for (const [dbPath, db] of dbConnections.entries()) {
        await db.close();
    }
    dbConnections.clear();
}

async function addMerchant(merchantData, fidovnToken, fidovnClientId) {
    const apiUrl = `${apiBase}/fidovn-admin/merchant/addMerchant`;
    const headers = {
        'Content-Type': 'application/json',
        'fidovn-accept-language': 'vi',
        'fidovn-auth-token': fidovnToken,
        'fidovn-client-id': fidovnClientId,
        'fidovn-client-type': 'Web',
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(merchantData),
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Lỗi khi gửi yêu cầu:', error);
        // throw error;
    }
}
async function postJob(jobData, fidovnToken, fidovnClientId) {
    const apiUrl = `${apiBase}/fidovn-user/recruitmentJob/postJob`;
    const headers = {
        'Content-Type': 'application/json',
        'fidovn-accept-language': 'vi',
        'fidovn-auth-token': fidovnToken,
        'fidovn-client-id': fidovnClientId,
        'fidovn-client-type': 'Web',
    };
    console.log("✅ Dữ liệu chuẩn bị gửi:", jobData);
    console.log("✅ Headers:", headers);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(jobData),
        });

        console.log("🟣 Status:", response.status);
        console.log("🟣 Headers trả về:");
        response.headers.forEach((v, k) => console.log(`${k}: ${v}`));

        let resultText = await response.text();
        console.log("🟢 Kết quả dạng text:", resultText);

        try {
            const resultJson = JSON.parse(resultText);
            console.log("🟢 Kết quả dạng JSON:", resultJson);
            return resultJson;
        } catch (jsonError) {
            console.warn("⚠️ Kết quả không phải JSON:", jsonError);
            return resultText;
        }

    } catch (error) {
        console.error('🔴 Lỗi khi gửi yêu cầu:', error);
    }
}

// Hàm lưu thông tin nhà tuyển dụng vào RocksDB
async function saveRecruiterInfo(app_id, tableName, recruiter) {
    const db = await getDB(app_id, tableName);

    const key = recruiter.name; // Sử dụng tên công ty làm khóa chính

    try {
        await db.put(key, recruiter);
        console.log(`✅ Đã lưu thông tin nhà tuyển dụng: ${key}`);
    } catch (error) {
        console.error(`❌ Lỗi khi lưu thông tin nhà tuyển dụng: ${error}`);
        throw error;
    }
}
// Hàm tìm kiếm bản ghi theo company_name
async function findByCompanyName(app_id, tableName, companyName) {
    const db = await getDB(app_id, tableName);

    try {
        const normalizedCompanyName = companyName.trim().toUpperCase(); // Chuyển về in HOA
        const record = await db.get(normalizedCompanyName); // Truy vấn nhanh theo key

        return {
            company_name: record.company_name || "",
            tax_code: record.tax_code || "",
            phone_number: record.phone_number || "",
            email: record.email || "",
            uuid: record.id || ""
        };
    } catch (error) {
        if (error.notFound) {
            return null; // Không tìm thấy công ty
        }
        throw error;
    }
}

// Hàm lưu dữ liệu vào RocksDB
function saveJobCategoriesToRocksDB(app_id, tableName, jobCategories, callback) {
    getDB(app_id, tableName, (err, db) => {
        if (err) {
            callback(err);
            return;
        }
        const batch = db.batch();
        jobCategories.forEach((category) => {
            const key = category.id.toString(); // Giả sử mỗi danh mục có một ID duy nhất
            batch.put(key, category);
        });
        batch.write((error) => {
            db.close();
            if (error) {
                console.error('❌ Lỗi khi lưu vào RocksDB:', error);
                callback(error);
                return;
            }
            console.log(`✅ Đã lưu ${jobCategories.length} danh mục công việc vào RocksDB.`);
            callback(null);
        });
    });
}
// Hàm lưu dữ liệu vào RocksDB sử dụng job_title làm khóa
function saveJobsToRocksDB(app_id, tableName, jobs, callback) {
    getDB(app_id, tableName, (err, db) => {
        if (err) {
            callback(err);
            return;
        }
        const batch = db.batch();
        jobs.forEach((job) => {
            const key = job.job_title.toLowerCase(); // Sử dụng job_title làm khóa
            batch.put(key, job);
        });
        batch.write((error) => {
            db.close();
            if (error) {
                console.error('❌ Lỗi khi lưu vào RocksDB:', error);
                callback(error);
                return;
            }
            console.log(`✅ Đã lưu ${jobs.length} công việc vào RocksDB.`);
            callback(null);
        });
    });
}

async function fetchAllRecords(app_id, tableName) {
    const db = await getDB(app_id, tableName);
    const records = [];

    return new Promise((resolve, reject) => {
        db.createReadStream()
            .on('data', function (data) {
                records.push({ key: data.key, value: data.value });
            })
            .on('error', function (err) {
                console.error('❌ Lỗi khi đọc dữ liệu từ DB:', err);
                reject(err);
            })
            .on('end', function () {
                console.log('✅ Đã truy xuất tất cả các bản ghi từ DB.');
                resolve(records);
            });
    });
}

// 🏢 Hàm lấy dữ liệu bổ sung từ DB
async function getCompanyDetails(app_id, name) {
    if (!name) {
        console.warn("⚠️ Bỏ qua truy vấn với tên rỗng");
        return {};
    }
    try {
        let dbInfo = await findByCompanyName(app_id, 'fid_doanhnghiep', name.trim().toUpperCase());
        // if(dbInfo)
        //     console.log("✅ Tìm thấy thông tin công ty:", dbInfo);
        // else
        //     console.log("❌ Không tìm thấy thông tin công ty:", name);
        return dbInfo || false;
    } catch (error) {
        console.error(`❌ Lỗi khi tìm công ty: ${name}`, error);
        return false;
    }
}
function generateFidovnClientId(length = 9) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
async function getOssSts(fidovnToken, fileName, fidovnClientId) {
    const url = `${apiBase}/fidovn-admin/file/getOssSts`;
    const headers = {
        "Content-Type": "application/json",
        "fidovn-accept-language": "vi",
        "fidovn-auth-token": fidovnToken,
        "fidovn-client-id": fidovnClientId,
        "fidovn-client-type": "Web",
    };

    const body = { fileName: fileName, type: 1 };

    const response = await axios.post(url, body, { headers });

    console.log("✅ STS:", response.data);

    // Chờ 1 giây trước khi trả về kết quả
    await new Promise(resolve => setTimeout(resolve, 1000));

    return response.data.data;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function extractWorkTime(content) {
    const timePattern = /(\d{1,2})[hH:]?(\d{0,2})\s*-\s*(\d{1,2})[hH:]?(\d{0,2})/;
    const match = content.match(timePattern);
    
    if (match) {
        let startHour = match[1].padStart(2, '0');
        let startMinute = match[2] ? match[2].padStart(2, '0') : '00';
        let endHour = match[3].padStart(2, '0');
        let endMinute = match[4] ? match[4].padStart(2, '0') : '00';
        
        return {
            workTimeStart: `${startHour}:${startMinute}`,
            workTimeEnd: `${endHour}:${endMinute}`
        };
    }
    
    return {
        workTimeStart: null,
        workTimeEnd: null
    };
}
function convertJobData(data, source) {
    // Khởi tạo dữ liệu mặc định
    const result = {
        jobName: '',
        jobTitle: '',
        urgentHiring: 0,
        jobType: 1,
        jobCategoryId1: 0,
        jobCategoryId2: 0,
        jobCategoryId3: 0,
        demandWorkExperienceYears: 0,
        demandEducation: 0,
        demandAgeMin: 0,
        demandAgeMax: 0,
        jobResponsibility: '',
        jobRequirement: '',
        internshipPeriod: 0,
        recruitmentNumber: 1,
        salaryPayType: 1,
        salaryRangeId: 6,
        salaryMin:-1,
        salaryMax: -1,
        workTimeType: 0,
        workTimeStart: '08:00',
        workTimeEnd: '17:00',
        employeeBenefits: [],
        areaProvinceId: 0,
        areaCityId: 0,
        areaDistrictId: 0,
        address: '',
        longitude: data.longitude || '',
        latitude: data.latitude || '',
        contactPhoneCountryCode: data.contactPhoneCountryCode || '+84',
        contactPhoneNumber: data.contactPhoneNumber || '0964014947',
        postDays: 30
    };
    const salaryMatch = data.prettysalaryvi?.match(/([\d,.]+)/g) || [];
    // ===========================
    // NGUỒN TOPCV
    // ===========================
    if (source === 'topcv') {
        const companyInfo = JSON.parse(data.company || '{}');

        result.jobTitle = data.title || '';
        result.jobName = result.jobTitle;

        const jobDesc = Array.isArray(data.jobdescription) ? data.jobdescription : JSON.parse(data.jobdescription || '[]');
        result.jobResponsibility = jobDesc.filter(Boolean).join('\n');

        const jobReq = Array.isArray(data.requirements) ? data.requirements : JSON.parse(data.requirements || '[]');
        result.jobRequirement = jobReq.filter(Boolean).join('\n');

        result.recruitmentNumber = parseInt(data.quantity) > 0 ? parseInt(data.quantity) : 1;

        const salaryMatch = data.salary?.match(/([\d]+)/g) || [];
        if (salaryMatch.length >= 1) {
            result.salaryMin = parseInt(salaryMatch[0]) * 1000000 || 0;
            result.salaryMax = salaryMatch[1] ? parseInt(salaryMatch[1]) * 1000000 : result.salaryMin;
        }

        result.address = companyInfo.address || '';
        var thoi_gian_lv=extractWorkTime(result.jobResponsibility);
        if(thoi_gian_lv.workTimeStart && thoi_gian_lv.workTimeEnd){
            result.workTimeStart = thoi_gian_lv.workTimeStart;
            result.workTimeEnd = thoi_gian_lv.workTimeEnd;
        }
    }

    // ================================
    // NGUỒN VIETNAMWORKS
    // ================================
    if (source === 'vietnamworks') {
        result.jobTitle = data.jobtitle || '';
        result.jobName = result.jobTitle;

        result.jobResponsibility = data.jobdescription?.replace(/<[^>]+>/g, '') || '';
        result.jobRequirement = data.jobrequirement?.replace(/<[^>]+>/g, '') || '';

        // Nếu có headcount thì lấy làm số lượng tuyển
        if (parseInt(data.headcount) > 0) {
            result.recruitmentNumber = parseInt(data.headcount);
        }

        result.salaryMin = parseInt(data.salarymin) || -1;
        result.salaryMax = parseInt(data.salarymax) || -1;
    
        if (result.salaryMin > 0 && result.salaryMax === 0) {
            result.salaryMax = result.salaryMin;
        }
    
        if (result.salaryMin > 0 && result.salaryMin <= 100) {
            result.salaryMin *= 1000000;
        }
        if (result.salaryMax > 0 && result.salaryMax <= 100) {
            result.salaryMax *= 1000000;
        }

        result.address = data.address || '';

        // ================================
        // Nếu Vietnamworks có thông tin kinh nghiệm và học vấn
        // ================================
        result.demandWorkExperienceYears = parseInt(data.experience) || 0;
        result.demandEducation = parseInt(data.education) || 0;
        result.employeeBenefits = JSON.parse(data.benefits) || [];
        var thoi_gian_lv=extractWorkTime(result.jobResponsibility+result.jobRequirement);
        if(thoi_gian_lv.workTimeStart && thoi_gian_lv.workTimeEnd){
            result.workTimeStart = thoi_gian_lv.workTimeStart;
            result.workTimeEnd = thoi_gian_lv.workTimeEnd;
        }
    }

    // ====================================
    // XỬ LÝ LƯƠNG (tự động convert triệu)
    // ====================================
    if (result.salaryMin > 0 && result.salaryMin <= 100) {
        result.salaryMin *= 1000000;
    }
    if (result.salaryMax > 0 && result.salaryMax <= 100) {
        result.salaryMax *= 1000000;
    }

    if (result.salaryMin > 0 && result.salaryMax === 0) {
        result.salaryMax = result.salaryMin;
    }

    // ====================================
    // TÍNH salaryRangeId
    // ====================================
    const khoang_luong = getSalaryRange(result.salaryMin, result.salaryMax);
    result.salaryRangeId= khoang_luong.salaryRangeId || 6; // 面议 (thỏa thuận)
    result.salaryMin = khoang_luong.salaryMin || -1;
    result.salaryMax = khoang_luong.salaryMax || -1;
    // ====================================
    // MATCH ĐỊA CHỈ
    // ====================================
    const area = smartMatch(result.address, vn_city);
    result.areaProvinceId = area.areaProvinceId || 0;
    result.areaCityId = area.areaCityId || 0;
    result.areaDistrictId = area.areaDistrictId || 0;

    return result;
}

function getSalaryRange(salaryMin, salaryMax) {
    salaryMin = parseInt(salaryMin || -1);
    salaryMax = parseInt(salaryMax || -1);

    // Danh sách khoảng lương theo quy ước của API
    const ranges = [
        { id: 1, min: 500 * 10000, max: 1000 * 10000 },
        { id: 2, min: 1000 * 10000, max: 2000 * 10000 },
        { id: 3, min: 2000 * 10000, max: 4000 * 10000 },
        { id: 4, min: 4000 * 10000, max: 8000 * 10000 },
        { id: 5, min: 8000 * 10000, max: 16000 * 10000 }
    ];

    let salaryRangeId = 6; // Mặc định là 面议 (thỏa thuận)
    let matchedRanges = [];

    // Kiểm tra nếu lương không hợp lệ, giữ nguyên mức lương là 0 và trả về 面议
    if (salaryMin <= 0 || salaryMax <= 0 || salaryMin > salaryMax) {
        return {
            salaryMin: -1,
            salaryMax: -1,
            salaryRangeId: 6 // 面议
        };
    }

    // Tìm tất cả khoảng lương phù hợp
    for (const range of ranges) {
        if (!(salaryMax < range.min || salaryMin > range.max)) {
            matchedRanges.push(range);
        }
    }

    // Nếu tìm thấy ít nhất một khoảng lương phù hợp, lấy khoảng cao nhất
    if (matchedRanges.length > 0) {
        let highestRange = matchedRanges[matchedRanges.length - 1];
        return {
            salaryMin: highestRange.min,
            salaryMax: highestRange.max,
            salaryRangeId: highestRange.id
        };
    }

    return {
        salaryMin: -1,
        salaryMax: -1,
        salaryRangeId: 6 // 面议
    };
}

const vn_city = JSON.parse(fs.readFileSync(path.join(__dirname, 'vn_city.json'), 'utf8'));

// =========================
// 🟣 UTILITIES
// =========================
function normalize(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Jaro-Winkler Similarity để đánh giá mức độ giống nhau giữa hai chuỗi
function jaroWinkler(s1, s2) {
    if (!s1 || !s2) return 0;
    const m = Math.max(s1.length, s2.length);
    let matches = 0;
    let transpositions = 0;
    
    const matchWindow = Math.floor(m / 2) - 1;
    const matched1 = new Array(s1.length).fill(false);
    const matched2 = new Array(s2.length).fill(false);
    
    // Đếm số ký tự trùng nhau
    for (let i = 0; i < s1.length; i++) {
        for (let j = Math.max(0, i - matchWindow); j < Math.min(s2.length, i + matchWindow + 1); j++) {
            if (s1[i] === s2[j] && !matched2[j]) {
                matched1[i] = matched2[j] = true;
                matches++;
                break;
            }
        }
    }
    
    if (matches === 0) return 0;
    
    // Đếm số lần đổi chỗ
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
        if (matched1[i]) {
            while (!matched2[k]) k++;
            if (s1[i] !== s2[k]) transpositions++;
            k++;
        }
    }
    
    transpositions /= 2;
    const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;
    const prefix = s1.startsWith(s2.slice(0, 4)) ? Math.min(4, s1.length) : 0;
    return jaro + (prefix * 0.1 * (1 - jaro));
}

function findMostSimilarObjectSmart(input, array, field = "job_category_name", preferLeft = false) {
    const inputNorm = normalize(input);
    const inputWords = inputNorm.split(' ').filter(Boolean);

    let best = null;
    let bestScore = 0;

    for (const obj of array) {
        const objNorm = normalize(obj[field] || "");
        if (!objNorm) continue;

        const objWords = objNorm.split(' ').filter(Boolean);
        if (objWords.length === 0) continue;

        // Tính số từ chung
        let common = objWords.filter(w => inputWords.includes(w)).length;

        // Kiểm tra cụm từ liền nhau
        let bonus = 0;
        for (let i = 0; i < inputWords.length - 1; i++) {
            let phrase = inputWords[i] + ' ' + inputWords[i + 1];
            if (objNorm.includes(phrase)) {
                bonus += 0.5;
            }
        }

        // Kiểm tra độ giống nhau bằng Jaro-Winkler
        let similarity = jaroWinkler(inputNorm, objNorm);

        // Kiểm tra nếu input là một phần của object name
        let substringBonus = objNorm.includes(inputNorm) ? 1 : 0;

        // Tính điểm tổng hợp
        const score = (common / inputWords.length) + bonus + similarity + substringBonus;

        if (score > bestScore) {
            bestScore = score;
            best = obj;
        }
    }

    return best;
}


function smartMatch(address, data) {
    // --- Tách riêng Việt Nam ---
    const defaultCountry = {
        name: 'Việt Nam',
        code: 0,
        'quan-huyen': [{ name: 'Tất cả', code: 0, 'vn-name': 'Tất cả' }]
    };
    const normAddress = normalize(address);

    // Phân tách theo nhiều ký tự đặc biệt
    const addressParts = normAddress.split(/[,;\-\/|]+/).map(part => part.trim()).reverse();

    let matchedProvince = null;
    let matchedDistrict = null;

    // Bước 1: Tìm tỉnh/thành phố
    for (const part of addressParts) {
        const foundProvince = findMostSimilarObjectSmart(part, data.filter(p => p.code !== 0), "name");
        if (foundProvince) {
            matchedProvince = foundProvince;
            break;
        }
    }

    if (!matchedProvince) {
        matchedProvince = defaultCountry; // fallback nếu không tìm ra
    }

    // Tìm District
    if (matchedProvince && matchedProvince["quan-huyen"]) {
        for (const part of addressParts) {
            const foundDistrict = findMostSimilarObjectSmart(part, matchedProvince["quan-huyen"], "name");
            if (foundDistrict) {
                matchedDistrict = foundDistrict;
                break;
            }
        }
    }

    // console.log("Matched Province:", matchedProvince);
    // console.log("Matched District:", matchedDistrict);

    return {
        areaProvinceId: matchedProvince ? matchedProvince.code : null,
        areaCityId: matchedDistrict ? matchedDistrict.code : null,
        areaDistrictId: matchedDistrict ? matchedDistrict.code : null
    };
}

function getClosestJobCategory(jobTitle, categories, language = 1) {
    let filtered = categories.filter(cat => cat.language === language||cat.language === 1);
    if (filtered.length === 0) {
        return {
            jobCategoryId1: 0,
            jobCategoryId2: 0,
            jobCategoryId3: 0,
            matchedJob: {},
            score: "0.00"
        };
    }

    // Ưu tiên danh mục có job_category_id có hơn 4 chữ số
    let priorityFiltered = filtered.filter(cat => cat.job_category_id.toString().length > 5);

    if (priorityFiltered.length > 0) {
        filtered = priorityFiltered;
    }

    const matchedJob = findMostSimilarObjectSmart(jobTitle, filtered, "job_category_name",true);
    // console.log("Matched Job:", matchedJob);
    if (!matchedJob || !matchedJob.job_category_id) {
        return {
            jobCategoryId1: 0,
            jobCategoryId2: 0,
            jobCategoryId3: 0,
            matchedJob: {},
            score: "0.00"
        };
    }

    const id = matchedJob.job_category_id;
    let jobCategoryId1 = 0, jobCategoryId2 = 0, jobCategoryId3 = 0;

    if (id >= 100000) { // 6 chữ số trở lên
        jobCategoryId3 = id;
        jobCategoryId2 = Math.floor(id / 100);
        jobCategoryId1 = Math.floor(id / 10000);
    } else if (id >= 1000) { // 4 chữ số
        jobCategoryId2 = id;
        jobCategoryId1 = Math.floor(id / 100);
    } else if (id >= 1) { // 2 chữ số
        jobCategoryId1 = id;
    }

    return {
        jobCategoryId1,
        jobCategoryId2,
        jobCategoryId3,
        matchedJob,
        score: "1.00"
    };
}

// Hàm chính
async function main() {
    console.time('⏱️ Tổng thời gian');

    const loginName = 'leducanh';
    const loginPasswd = md5Hash('123456');

    // const fidovnToken = await fidovn_login(loginName, loginPasswd);
    // if (!fidovnToken) return;

    const app_id = "fidovnemail";
    var du_lieu = await getData(app_id);
    const job_categoryData = await fetchAllRecords(app_id, 'fid_job_category');
    let categorys = job_categoryData
        .map(row => {
            try {
                return row.value;
            } catch (e) {
                console.warn('⚠️ Lỗi parse JSON từ TopCV:', row.value);
                return null;
            }
        });
    // console.log("✅ Danh sách danh mục công việc:", JSON.stringify(categorys));

    var doanh_nghiep = du_lieu.doanh_nghiep;
    // du_lieu.topcv.forEach((tin, index) => {
    //     var job = convertJobData(tin, "topcv");
    //     var linhvuc = getClosestJobCategory(job.jobTitle, categorys, 2);
    //     if (!linhvuc)
    //     {
    //         console.log("✅ Tìm ngành TopCV", job.jobTitle);
    //         console.log("✅ Linh vực:", linhvuc);
    //     }
    //     else if(linhvuc.jobCategoryId3 ===0) {
    //         console.log("✅ Tìm ngành TopCV", job.jobTitle);
    //         console.log("✅ Linh vực:", linhvuc);
    //     }
    //     else if (linhvuc.areaCityId===0) {
    //         console.log("✅ Tìm địa chỉ TopCV", job.address);
    //     }
    // });  
    // du_lieu.vietnamworks.forEach((tin, index) => {
    //     var job = convertJobData(tin, "vietnamworks");
    //     var linhvuc = getClosestJobCategory(job.jobTitle, categorys, 2);
    //     if (!linhvuc)
    //     {
    //         console.log("✅ Tìm ngành VietNamWorks", job.jobTitle);
    //         console.log("✅ Linh vực:", linhvuc);
    //     }
    //     else if(linhvuc.jobCategoryId3 ===0) {
    //         console.log("✅ Tìm ngành VietNamWorks", job.jobTitle);
    //         console.log("✅ Linh vực:", linhvuc);
    //     }
    //     else if (linhvuc.areaCityId===0) {
    //         console.log("✅ Tìm địa chỉ VietNamWorks", job.address);
    //     }
    // });   
    // return;
    var dsNhaTuyDung = [], dsNhaTuyDungDTT = [];
    // return;
    // 🔄 Trích xuất dữ liệu từ doanh_nghiep
    for (let company of doanh_nghiep) {
        if(company.name.toLowerCase().indexOf("topcv")!==-1 && company.name.toLowerCase().indexOf("vietnamwork")!==-1) continue; // Bỏ qua các công ty có tên chứa "tuyendung"
        let extraData = await getCompanyDetails(app_id, company.name); // 🔍 Lấy thông tin từ DB
        if (extraData)
            dsNhaTuyDungDTT.push({
                name: company.name,
                logo: company.logo || "",
                link: company.link || "",
                scale: company.scale || "",
                field: company.field || "",
                address: company.address || "",
                tax_code: extraData.tax_code || "",
                phone_number: extraData.phone_number || "",
                email: extraData.email || "",
                uuid: extraData.uuid || ""
            });
        dsNhaTuyDung.push({
            name: company.name,
            logo: company.logo || "",
            link: company.link || "",
            scale: company.scale || "",
            field: company.field || "",
            address: company.address || "",
            tax_code: extraData.tax_code || "",
            phone_number: extraData.phone_number || "",
            email: extraData.email || "",
            uuid: extraData.uuid || ""
        });
    }

    if (dsNhaTuyDungDTT.length > 0)
        console.log("✅ Đã lấy dữ liệu " + dsNhaTuyDungDTT.length + " doanh nghiệp thành công!", dsNhaTuyDungDTT[0]);
    


    // 1. Lọc danh sách doanh nghiệp có email hoặc số điện thoại
    const doanhNghiepCoThongTin = dsNhaTuyDungDTT.filter(item => item.email || item.phone);
    // 2. Tạo sheet đầu tiên
    const ws1 = XLSX.utils.json_to_sheet(doanhNghiepCoThongTin);
    const sheetName1 = "Doanh Nghiệp 📧📱 - 企业信息";  // Tiếng Việt + Tiếng Trung
    var tin_tuyen_dung = [];
    // 3. Tạo danh sách số tin tuyển dụng
    doanhNghiepCoThongTin.forEach(item => {
        const tinTopCV = du_lieu.topcv.filter(tin => 
            tin.company && JSON.parse(tin.company).name.toUpperCase().trim() === item.name.toUpperCase().trim()
        );

        const tinVNW = du_lieu.vietnamworks.filter(tin =>
            tin.companyname.toUpperCase().trim() === item.name.toUpperCase().trim()
        );
        for (const tin of tinTopCV) {
            var jobData = convertJobData(tin, "topcv");
            jobData["companyName"] = item.name;
            jobData.jobName = `${tin.title}`;
            jobData.postDays = 30;
            tin_tuyen_dung.push(jobData);
        }
        for (const tin of tinVNW) {
            var jobData = convertJobData(tin, "vietnamworks");
            jobData.jobName = `${tin.jobtitle}`;
            jobData["companyName"] = item.name;
            jobData.postDays = 30;
            tin_tuyen_dung.push(jobData);
        }
        // console.log("Số lượng tin",tinTopCV.length,tinVNW.length,tin_tuyen_dung.length);
    });

    // 4. Tạo sheet thứ hai
    const ws2 = XLSX.utils.json_to_sheet(tin_tuyen_dung);
    const sheetName2 = "Số Tin Tuyển Dụng 📋 - 招聘信息";  // Tiếng Việt + Tiếng Trung

    // 5. Tạo workbook và ghi vào file Excel
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, sheetName1);
    XLSX.utils.book_append_sheet(wb, ws2, sheetName2);

    XLSX.writeFile(wb, "DanhSachDoanhNghiep.xlsx");
    return;
    // var linhvuc = getClosestJobCategory(du_lieu.topcv[0].title, categorys, 2);
    // console.log("✅ Linh vực:", linhvuc, "Tên công việc:", du_lieu.topcv[0].title);
    // const area = smartMatch(JSON.parse(du_lieu.topcv[0].company).address, vn_city);
    // console.log("✅ Khu vực:", area, "Địa chỉ:", JSON.parse(du_lieu.topcv[0].company).address);
    // return;
    // dsNhaTuyDungDTT.forEach((dn, index) => {
    //     var tinTopCV = du_lieu.topcv.filter(function (tin) {
    //         if (!tin.company) return false;
    //         return JSON.parse(tin.company).name.toUpperCase().trim() === dn.name.toUpperCase().trim();
    //     });
    //     if(tinTopCV.length > 40) 
    //         console.log(`✅ TopCV có tất cả tin tuyển dụng (TopCV擁有全部招聘新聞) ${tinTopCV.length}`, dn);
    // });
    // return;
    const fidovnClientId = generateFidovnClientId();
    const fidovnToken = await fidovn_login(loginName, loginPasswd, fidovnClientId);
    console.log("✅ Đăng nhập thành công với fidovnToken:", fidovnToken);
    // Ensure testArr is initialized as an array
    var testArr = [dsNhaTuyDungDTT[3], dsNhaTuyDungDTT[4], dsNhaTuyDungDTT[5], dsNhaTuyDungDTT[6], dsNhaTuyDungDTT[7], dsNhaTuyDungDTT[8], dsNhaTuyDungDTT[9]];
    for (const item of dsNhaTuyDungDTT.filter(dn => dn.email || dn.phone_number)) {
        try {
            const imageUrl = item.logo;
            const fileName = imageUrl.split('/').pop();
            if (!fileName) continue;

            const sts = await getOssSts(fidovnToken, fileName, fidovnClientId);
            console.log("🖼️ Hình ảnh:", imageUrl, "📁 fileName:", fileName, "🔗 STS:", sts);

            const fileBuffer = await fetchImageAsBuffer(imageUrl);
            const ossUrl = await uploadToOss(fileBuffer, sts);
            console.log("✅ Link OSS:", ossUrl);

            const merchantData = item.email
                ? {
                    certificationType: 1,
                    userEmail: item.email,
                    userPasswd: md5Hash('123456789'),
                    merchantName: `${item.name} (AUTOTEST)`,
                    certificationRecruitment: 1,
                    certificationRealty: 0,
                    certificationDecoration: 0,
                    certificationCourse: 0,
                    logo: ossUrl || ''
                }
                : {
                    certificationType: 1,
                    userMobileCountryCode: '+84',
                    userMobileNumber: item.phone_number,
                    userPasswd: md5Hash('123456789'),
                    merchantName: `${item.name} (AUTOTEST)`,
                    certificationRecruitment: 1,
                    certificationRealty: 0,
                    certificationDecoration: 0,
                    certificationCourse: 0,
                    logo: ossUrl || ''
                };

            const taotaikhoan = await addMerchant(merchantData, fidovnToken, fidovnClientId);
            var limit=50;
            if (taotaikhoan.code.indexOf("HasRegistered") !== -1||taotaikhoan.code==="Success") {
                console.log("✅ Kết quả tạo tài khoản Merchant (建立帳戶結果):",merchantData, taotaikhoan);
                var fidovnClientIdMerchant = generateFidovnClientId(9);
                var tinTopCV = du_lieu.topcv.filter(function (tin) {
                    if (!tin.company) return false;
                    return JSON.parse(tin.company).name.toUpperCase().trim() === item.name.toUpperCase().trim();
                }).slice(0, limit);
                var tinVNW = du_lieu.vietnamworks.filter(tin => tin.companyname.toUpperCase().trim() === item.name.toUpperCase().trim()).slice(0, limit);
                // console.log("✅ Tin TopCV:",tinTopCV);
                // console.log("✅ Tin Vietnamworks:",tinVNW);
                var mToken = '';
                if (item.email) {
                    mToken = await fidovn_login(item.email, md5Hash('123456789'), fidovnClientIdMerchant, "loginByEmail");
                    console.log("✅ Đăng nhập thành công Merchant " + item.email + " với token:", mToken);
                }
                else if (item.mobileNumber) {
                    mToken = await fidovn_login(item.mobileNumber, md5Hash('123456789'), fidovnClientIdMerchant, "loginByMobile");
                    console.log("✅ Đăng nhập thành công Merchant " + item.mobileNumber + " với token:", mToken);
                }
                if (mToken) {
                    console.log("✅ Đăng nhập thành công Merchant với token:", mToken);
                    for (const tin of tinTopCV) {
                        var jobData = convertJobData(tin, "topcv");
                        jobData.jobName = `${tin.title} (AUTOTEST)`;
                        jobData.postDays = 30;
                        var linhvuc = getClosestJobCategory(jobData.jobTitle, categorys, 2);
                        console.log("✅ Tìm ngành", jobData.jobTitle);
                        console.log("✅ Linh vực:", linhvuc);
                        if (linhvuc) {
                            jobData.jobCategoryId1 = linhvuc.jobCategoryId1;
                            jobData.jobCategoryId2 = linhvuc.jobCategoryId2;
                            jobData.jobCategoryId3 = linhvuc.jobCategoryId3;
                            await postJob(jobData, mToken, fidovnClientIdMerchant);
                            await sleep(2000);
                        }
                    }
                    for (const tin of tinVNW) {
                        var jobData = convertJobData(tin, "vietnamworks");
                        jobData.jobName = `${tin.jobtitle} (AUTOTEST)`;
                        jobData.postDays = 30;
                        var linhvuc = getClosestJobCategory(jobData.jobTitle, categorys, 2);
                        if (linhvuc) {
                            jobData.jobCategoryId1 = linhvuc.jobCategoryId1;
                            jobData.jobCategoryId2 = linhvuc.jobCategoryId2;
                            jobData.jobCategoryId3 = linhvuc.jobCategoryId3;
                            await postJob(jobData, mToken, fidovnClientIdMerchant);
                            await sleep(2000);
                        }
                    }
                }
            }
            // if(taotaikhoan.code==="SystemError")
            //     console.error("❌ Lỗi hệ thống:", taotaikhoan.message, "Vui lòng kiểm tra lại!");
            // else if(taotaikhoan.code==="Success")
            //     console.log("✅ Tạo tài khoản thành công:", merchantData, taotaikhoan);
            // Gọi hàm
            // await retryAddMerchant(merchantData, fidovnToken, fidovnClientId);
        } catch (error) {
            console.error("❌ Lỗi khi xử lý nhà tuyển dụng(處理招募人員時出錯):", item.name, error);
        }

        // Chờ 1 giây trước khi tiếp tục phần tử tiếp theo
        await sleep(5000);
    }

    console.timeEnd('⏱️ Tổng thời gian');
}

function generateNumericId(existingIds) {
    let id = 100000000; // Bắt đầu từ 100 triệu (9 chữ số)
    while (existingIds.has(id)) {
        id++; // Tăng dần để tránh trùng ID
    }
    existingIds.add(id);
    return id;
}
async function getData(app_id) {
    try {
        const topcvData = await fetchAllRecords(app_id, 'fid_topcv');
        const vietnamworksData = await fetchAllRecords(app_id, 'fid_vietnamworks');

        // Trích xuất dữ liệu từ TopCV
        let extractedTopcv = topcvData
            .map(row => {
                try {
                    return row.value;
                } catch (e) {
                    console.warn('⚠️ Lỗi parse JSON từ TopCV:', row.value);
                    return null;
                }
            })
            .filter(company => company); // Loại bỏ null

        // Trích xuất dữ liệu từ VietnamWorks
        let extractedVietnamworks = vietnamworksData
            .map(row => {
                try {
                    return row.value;
                } catch (e) {
                    console.warn('⚠️ Lỗi parse JSON từ VietnamWorks:', row.value);
                    return null;
                }
            })
            .filter(company => company); // Loại bỏ null

        console.log(`✅ Số công ty TopCV: ${extractedTopcv.length}, VietnamWorks: ${extractedVietnamworks.length}`);

        // Hợp nhất dữ liệu
        return { topcv: extractedTopcv, vietnamworks: extractedVietnamworks, doanh_nghiep: mergeCompanies(extractedTopcv, extractedVietnamworks) };
        // let mergedData = await mergeCompanies(app_id, extractedTopcv, extractedVietnamworks);

        // Đảm bảo mergedData là một mảng
        // if (!Array.isArray(mergedData)) {
        //     throw new Error("mergeCompanies() không trả về mảng hợp lệ");
        // }

        // // ✅ Bổ sung dữ liệu nếu còn thiếu
        // for (let company of mergedData) {
        //     if (!company.address || !company.field) {
        //         let additionalData = await findByCompanyName(app_id, 'fid_doanhnghiep', company.name);

        //         // Nếu không tìm thấy, giữ nguyên giá trị hiện tại
        //         if (additionalData) {
        //             company.address = company.address || additionalData.address || "";
        //             company.field = company.field || additionalData.field || "";
        //             company.tax_code = additionalData.tax_code || company.tax_code || "";
        //             company.phone_number = additionalData.phone_number || company.phone_number || "";
        //             company.email = additionalData.email || company.email || "";
        //             company.uuid = additionalData.uuid || company.uuid || "";
        //         }
        //     }
        // }

        // return mergedData;
    } catch (error) {
        console.error('❌ Lỗi khi truy xuất dữ liệu:', error);
        return [];
    }
}

async function mergeCompanies1(app_id, arr1, arr2) {
    let merged = new Map();
    let idCounter = 100000000; // Bắt đầu với ID 9 chữ số

    // 🛠 Hàm chuẩn hóa tên công ty (tránh lỗi key rỗng)
    function normalizeCompanyName(name) {
        if (!name || typeof name !== "string") return null;
        return name.trim().toUpperCase();
    }

    // 🏢 Hàm lấy dữ liệu bổ sung từ DB
    async function getCompanyDetails(name) {
        if (!name) {
            console.warn("⚠️ Bỏ qua truy vấn với tên rỗng");
            return {};
        }
        try {
            let dbInfo = await findByCompanyName(app_id, 'fid_doanhnghiep', name);
            if (!dbInfo) {
                dbInfo = await findByCompanyName(app_id, 'fid_doanhnghiep', name.toLowerCase());
            }
            return dbInfo || {};
        } catch (error) {
            console.error(`❌ Lỗi khi tìm công ty: ${name}`, error);
            return {};
        }
    }

    // 🔄 Trích xuất dữ liệu từ arr1 (TopCV)
    for (let company of arr1) {
        let name = normalizeCompanyName(company.name);
        if (!name) continue; // ⚠️ Bỏ qua công ty không có tên

        if (!merged.has(name)) {
            let extraData = await getCompanyDetails(name); // 🔍 Lấy thông tin từ DB
            merged.set(name, {
                id: idCounter++,
                name: name,
                logo: company.logo || "",
                link: company.link || "",
                scale: company.scale || "",
                field: company.field || "",
                address: company.address || "",
                tax_code: extraData.tax_code || "",
                phone_number: extraData.phone_number || "",
                email: extraData.email || "",
                uuid: extraData.uuid || ""
            });
        }
    }

    // 🔄 Thêm dữ liệu từ arr2 (VietnamWorks)
    for (let company of arr2) {
        let name = normalizeCompanyName(company.companyname);
        if (!name) continue; // ⚠️ Bỏ qua công ty không có tên

        if (merged.has(name)) {
            let existing = merged.get(name);
            merged.set(name, {
                ...existing,
                logo: existing.logo || company.companylogo || "",
                scale: existing.scale || company.companysizevi || "",
                link: existing.link || company.companyurl || ""
            });
        } else {
            let extraData = await getCompanyDetails(name); // 🔍 Lấy thông tin từ DB
            merged.set(name, {
                id: company.companyid || idCounter++,
                name: name,
                logo: company.companylogo || "",
                link: company.companyurl || "",
                scale: company.companysizevi || "",
                field: "",
                address: "",
                tax_code: extraData.tax_code || "",
                phone_number: extraData.phone_number || "",
                email: extraData.email || "",
                uuid: extraData.uuid || ""
            });
        }
    }

    return Array.from(merged.values());
}

function mergeCompanies(arr1, arr2) {
    let merged = new Map();
    let existingIds = new Set(); // Lưu các ID đã tồn tại

    // Xử lý arr1 (TopCV)
    arr1.forEach(row => {
        let company = row.company ? JSON.parse(row.company) : {};
        if (company.name) {
            let name = company.name.trim().toUpperCase();
            if (!merged.has(name)) {
                let id = generateNumericId(existingIds); // Tạo ID mới
                merged.set(name, {
                    id,
                    name: company.name.toUpperCase(),
                    logo: company.logo || "",
                    link: company.link || "",
                    scale: company.scale || "",
                    field: company.field || "",
                    address: company.address || ""
                });
            }
        }
    });

    // Xử lý arr2 (VietnamWorks)
    arr2.forEach(company => {
        let name = company.companyname.trim().toUpperCase();
        let companyId = company.companyid ? String(company.companyid).padStart(9, '0') : generateNumericId(existingIds);

        if (merged.has(name)) {
            let existing = merged.get(name);
            merged.set(name, {
                ...existing,
                id: existing.id, // Giữ nguyên ID đã có
                logo: existing.logo || company.companylogo || "",
                scale: existing.scale || company.companysizevi || "",
                link: existing.link || company.companyurl || ""
            });
        } else {
            merged.set(name, {
                id: Number(companyId),
                name: company.companyname.toUpperCase(),
                logo: company.companylogo || "",
                link: company.companyurl || "",
                scale: company.companysizevi || "",
                field: "",
                address: ""
            });
        }
    });

    return Array.from(merged.values());
}
main();