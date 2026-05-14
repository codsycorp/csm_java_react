/**
 * Xử lý Zalo Data → ServiceDetails
 * Dùng csm_ai_generate_seo_content để tạo SEO content
 * Copy code này vào auto_code trong sys_autos
 */

// ===== CONFIGURATION =====
const UPLOAD_ENDPOINT = "/upload.shtml";
const APP_ID = "wuweb";
const DOMAIN = "csmbridge.net";
const API_URL = "https://api.csmbridge.net";
const CSM_TOKEN = "4d543bb4-714c-4bb1-952f-a2e0bf8b24a3";

// ===== HELPER FUNCTIONS =====

/**
 * Tạo slug từ text (tiếng Việt)
 */
function generateSlug(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");
}

/**
 * Parse thông tin từ Zalo content
 */
function parseZaloContent(content) {
  const lines = content.split("\n").filter(line => line.trim() && !line.startsWith("#"));

  return {
    title: lines[0]?.trim() || "Bất động sản",
    description: lines.slice(0, 3).join(" ").trim(),
    location: lines.find(l => /phường|quận|huyện|thành phố/i.test(l))?.trim(),
    area: lines.find(l => /dt|cn|m2|diện tích/i.test(l))?.trim(),
    price: lines.find(l => /tỷ|triệu|giá/i.test(l))?.trim(),
    contact: lines.find(l => /0\d{9}|\d{3}\s\d{3}/i.test(l))?.trim(),
  };
}

/**
 * Upload base64 image lên server
 */
async function uploadBase64Image(base64Data, filename) {
  try {
    const normalizedName = (filename || `image-${Date.now()}.png`)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
      .replace(/[èéẹẻẽêềếệểễ]/g, "e")
      .replace(/[ìíịỉĩ]/g, "i")
      .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
      .replace(/[ùúụủũưừứựửữ]/g, "u")
      .replace(/[ỳýỵỷỹ]/g, "y")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9.\-]/g, "");

    const uploadData = {
      app_id: APP_ID,
      name: normalizedName,
      src: base64Data,
    };

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploadData),
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

    const imagePath = await response.text();
    return imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  } catch (error) {
    console.error("❌ Upload image error:", error);
    throw error;
  }
}

/**
 * Upload multiple base64 images
 */
async function uploadMultipleImages(base64Images) {
  const uploadPromises = base64Images.map((base64, index) =>
    uploadBase64Image(base64, `zalo-${Date.now()}-${index}.png`)
  );

  return Promise.all(uploadPromises);
}

/**
 * Tạo unique ID
 */
function generateId() {
  const now = new Date().toISOString().replace(/[-:T.Z]/g, "");
  const random = Math.random().toString(36).substring(2, 14);
  return `web_${now}_${random}`;
}

/**
 * MAIN FUNCTION: Chuyển đổi Zalo → ServiceDetail
 */
async function processZaloMessage(zaloData, options = {}) {
  const {
    serviceType = "bat-dong-san",
    author = zaloData.sender || "Admin",
    featured = false,
    activeHome = true,
    priority = 10,
  } = options;

  try {
    console.log("🚀 Processing Zalo message...");
    
    // 1️⃣ Parse content
    console.log("📝 Parsing content...");
    const parsed = parseZaloContent(zaloData.content);

    // 2️⃣ Upload images
    console.log(`🖼️  Uploading ${zaloData.images.length} images...`);
    const uploadedImages = await uploadMultipleImages(zaloData.images);
    console.log("✅ Images uploaded:", uploadedImages);

    // 3️⃣ Generate SEO content
    console.log("🤖 Generating SEO content...");
    const seoContent = await new Promise((resolve, reject) => {
      window.csmAI.csm_ai_generate_seo_content(
        "Bất động sản",
        parsed.title,
        `${parsed.area || ""}\n${parsed.price || ""}\n${parsed.contact || ""}`,
        parsed.title.split(",")[0] || parsed.title,
        [
          "bất động sản",
          "mua bán",
          "cho thuê",
          parsed.location?.split(",").slice(-1)[0]?.trim() || "",
        ].filter(k => k.trim()),
        function (result) {
          if (result.success && result.data) {
            resolve(result.data);
          } else {
            reject(new Error(result.error || "Failed to generate SEO content"));
          }
        }
      );
    });

    console.log("✅ SEO content generated");

    // 4️⃣ Create ServiceDetail object
    const now = new Date().toISOString();
    const publishDate = now.split("T")[0];
    const id = generateId();
    const { title, description, html_content } = seoContent;

    const serviceDetail = {
      id,
      service_type: serviceType,
      slug: generateSlug(title),
      title,
      title_en: title,
      title_zh: title,
      keywords: description.substring(0, 100),
      keywords_en: description.substring(0, 100),
      keywords_zh: description.substring(0, 100),
      excerpt: description,
      excerpt_en: description,
      excerpt_zh: description,
      content: html_content,
      content_en: "",
      content_zh: "",
      image: uploadedImages[0],
      author,
      avatar: "https://www.csmbridge.net/media/icon.png",
      publishDate,
      readTime: "5 phút",
      views: 0,
      tags: [serviceType, "mua-ban", "cho-thue"],
      thumbnail: uploadedImages[0],
      images: JSON.stringify(uploadedImages),
      activeHome,
      featured,
      priority,
      serviceType,
      created_at: now,
      updated_at: now,
      status: "active",
      domain: DOMAIN,
    };

    console.log("✅ ServiceDetail created:", {
      id: serviceDetail.id,
      title: serviceDetail.title,
      images: uploadedImages.length,
    });

    return serviceDetail;
  } catch (error) {
    console.error("❌ Processing failed:", error.message);
    throw error;
  }
}

/**
 * Save ServiceDetail vào database
 */
async function saveServiceDetail(detail) {
  try {
    console.log("💾 Saving to database...");
    
    const payload = {
      app_id: APP_ID,
      obj_name: "web_service_detail",
      command: "insert",
      obj_update: detail,
    };

    const response = await fetch(`${API_URL}/update-table-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "csm-token": CSM_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("✅ Save result:", result);
    return result;
  } catch (error) {
    console.error("❌ Save error:", error);
    throw error;
  }
}

/**
 * Batch process multiple Zalo messages
 */
async function processMultipleZaloMessages(zaloMessages, options = {}) {
  const results = [];
  const startPriority = options.startPriority || 10;

  for (let i = 0; i < zaloMessages.length; i++) {
    const msg = zaloMessages[i];
    console.log(`\n[${i + 1}/${zaloMessages.length}] Processing message from ${msg.sender}...`);

    try {
      const detail = await processZaloMessage(msg, {
        ...options,
        priority: startPriority + i,
      });
      results.push(detail);
      console.log(`✅ Done`);

      // Delay để tránh rate limit
      if (i < zaloMessages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
    }
  }

  return results;
}

// ===== AUTO_CODE USAGE =====

/**
 * Copy code này vào auto_code trong sys_autos
 * Paste dữ liệu Zalo vào biến zaloMessages
 */

// EXAMPLE: Dữ liệu từ Zalo
const zaloMessages = [
  {
    sender: "FC Tường Fe",
    content: `107 Nguyễn Thị Thập, Phường Tân Phú, Q7
DT : 11.7x 29 CN 318,5m2
Kết cấu: Trệt 1 lầu
Vị trí gần Nguyễn Văn Linh
Giá bán: 95 tỷ bớt lộc
Liên hệ: 0934 161816 Tường Villa`,
    images: [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAn8AAAFwCAYAAADJ8B2zAA...",
      // Thêm các images khác nếu có
    ],
  },
  // Thêm nhiều messages khác nếu cần
];

/**
 * RUN: Chạy code để xử lý
 */
async function runAutoCode() {
  try {
    thongbao("🚀 Starting Zalo data processing...");

    // Process all messages
    const serviceDetails = await processMultipleZaloMessages(zaloMessages, {
      serviceType: "bat-dong-san",
      author: "Mr.Anh",
      featured: false,
      activeHome: true,
      startPriority: 10,
    });

    console.log(`\n✅ Processed ${serviceDetails.length} messages\n`);

    // Save all to database
    const saveResults = [];
    for (let i = 0; i < serviceDetails.length; i++) {
      const detail = serviceDetails[i];
      console.log(`\nSaving ${i + 1}/${serviceDetails.length}: ${detail.title}`);

      try {
        const result = await saveServiceDetail(detail);
        saveResults.push({ success: true, result });
        thongbao(`✅ Saved: ${detail.title}`);
      } catch (error) {
        saveResults.push({ success: false, error: error.message });
        canhbao(`❌ Failed: ${error.message}`);
      }

      // Delay giữa các saves
      if (i < serviceDetails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = saveResults.filter(r => r.success).length;
    console.log(`\n✅ Saved ${successCount}/${serviceDetails.length} items successfully!\n`);
    thongbao(`✅ Completed! ${successCount}/${serviceDetails.length} saved successfully`);

  } catch (error) {
    console.error("❌ Error:", error);
    canhbao(`❌ Error: ${error.message}`);
  }
}

// Export functions để sử dụng
window.zaloProcessor = {
  processZaloMessage,
  processMultipleZaloMessages,
  saveServiceDetail,
  generateSlug,
  parseZaloContent,
  runAutoCode,
};

console.log("✅ Zalo Processor loaded!");
console.log("Usage: window.zaloProcessor.runAutoCode()");
