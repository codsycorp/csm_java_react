/*
  push_web_structure_4menus.js
  Run this in browser console on admin page where window.csmApi is available.

  Goal:
  1) Restructure top navigation into 4 pillars.
  2) Seed a legal-safe lottery statistics landing content.
  3) Keep data model compatible with frontend-web dynamic menu renderer.
*/

(async function pushWebStructure4Menus() {
  const APP_ID = "wuweb";
  const DOMAIN = "csmbridge.net,localhost:3333";

  if (typeof window === "undefined" || !window.csmApi) {
    throw new Error("window.csmApi is not available. Open this in the website admin runtime.");
  }

  if (typeof window.csmApi.updateTableData !== "function") {
    throw new Error("window.csmApi.updateTableData is not a function.");
  }

  const now = Date.now();

  const upsert = async (objName, row, pkFields) => {
    const payload = {
      app_id: APP_ID,
      obj_name: objName,
      command: "update",
      pk_fields: pkFields,
      obj_update: {
        ...row,
        app_id: APP_ID,
        domain: DOMAIN,
        status: row.status || "active",
        updated_at: now,
      },
    };

    return window.csmApi.updateTableData(payload);
  };

  const menuRows = [
    {
      id: "chuyen-gia-phan-mem",
      service_code: "chuyen-gia-phan-mem",
      slug: "chuyen-gia-phan-mem",
      category: "Chuyen Gia Phan Mem",
      category_en: "Custom Software Expert",
      category_zh: "定制软件专家",
      is_service: true,
      is_group_slug: true,
      is_group_slug_default: false,
      group_slug: "",
      attributes_icon: "CodeOutlined",
      attributes_color: "#1677ff",
      attributes_priority: 1,
      attributes_title: "Chuyen Gia Viet Phan Mem Theo Yeu Cau",
      attributes_description: "Hon 20 nam kinh nghiem fullstack, tu van va trien khai phan mem theo bai toan doanh nghiep.",
      attributes_keywords: "chuyen gia phan mem, viet phan mem theo yeu cau, lap trinh fullstack"
    },
    {
      id: "viet-phan-mem-theo-yeu-cau",
      service_code: "viet-phan-mem-theo-yeu-cau",
      slug: "viet-phan-mem-theo-yeu-cau",
      category: "Viet Phan Mem Theo Yeu Cau",
      category_en: "Custom Software Development",
      category_zh: "定制软件开发",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: true,
      group_slug: "chuyen-gia-phan-mem",
      attributes_icon: "ToolOutlined",
      attributes_color: "#1677ff",
      attributes_priority: 1,
      attributes_title: "Dich Vu Viet Phan Mem Theo Yeu Cau",
      attributes_description: "Phan tich bai toan, thiet ke he thong, code, van hanh va bao tri.",
      attributes_keywords: "viet phan mem theo yeu cau, outsourcing phan mem, giai phap doanh nghiep"
    },
    {
      id: "dich-vu-phan-mem",
      service_code: "dich-vu-phan-mem",
      slug: "dich-vu-phan-mem",
      category: "Dich Vu Phan Mem",
      category_en: "Software Services",
      category_zh: "软件服务",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      group_slug: "chuyen-gia-phan-mem",
      attributes_icon: "AppstoreOutlined",
      attributes_color: "#0958d9",
      attributes_priority: 2,
      attributes_title: "Cac Dich Vu Phan Mem Va Automation",
      attributes_description: "Tich hop API, AI automation, bao cao du lieu, quy trinh so hoa.",
      attributes_keywords: "automation, tich hop API, phan mem doanh nghiep"
    },
    {
      id: "thong-ke-ket-qua-xo-so",
      service_code: "thong-ke-ket-qua-xo-so",
      slug: "thong-ke-ket-qua-xo-so",
      category: "Thong Ke Ket Qua Xo So",
      category_en: "Lottery Statistics",
      category_zh: "彩票统计",
      is_service: true,
      is_group_slug: true,
      is_group_slug_default: false,
      group_slug: "",
      attributes_icon: "BarChartOutlined",
      attributes_color: "#13c2c2",
      attributes_priority: 2,
      attributes_title: "Landingpage Thong Ke Du Lieu Xo So",
      attributes_description: "Thong ke du lieu minh bach, chi de tham khao, khong phai khuyen nghi co bac.",
      attributes_keywords: "thong ke ket qua xo so, thong ke giai dac biet, lo gan mien bac"
    },
    {
      id: "phan-tich-du-lieu-xo-so",
      service_code: "phan-tich-du-lieu-xo-so",
      slug: "phan-tich-du-lieu-xo-so",
      category: "Phan Tich Du Lieu Xo So",
      category_en: "Lottery Data Analysis",
      category_zh: "彩票数据分析",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: true,
      group_slug: "thong-ke-ket-qua-xo-so",
      attributes_icon: "FundOutlined",
      attributes_color: "#08979c",
      attributes_priority: 1,
      attributes_title: "Phan Tich Du Lieu Xo So Theo Phuong Phap Minh Bach",
      attributes_description: "Huong dan doc xu huong du lieu lich su, khong du doan ket qua, khong khuyen khich co bac.",
      attributes_keywords: "phan tich du lieu xo so, thong ke mien bac 100 ngay"
    },
    {
      id: "cau-noi-kinh-doanh-online",
      service_code: "cau-noi-kinh-doanh-online",
      slug: "cau-noi-kinh-doanh-online",
      category: "Cau Noi Kinh Doanh Online",
      category_en: "Online Business Bridge",
      category_zh: "在线商业桥梁",
      is_service: true,
      is_group_slug: true,
      is_group_slug_default: false,
      group_slug: "",
      attributes_icon: "GlobalOutlined",
      attributes_color: "#722ed1",
      attributes_priority: 3,
      attributes_title: "Cau Noi Kinh Doanh Da Linh Vuc",
      attributes_description: "Mo rong kinh doanh online cho my pham, bat dong san, xe dich vu va dat lich.",
      attributes_keywords: "kinh doanh online, cau noi da linh vuc, mo rong kenh ban"
    },
    {
      id: "bat-dong-san",
      service_code: "bat-dong-san",
      slug: "bat-dong-san",
      category: "Bat Dong San",
      category_en: "Real Estate",
      category_zh: "房地产",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      group_slug: "cau-noi-kinh-doanh-online",
      attributes_icon: "HomeOutlined",
      attributes_color: "#13c2c2",
      attributes_priority: 1
    },
    {
      id: "lam-dep-my-pham",
      service_code: "lam-dep-my-pham",
      slug: "lam-dep-my-pham",
      category: "My Pham Lam Dep",
      category_en: "Beauty & Cosmetics",
      category_zh: "美容化妆品",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      group_slug: "cau-noi-kinh-doanh-online",
      attributes_icon: "SkinOutlined",
      attributes_color: "#eb2f96",
      attributes_priority: 2
    },
    {
      id: "cho-thue-xe",
      service_code: "cho-thue-xe",
      slug: "cho-thue-xe",
      category: "Cho Thue Xe 4-7 Cho",
      category_en: "Car Rental",
      category_zh: "租车服务",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      group_slug: "cau-noi-kinh-doanh-online",
      attributes_icon: "CarOutlined",
      attributes_color: "#faad14",
      attributes_priority: 3
    },
    {
      id: "booking-online",
      service_code: "booking-online",
      slug: "booking-online",
      category: "Dat Lich Online",
      category_en: "Online Booking",
      category_zh: "在线预订",
      is_service: true,
      is_group_slug: false,
      is_group_slug_default: false,
      group_slug: "cau-noi-kinh-doanh-online",
      attributes_icon: "CalendarOutlined",
      attributes_color: "#faad14",
      attributes_priority: 4
    }
  ];

  const kqxsLanding = {
    slug: "thong-ke-ket-qua-xo-so-minh-bach",
    service_code: "phan-tich-du-lieu-xo-so",
    service_type: "phan-tich-du-lieu-xo-so",
    title: "Thong ke ket qua xo so: huong dan doc du lieu minh bach",
    title_en: "Lottery statistics: transparent data reading guide",
    title_zh: "彩票统计：透明数据解读指南",
    excerpt: "Thong ke du lieu lich su de tham khao, khong khuyen nghi co bac.",
    excerpt_en: "Historical data for reference only, not gambling advice.",
    excerpt_zh: "历史数据仅供参考，不构成赌博建议。",
    content: "<h1>Thong Ke Ket Qua Xo So: Doc Du Lieu Minh Bach</h1><p>Noi dung chi mang tinh tham khao du lieu, khong khuyen khich va khong to chuc co bac.</p><h2>3 Nguyen Tac</h2><ul><li>Phan biet lich su va du doan.</li><li>So sanh theo 7-30-100 ngay.</li><li>Khong ket luan bang 1 chi so don le.</li></ul>",
    content_en: "<h1>Lottery Statistics: Transparent Data Reading</h1><p>This content is for data reference only and does not encourage gambling.</p>",
    content_zh: "<h1>彩票统计：透明数据解读</h1><p>本内容仅供数据参考，不鼓励赌博行为。</p>",
    attributes_title: "Thong ke ket qua xo so minh bach: giai dac biet, lo gan mien bac",
    attributes_title_en: "Transparent lottery statistics: special prize and overdue numbers",
    attributes_title_zh: "透明的彩票统计：特别奖与遗漏分析",
    attributes_description: "Xem thong ke ket qua xo so theo phuong phap minh bach. Noi dung chi mang tinh tham khao du lieu.",
    attributes_description_en: "Read lottery statistics with a transparent method. Data reference only.",
    attributes_description_zh: "以透明方法查看彩票统计。仅供数据参考。",
    attributes_keywords: "thong ke ket qua xo so, thong ke giai dac biet, lo gan mien bac, thong ke 100 ngay",
    attributes_keywords_en: "lottery statistics, special prize statistics, overdue numbers, 100-day statistics",
    attributes_keywords_zh: "彩票统计, 特别奖统计, 遗漏数据, 100天统计",
    tags: JSON.stringify(["kqxs", "du-lieu", "tham-khao"]),
    featured: 1,
    active_home: 1,
    publish_date: new Date().toISOString(),
  };

  const menuPk = ["slug", "domain", "status"];
  const detailPk = ["slug", "domain", "status"];

  let ok = 0;
  let fail = 0;

  console.log("[4-menu] Start push web_services...");
  for (const row of menuRows) {
    try {
      await upsert("web_services", row, menuPk);
      ok += 1;
      console.log(`[OK] web_services ${row.slug}`);
    } catch (err) {
      fail += 1;
      console.error(`[FAIL] web_services ${row.slug}`, err);
    }
  }

  console.log("[4-menu] Push SEO-safe KQXS landing...");
  try {
    await upsert("web_service_detail", kqxsLanding, detailPk);
    ok += 1;
    console.log(`[OK] web_service_detail ${kqxsLanding.slug}`);
  } catch (err) {
    fail += 1;
    console.error(`[FAIL] web_service_detail ${kqxsLanding.slug}`, err);
  }

  console.log("[4-menu] DONE", { ok, fail, appId: APP_ID, domain: DOMAIN });
})();
