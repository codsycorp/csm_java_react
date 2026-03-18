/*
  CRM Workspace Dynamic Code Template
  -----------------------------------
  Paste into sys_autos.p_code (p_type=0) and bind to a Dynamic Code menu.
  End-to-end CRM flow covered:
  1) Kanban pipeline drag/drop + stale warning
  2) Inventory smart filtering + lead-product linking
  3) Activities + schedule + task tracking
  4) Role scope + phone masking + export alert
  5) Funnel analytics + sales performance comparison
*/

(function runCrmWorkspace(seft) {
  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const antd = window.antd || {};

  if (!React || !ReactDOM || !antd.CsmCrmWorkspace) {
    throw new Error("Dynamic runtime is missing React/ReactDOM/CsmCrmWorkspace bridge");
  }

  const appId = seft?.appId || seft?.app_id || "csm";
  const containerId = seft?.containerId || window.csmDynamicCodeContainerId || "dynamic-code-root";
  const container = document.getElementById(containerId) || document.getElementById("context-auto");
  if (!container) {
    throw new Error("Dynamic container not found");
  }

  const { CsmCrmWorkspace, notification } = antd;
  const csmApi = window.csmApi || {};
  const getTableData = csmApi.getTableData || seft?.getTableData;
  const updateTableData = csmApi.updateTableData || seft?.updateTableData;

  if (typeof getTableData !== "function") {
    throw new Error("getTableData API is not available in dynamic runtime");
  }

  const STAGE_ALIASES = {
    lead: ["lead", "new", "moi", "mới"],
    contacted: ["contacted", "contact", "da_lien_he", "đã liên hệ"],
    site_visit: ["site_visit", "visit", "tham_quan", "tham quan dự án"],
    booking: ["booking", "deposit", "dat_coc", "đặt cọc"],
    contract: ["contract", "signed", "hop_dong", "hợp đồng"],
    after_sale: ["after_sale", "care", "cham_soc", "chăm sóc sau bán"],
  };

  const STATUS_ALIASES = {
    available: ["available", "free", "trong", "trống"],
    booking: ["booking", "reserved", "giu_cho", "đang giữ chỗ"],
    sold: ["sold", "closed", "da_ban", "đã bán"],
  };

  const now = Date.now();
  const AUTO_REFRESH_MS = 120000;
  const OPS_REFRESH_MS = 120000;
  const FETCH_TAKE_LIMIT = 500;
  const leadDefaultStatus = "lead";
  const inventoryDefaultStatus = "available";
  const defaultWhere = {
    operator: "AND",
    conditions: [{ field: "id", type: "like", value: "" }],
  };
  const debug = (() => {
    try {
      return /(^|[?&])crm_debug=1(&|$)/.test(window.location.search);
    } catch {
      return false;
    }
  })();
  const enableSeed = (() => {
    try {
      return /(^|[?&])crm_seed=1(&|$)/.test(window.location.search);
    } catch {
      return false;
    }
  })();

  const uiTranslations = {
    vi: {
      crmTitle: "CRM Môi Giới Bất Động Sản",
      crmDescription: "Quản lý toàn bộ sales pipeline, kho hàng, hoạt động và analytics theo thời gian thực.",
      pipelineLead: "Mới",
      pipelineContacted: "Đã liên hệ",
      pipelineVisit: "Tham quan dự án",
      pipelineBooking: "Đặt cọc",
      pipelineContract: "Hợp đồng",
      pipelineAfterSale: "Chăm sóc sau bán",
      inventoryAvailable: "Trống",
      inventoryBooking: "Đang giữ chỗ",
      inventorySold: "Đã bán",
      tableCreated: "Đã tạo bảng dữ liệu",
      tableCreatedDesc: "Schema {table} vừa được khởi tạo trên server.",
      seedMode: "Chế độ dữ liệu mẫu CRM",
      seedModeDesc: "Đã nạp dữ liệu mẫu vì không tìm thấy dữ liệu từ bảng CRM.",
      seedTaskTitle1: "Gửi bảng tính dòng tiền cho LEAD001",
      seedTaskTitle2: "Hẹn ký cọc với LEAD003",
      opsTitle: "Trung tâm vận hành Marketing",
      opsSubtitle: "Theo dõi chi phí, nguồn khách, traffic và kết quả bán hàng trong một màn hình gọn.",
      updatedAt: "Cập nhật",
      refresh: "Làm mới",
      opsLoadError: "Không thể tải dữ liệu Marketing Ops",
      adUnavailable: "API createAd chưa sẵn sàng",
      adTargetRequired: "Vui lòng nhập link đích cho quảng cáo",
      adCreateFailed: "Không thể tạo quảng cáo",
      adCreated: "Đã tạo quảng cáo",
      adSetupTitle: "Thiết lập quảng cáo Google/Facebook",
      adCreate: "Tạo quảng cáo",
      quickFill: "Điền nhanh",
      platformAll: "Tất cả (Google + Facebook)",
      platformFacebook: "Facebook",
      platformGoogle: "Google",
      campaignName: "Tên chiến dịch",
      objective: "Mục tiêu",
      budget: "Ngân sách",
      targetUrl: "URL đích",
      adHeadline: "Tiêu đề quảng cáo",
      adDescription: "Mô tả quảng cáo",
      adMessage: "Thông điệp quảng cáo",
      aiBrief: "Mô tả cho AI",
      aiGenerate: "AI tạo nội dung",
      aiCreateAndPush: "AI + tạo & kích hoạt",
      autoActivate: "Tự kích hoạt quảng cáo",
      autoPushFacebook: "Tự đẩy lên Facebook Page",
      aiGenerated: "AI đã tạo nội dung quảng cáo",
      aiGenerateFailed: "AI tạo nội dung thất bại",
      fbUserToken: "Facebook user/page token",
      fbLoadPages: "Nạp danh sách fanpage",
      fbPagesLoaded: "Đã nạp danh sách fanpage",
      fbPagesLoadFailed: "Không thể nạp danh sách fanpage",
      fbNoPagesFound: "Không tìm thấy fanpage từ token",
      fbSelectPages: "Chọn fanpage chạy quảng cáo",
      fbSelectAllPages: "Chọn tất cả",
      fbClearPages: "Bỏ chọn",
      fbPageRequired: "Vui lòng chọn ít nhất 1 fanpage",
      fbPageTokenRequired: "Fanpage được chọn đang thiếu access token. Vui lòng nạp lại token.",
      salesTodoTitle: "Điều phối công việc đội kinh doanh",
      salesTodoDesc: "Phân công, theo dõi và hoàn thành công việc chăm sóc khách theo từng cơ hội bán hàng.",
      loadSalesUsers: "Nạp nhân sự sales",
      assignee: "Nhân viên phụ trách",
      linkedLead: "Lead liên kết",
      taskTitleField: "Tên công việc",
      dueAtField: "Thời hạn xử lý (nhập mili giây)",
      reminderAtField: "Thời điểm nhắc việc (nhập mili giây)",
      taskPriority: "Ưu tiên",
      taskType: "Loại việc",
      priorityLow: "Thấp",
      priorityMedium: "Trung bình",
      priorityHigh: "Cao",
      priorityUrgent: "Khẩn cấp",
      taskTypeFollowUp: "Chăm sóc lead",
      taskTypeCall: "Gọi điện",
      taskTypeMeeting: "Họp / tư vấn",
      taskTypeVisit: "Dẫn khách xem dự án",
      taskTypePaperwork: "Giấy tờ / hợp đồng",
      taskTypeOther: "Khác",
      overdue: "Quá hạn",
      todoOverdue: "Công việc quá hạn",
      todoInProgress: "Đang xử lý",
      todoDoneToday: "Hoàn thành hôm nay",
      todoDueToday: "Đến hạn hôm nay",
      permissionDenied: "Bạn không có quyền thao tác công việc này",
      markDone: "Hoàn thành",
      todoSaved: "Đã lưu công việc",
      todoCompleted: "Đã hoàn thành công việc",
      todoSaveFailed: "Không thể lưu công việc",
      todoCreateTitle: "Thêm mới công việc",
      todoEditTitle: "Chỉnh sửa công việc",
      todoDeleteTitle: "Xoá công việc",
      noSalesUsers: "Chưa có nhân sự kinh doanh phù hợp với phạm vi vận hành hiện tại. Vui lòng kiểm tra phân quyền nhân sự.",
      crmCrudTitle: "Trung tâm dữ liệu CRM",
      crmCrudDesc: "Quản lý dữ liệu khách hàng, sản phẩm và hoạt động bán hàng để toàn bộ hệ thống cập nhật tức thì.",
      entityLeads: "Khách hàng tiềm năng",
      entityInventory: "Sản phẩm / giỏ giữ chỗ",
      entityActivities: "Hoạt động",
      entityTasks: "Công việc",
      crudCreateTitle: "Thêm mới dữ liệu",
      crudEditTitle: "Chỉnh sửa dữ liệu",
      crudDeleteTitle: "Xoá dữ liệu",
      addNew: "Thêm mới",
      edit: "Sửa",
      delete: "Xoá",
      save: "Lưu",
      cancel: "Huỷ",
      projectFromWebServices: "Dự án đang mở bán",
      sourceFacebook: "Facebook",
      sourceGoogle: "Google",
      sourceWebsite: "Website",
      sourceSalesSelf: "Sales tự kiếm",
      sourceExternalFloor: "Sàn/đối tác",
      sourceOther: "Nguồn khác",
      dataSaved: "Đã lưu dữ liệu",
      dataDeleted: "Đã xoá dữ liệu",
      dataSaveFailed: "Không thể lưu dữ liệu",
      dataDeleteFailed: "Không thể xoá dữ liệu",
      reloadCrmNow: "Đồng bộ CRM ngay",
      sourceFlowTitle: "Luồng khách hàng từ Marketing vào CRM",
      allOwners: "Tất cả nhân sự",
      allStatus: "Tất cả trạng thái",
      allPriority: "Tất cả mức ưu tiên",
      allTaskTypes: "Tất cả loại công việc",
      statusTodo: "Chưa xử lý",
      statusInProgress: "Đang xử lý",
      statusDone: "Hoàn thành",
      dueTime: "Hạn xử lý",
      actions: "Thao tác",
      confirmDeleteRecord: "Bạn có chắc muốn xoá bản ghi này?",
      idLabel: "Mã",
      platformLabel: "Nền tảng",
      objectivePlaceholder: "Mục tiêu (ví dụ: OUTCOME_TRAFFIC, LEAD)",
      fbPageIdField: "Mã trang Facebook",
      fbPageAccessTokenField: "Access Token trang Facebook",
      ggCustomerIdField: "Google Customer ID",
      ggAccessTokenField: "Google Access Token",
      ggDeveloperTokenField: "Google Developer Token",
      ggLoginCustomerIdField: "Google Login Customer ID",
      aiBridgeUnavailable: "Cầu nối AI chưa sẵn sàng",
      pagesCountDesc: "{count} trang",
      unknownError: "Lỗi không xác định",
      field_id: "Mã",
      field_name: "Tên khách hàng",
      field_phone: "Số điện thoại",
      field_source: "Nguồn khách",
      field_project_name: "Dự án",
      field_expected_value: "Giá trị dự kiến",
      field_status: "Trạng thái",
      field_assigned_to: "Nhân sự phụ trách",
      field_team_id: "Mã đội nhóm",
      field_notes: "Ghi chú",
      field_product_code: "Mã sản phẩm",
      field_product_name: "Tên sản phẩm",
      field_price: "Giá bán",
      field_area_m2: "Diện tích (m2)",
      field_bedrooms: "Số phòng ngủ",
      field_direction: "Hướng",
      field_lead_id: "Mã cơ hội",
      field_activity_type: "Loại hoạt động",
      field_result: "Kết quả",
      field_owner_id: "Người phụ trách",
      field_scheduled_at: "Lịch hẹn",
      field_completed_at: "Hoàn thành lúc",
      field_title: "Tiêu đề công việc",
      field_priority: "Mức ưu tiên",
      field_task_type: "Loại công việc",
      field_due_at: "Hạn xử lý",
      field_reminder_at: "Nhắc việc lúc",
      inventoryFilterArea: "Diện tích",
      inventoryFilterDirection: "Hướng",
      inventoryFilterBedrooms: "Phòng ngủ",
      inventoryFilterPrice: "Khoảng giá",
      activityTypeEmail: "Email",
      activityTypeNote: "Ghi chú",
      activityResultPending: "Chờ xử lý",
      activityResultCanceled: "Đã huỷ",
      directionNorth: "Bắc",
      directionSouth: "Nam",
      directionEast: "Đông",
      directionWest: "Tây",
      directionNE: "Đông Bắc",
      directionSE: "Đông Nam",
      directionNW: "Tây Bắc",
      directionSW: "Tây Nam",
      adsListTitle: "Danh sách quảng cáo đang vận hành",
      source: "Nguồn",
      leads: "Leads",
      closedDeals: "Đóng deal",
      rate: "Tỷ lệ",
      expectedValue: "Giá trị dự kiến",
      campaign: "Chiến dịch",
      status: "Trạng thái",
      adsSpend: "Chi phí Ads",
      revenue: "Doanh thu",
      profit: "Lợi nhuận",
      roi: "ROI",
      leadsClosed: "Leads / Chốt",
      conversionRate: "CR",
      websiteTraffic: "Traffic web",
      googlebot: "Googlebot",
      indexRemaining: "Google Index còn lại",
      indexQueue: "Queue Index",
      crmUpdated: "CRM đã cập nhật",
      crmUpdatedDesc: "Dữ liệu đã đồng bộ, bạn có thể tiếp tục thao tác.",
      dynamicInitError: "Không thể khởi tạo CRM dynamic code:",
    },
    en: {
      crmTitle: "Real Estate CRM",
      crmDescription: "Manage the full sales pipeline, inventory, activities, and analytics in real time.",
      pipelineLead: "New",
      pipelineContacted: "Contacted",
      pipelineVisit: "Site Visit",
      pipelineBooking: "Booking",
      pipelineContract: "Contract",
      pipelineAfterSale: "After Sales",
      inventoryAvailable: "Available",
      inventoryBooking: "Reserved",
      inventorySold: "Sold",
      tableCreated: "Data table created",
      tableCreatedDesc: "Schema {table} was initialized on the server.",
      seedMode: "CRM seed mode",
      seedModeDesc: "Sample data was loaded because no CRM records were found.",
      seedTaskTitle1: "Send financial plan to LEAD001",
      seedTaskTitle2: "Schedule booking deposit with LEAD003",
      opsTitle: "Marketing Ops Hub",
      opsSubtitle: "Track spend, lead sources, traffic, and sales results in one compact view.",
      updatedAt: "Updated",
      refresh: "Refresh",
      opsLoadError: "Unable to load Marketing Ops data",
      adUnavailable: "createAd API is not available",
      adTargetRequired: "Please enter a destination URL for the ad",
      adCreateFailed: "Unable to create ad",
      adCreated: "Ad created",
      adSetupTitle: "Google/Facebook ad setup",
      adCreate: "Create ad",
      quickFill: "Quick fill",
      platformAll: "All (Google + Facebook)",
      platformFacebook: "Facebook",
      platformGoogle: "Google",
      campaignName: "Campaign name",
      objective: "Objective",
      budget: "Budget",
      targetUrl: "Target URL",
      adHeadline: "Ad headline",
      adDescription: "Ad description",
      adMessage: "Ad message",
      aiBrief: "AI brief",
      aiGenerate: "Generate with AI",
      aiCreateAndPush: "AI + create & activate",
      autoActivate: "Auto activate ads",
      autoPushFacebook: "Auto publish to Facebook Page",
      aiGenerated: "AI generated ad content",
      aiGenerateFailed: "Failed to generate content with AI",
      fbUserToken: "Facebook user/page token",
      fbLoadPages: "Load fanpages",
      fbPagesLoaded: "Fanpages loaded",
      fbPagesLoadFailed: "Unable to load fanpages",
      fbNoPagesFound: "No fanpages found for this token",
      fbSelectPages: "Select fanpages for ads",
      fbSelectAllPages: "Select all",
      fbClearPages: "Clear",
      fbPageRequired: "Please select at least one fanpage",
      fbPageTokenRequired: "One or more selected fanpages are missing access tokens. Please reload tokens.",
      salesTodoTitle: "Sales Team Task Control",
      salesTodoDesc: "Plan, assign, and track follow-up work for each sales opportunity in one place.",
      loadSalesUsers: "Load sales users",
      assignee: "Assignee",
      linkedLead: "Linked lead",
      taskTitleField: "Task title",
      dueAtField: "Due time (milliseconds)",
      reminderAtField: "Reminder time (milliseconds)",
      taskPriority: "Priority",
      taskType: "Task type",
      priorityLow: "Low",
      priorityMedium: "Medium",
      priorityHigh: "High",
      priorityUrgent: "Urgent",
      taskTypeFollowUp: "Lead follow-up",
      taskTypeCall: "Call",
      taskTypeMeeting: "Meeting / consulting",
      taskTypeVisit: "Site visit",
      taskTypePaperwork: "Paperwork / contract",
      taskTypeOther: "Other",
      overdue: "Overdue",
      todoOverdue: "Overdue tasks",
      todoInProgress: "In progress",
      todoDoneToday: "Done today",
      todoDueToday: "Due today",
      permissionDenied: "You do not have permission to modify this task",
      markDone: "Complete",
      todoSaved: "Task saved",
      todoCompleted: "Task completed",
      todoSaveFailed: "Unable to save task",
      todoCreateTitle: "Create task",
      todoEditTitle: "Edit task",
      todoDeleteTitle: "Delete task",
      noSalesUsers: "No sales team members are available for the current operating scope. Please review team permissions.",
      crmCrudTitle: "CRM Data Operations Center",
      crmCrudDesc: "Maintain customer, inventory, and activity records with immediate system-wide updates.",
      entityLeads: "Leads",
      entityInventory: "Inventory / Reservation Basket",
      entityActivities: "Activities",
      entityTasks: "Tasks",
      crudCreateTitle: "Create record",
      crudEditTitle: "Edit record",
      crudDeleteTitle: "Delete record",
      addNew: "Add new",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      projectFromWebServices: "Active projects",
      sourceFacebook: "Facebook",
      sourceGoogle: "Google",
      sourceWebsite: "Website",
      sourceSalesSelf: "Sales self-sourced",
      sourceExternalFloor: "Marketplace/partner",
      sourceOther: "Other source",
      dataSaved: "Data saved",
      dataDeleted: "Data deleted",
      dataSaveFailed: "Unable to save data",
      dataDeleteFailed: "Unable to delete data",
      reloadCrmNow: "Sync CRM now",
      sourceFlowTitle: "Marketing source flow into CRM",
      allOwners: "All owners",
      allStatus: "All statuses",
      allPriority: "All priorities",
      allTaskTypes: "All task types",
      statusTodo: "To do",
      statusInProgress: "In progress",
      statusDone: "Done",
      dueTime: "Due",
      actions: "Actions",
      confirmDeleteRecord: "Delete this record?",
      idLabel: "ID",
      platformLabel: "Platform",
      objectivePlaceholder: "Objective (e.g. OUTCOME_TRAFFIC, LEAD)",
      fbPageIdField: "Facebook Page ID",
      fbPageAccessTokenField: "Facebook Page Access Token",
      ggCustomerIdField: "Google Customer ID",
      ggAccessTokenField: "Google Access Token",
      ggDeveloperTokenField: "Google Developer Token",
      ggLoginCustomerIdField: "Google Login Customer ID",
      aiBridgeUnavailable: "AI bridge is unavailable",
      pagesCountDesc: "{count} page(s)",
      unknownError: "Unknown error",
      field_id: "ID",
      field_name: "Customer name",
      field_phone: "Phone",
      field_source: "Lead source",
      field_project_name: "Project",
      field_expected_value: "Expected value",
      field_status: "Status",
      field_assigned_to: "Assignee",
      field_team_id: "Team ID",
      field_notes: "Notes",
      field_product_code: "Product code",
      field_product_name: "Product name",
      field_price: "Price",
      field_area_m2: "Area (m2)",
      field_bedrooms: "Bedrooms",
      field_direction: "Direction",
      field_lead_id: "Lead ID",
      field_activity_type: "Activity type",
      field_result: "Result",
      field_owner_id: "Owner",
      field_scheduled_at: "Scheduled at",
      field_completed_at: "Completed at",
      field_title: "Task title",
      field_priority: "Priority",
      field_task_type: "Task type",
      field_due_at: "Due at",
      field_reminder_at: "Reminder at",
      inventoryFilterArea: "Area",
      inventoryFilterDirection: "Direction",
      inventoryFilterBedrooms: "Bedrooms",
      inventoryFilterPrice: "Price range",
      activityTypeEmail: "Email",
      activityTypeNote: "Note",
      activityResultPending: "Pending",
      activityResultCanceled: "Canceled",
      directionNorth: "North",
      directionSouth: "South",
      directionEast: "East",
      directionWest: "West",
      directionNE: "Northeast",
      directionSE: "Southeast",
      directionNW: "Northwest",
      directionSW: "Southwest",
      adsListTitle: "Running ads",
      source: "Source",
      leads: "Leads",
      closedDeals: "Closed",
      rate: "Rate",
      expectedValue: "Expected value",
      campaign: "Campaign",
      status: "Status",
      adsSpend: "Ads spend",
      revenue: "Revenue",
      profit: "Profit",
      roi: "ROI",
      leadsClosed: "Leads / Closed",
      conversionRate: "CR",
      websiteTraffic: "Web traffic",
      googlebot: "Googlebot",
      indexRemaining: "Google Index left",
      indexQueue: "Index queue",
      crmUpdated: "CRM updated",
      crmUpdatedDesc: "Data has been synchronized. You can continue working.",
      dynamicInitError: "Unable to initialize CRM dynamic code:",
    },
    zh: {
      crmTitle: "房地产 CRM",
      crmDescription: "实时管理完整销售漏斗、库存、活动与分析。",
      pipelineLead: "新线索",
      pipelineContacted: "已联系",
      pipelineVisit: "到访项目",
      pipelineBooking: "订金",
      pipelineContract: "合同",
      pipelineAfterSale: "售后跟进",
      inventoryAvailable: "可售",
      inventoryBooking: "已预留",
      inventorySold: "已售",
      tableCreated: "已创建数据表",
      tableCreatedDesc: "服务器上已初始化 {table} 结构。",
      seedMode: "CRM 示例数据模式",
      seedModeDesc: "由于未找到 CRM 数据，已加载示例数据。",
      seedTaskTitle1: "向 LEAD001 发送资金计划",
      seedTaskTitle2: "与 LEAD003 预约签订订金",
      opsTitle: "营销运营中心",
      opsSubtitle: "在一个紧凑视图中跟踪投放成本、线索来源、流量与销售结果。",
      updatedAt: "更新时间",
      refresh: "刷新",
      opsLoadError: "无法加载营销运营数据",
      adUnavailable: "createAd API 尚不可用",
      adTargetRequired: "请输入广告目标链接",
      adCreateFailed: "无法创建广告",
      adCreated: "广告已创建",
      adSetupTitle: "Google/Facebook 广告设置",
      adCreate: "创建广告",
      quickFill: "快速填充",
      platformAll: "全部（Google + Facebook）",
      platformFacebook: "Facebook",
      platformGoogle: "Google",
      campaignName: "广告活动名称",
      objective: "目标",
      budget: "预算",
      targetUrl: "目标链接",
      adHeadline: "广告标题",
      adDescription: "广告描述",
      adMessage: "广告内容",
      aiBrief: "AI 描述",
      aiGenerate: "AI 生成内容",
      aiCreateAndPush: "AI + 创建并激活",
      autoActivate: "自动激活广告",
      autoPushFacebook: "自动发布到 Facebook 页面",
      aiGenerated: "AI 已生成广告内容",
      aiGenerateFailed: "AI 生成内容失败",
      fbUserToken: "Facebook 用户/页面 token",
      fbLoadPages: "加载粉丝页列表",
      fbPagesLoaded: "粉丝页列表已加载",
      fbPagesLoadFailed: "无法加载粉丝页列表",
      fbNoPagesFound: "该 token 未找到粉丝页",
      fbSelectPages: "选择投放粉丝页",
      fbSelectAllPages: "全选",
      fbClearPages: "清空",
      fbPageRequired: "请至少选择 1 个粉丝页",
      fbPageTokenRequired: "已选粉丝页缺少 access token，请重新加载 token。",
      salesTodoTitle: "销售团队任务协同",
      salesTodoDesc: "围绕销售机会统一安排、分配与跟进任务，提升成交推进效率。",
      loadSalesUsers: "加载销售人员",
      assignee: "负责人",
      linkedLead: "关联线索",
      taskTitleField: "任务标题",
      dueAtField: "截止时间（毫秒）",
      reminderAtField: "提醒时间（毫秒）",
      taskPriority: "优先级",
      taskType: "任务类型",
      priorityLow: "低",
      priorityMedium: "中",
      priorityHigh: "高",
      priorityUrgent: "紧急",
      taskTypeFollowUp: "线索跟进",
      taskTypeCall: "电话沟通",
      taskTypeMeeting: "会议 / 咨询",
      taskTypeVisit: "带看项目",
      taskTypePaperwork: "资料 / 合同",
      taskTypeOther: "其他",
      overdue: "超期",
      todoOverdue: "超期任务",
      todoInProgress: "处理中",
      todoDoneToday: "今日完成",
      todoDueToday: "今日到期",
      permissionDenied: "您没有权限操作此任务",
      markDone: "完成",
      todoSaved: "任务已保存",
      todoCompleted: "任务已完成",
      todoSaveFailed: "无法保存任务",
      todoCreateTitle: "新增任务",
      todoEditTitle: "编辑任务",
      todoDeleteTitle: "删除任务",
      noSalesUsers: "当前运营范围内没有可分配的销售人员，请检查团队权限配置。",
      crmCrudTitle: "CRM 数据运营中心",
      crmCrudDesc: "统一维护客户、房源与跟进数据，并实时同步到业务看板。",
      entityLeads: "线索",
      entityInventory: "房源 / 锁定清单",
      entityActivities: "活动",
      entityTasks: "任务",
      crudCreateTitle: "新增数据",
      crudEditTitle: "编辑数据",
      crudDeleteTitle: "删除数据",
      addNew: "新增",
      edit: "编辑",
      delete: "删除",
      save: "保存",
      cancel: "取消",
      projectFromWebServices: "在售项目",
      sourceFacebook: "Facebook",
      sourceGoogle: "Google",
      sourceWebsite: "网站",
      sourceSalesSelf: "销售自拓",
      sourceExternalFloor: "外部平台/合作方",
      sourceOther: "其他来源",
      dataSaved: "数据已保存",
      dataDeleted: "数据已删除",
      dataSaveFailed: "无法保存数据",
      dataDeleteFailed: "无法删除数据",
      reloadCrmNow: "立即同步 CRM",
      sourceFlowTitle: "营销线索流入 CRM",
      allOwners: "全部负责人",
      allStatus: "全部状态",
      allPriority: "全部优先级",
      allTaskTypes: "全部任务类型",
      statusTodo: "待处理",
      statusInProgress: "处理中",
      statusDone: "已完成",
      dueTime: "截止时间",
      actions: "操作",
      confirmDeleteRecord: "确认删除这条记录吗？",
      idLabel: "编号",
      platformLabel: "平台",
      objectivePlaceholder: "目标（例如：OUTCOME_TRAFFIC, LEAD）",
      fbPageIdField: "Facebook 页面 ID",
      fbPageAccessTokenField: "Facebook 页面 Access Token",
      ggCustomerIdField: "Google Customer ID",
      ggAccessTokenField: "Google Access Token",
      ggDeveloperTokenField: "Google Developer Token",
      ggLoginCustomerIdField: "Google Login Customer ID",
      aiBridgeUnavailable: "AI 连接桥不可用",
      pagesCountDesc: "{count} 个页面",
      unknownError: "未知错误",
      field_id: "编号",
      field_name: "客户姓名",
      field_phone: "手机号",
      field_source: "线索来源",
      field_project_name: "项目",
      field_expected_value: "预估价值",
      field_status: "状态",
      field_assigned_to: "负责销售",
      field_team_id: "团队编号",
      field_notes: "备注",
      field_product_code: "房源编号",
      field_product_name: "房源名称",
      field_price: "价格",
      field_area_m2: "面积（m2）",
      field_bedrooms: "卧室数",
      field_direction: "朝向",
      field_lead_id: "线索编号",
      field_activity_type: "活动类型",
      field_result: "结果",
      field_owner_id: "负责人",
      field_scheduled_at: "计划时间",
      field_completed_at: "完成时间",
      field_title: "任务标题",
      field_priority: "优先级",
      field_task_type: "任务类型",
      field_due_at: "截止时间",
      field_reminder_at: "提醒时间",
      inventoryFilterArea: "面积",
      inventoryFilterDirection: "朝向",
      inventoryFilterBedrooms: "卧室",
      inventoryFilterPrice: "价格区间",
      activityTypeEmail: "邮件",
      activityTypeNote: "备注",
      activityResultPending: "待处理",
      activityResultCanceled: "已取消",
      directionNorth: "北",
      directionSouth: "南",
      directionEast: "东",
      directionWest: "西",
      directionNE: "东北",
      directionSE: "东南",
      directionNW: "西北",
      directionSW: "西南",
      adsListTitle: "运行中的广告",
      source: "来源",
      leads: "线索",
      closedDeals: "成交",
      rate: "转化率",
      expectedValue: "预估价值",
      campaign: "活动",
      status: "状态",
      adsSpend: "广告花费",
      revenue: "收入",
      profit: "利润",
      roi: "ROI",
      leadsClosed: "线索 / 成交",
      conversionRate: "CR",
      websiteTraffic: "网站流量",
      googlebot: "Googlebot",
      indexRemaining: "Google Index 剩余额度",
      indexQueue: "索引队列",
      crmUpdated: "CRM 已更新",
      crmUpdatedDesc: "数据已同步，可以继续操作。",
      dynamicInitError: "无法初始化 CRM dynamic code：",
    },
  };

  function normalizeUILanguage(rawLang) {
    const lang = String(rawLang || "").toLowerCase();
    if (!lang) return "vi";
    if (lang === "zh" || lang === "zh-cn" || lang.startsWith("zh")) return "zh";
    if (lang === "en" || lang === "en-us" || lang.startsWith("en")) return "en";
    return "vi";
  }

  function getUILanguage() {
    try {
      const appLang = window?.i18next?.language;
      if (appLang) return normalizeUILanguage(appLang);
      const storedLanguage = localStorage.getItem("language");
      if (storedLanguage) return normalizeUILanguage(storedLanguage);
      const storedI18next = localStorage.getItem("i18nextLng");
      if (storedI18next) return normalizeUILanguage(storedI18next);
      const htmlLang = document?.documentElement?.lang;
      if (htmlLang) return normalizeUILanguage(htmlLang);
      return normalizeUILanguage(navigator.language || navigator.userLanguage);
    } catch {
      return "vi";
    }
  }

  function getLocaleCode(lang) {
    if (lang === "en") return "en-US";
    if (lang === "zh") return "zh-CN";
    return "vi-VN";
  }

  function translate(key, replacements) {
    const lang = getUILanguage();
    let value = uiTranslations[lang]?.[key] || uiTranslations.vi[key] || key;
    if (replacements && typeof replacements === "object") {
      Object.keys(replacements).forEach((name) => {
        value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(replacements[name]));
      });
    }
    return value;
  }

  function formatFieldFallback(field) {
    return String(field || "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function getFieldLabel(field) {
    const key = `field_${String(field || "").trim()}`;
    const value = translate(key);
    return value === key ? formatFieldFallback(field) : value;
  }

  function detectSystemDarkMode(runtimeTheme) {
    try {
      const html = document.documentElement;
      const body = document.body;
      const themeHints = [
        String(runtimeTheme?.theme || "").toLowerCase(),
        String(runtimeTheme?.mode || "").toLowerCase(),
        String(runtimeTheme?.colorMode || "").toLowerCase(),
        String(html?.getAttribute("data-theme") || "").toLowerCase(),
        String(html?.getAttribute("theme") || "").toLowerCase(),
        String(body?.getAttribute("data-theme") || "").toLowerCase(),
        String(localStorage.getItem("theme") || "").toLowerCase(),
        String(localStorage.getItem("theme_mode") || "").toLowerCase(),
      ].filter(Boolean);

      if (Boolean(runtimeTheme?.isDark)) return true;
      if (themeHints.some((item) => item.includes("dark"))) return true;
      if (html?.classList?.contains("dark") || body?.classList?.contains("dark")) return true;
      if (html?.classList?.contains("theme-dark") || body?.classList?.contains("theme-dark")) return true;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
    } catch {
      // Fall through to false.
    }
    return false;
  }

  function getThemeTokens() {
    try {
      const root = getComputedStyle(document.documentElement);
      const runtimeTheme = window.csmTheme || {};
      const isDark = detectSystemDarkMode(runtimeTheme);
      return {
        isDark,
        primary: root.getPropertyValue("--ant-color-primary").trim() || runtimeTheme.themeColorPrimary || "#1677ff",
        info: root.getPropertyValue("--ant-color-info").trim() || root.getPropertyValue("--ant-color-primary").trim() || "#1677ff",
        success: root.getPropertyValue("--ant-color-success").trim() || "#52c41a",
        warning: root.getPropertyValue("--ant-color-warning").trim() || "#faad14",
        danger: root.getPropertyValue("--ant-color-error").trim() || "#ff4d4f",
        bg: root.getPropertyValue("--ant-color-bg-layout").trim() || (isDark ? "#0f1115" : "#f5f7fb"),
        cardBg: root.getPropertyValue("--ant-color-bg-container").trim() || runtimeTheme.getCardBackground?.() || (isDark ? "#141414" : "#ffffff"),
        cardBgMuted: root.getPropertyValue("--ant-color-fill-tertiary").trim() || (isDark ? "rgba(255,255,255,0.06)" : "#f8fafc"),
        text: root.getPropertyValue("--ant-color-text").trim() || runtimeTheme.getTextColor?.() || (isDark ? "rgba(255,255,255,0.88)" : "#0f172a"),
        textSecondary: root.getPropertyValue("--ant-color-text-secondary").trim() || runtimeTheme.getSecondaryTextColor?.() || (isDark ? "rgba(255,255,255,0.45)" : "#64748b"),
        textTertiary: root.getPropertyValue("--ant-color-text-tertiary").trim() || (isDark ? "rgba(255,255,255,0.35)" : "#94a3b8"),
        border: root.getPropertyValue("--ant-color-border").trim() || runtimeTheme.getBorderColor?.() || (isDark ? "#303030" : "#dbe2ea"),
        dangerBg: root.getPropertyValue("--ant-color-error-bg").trim() || (isDark ? "#2a1215" : "#fff2f0"),
        dangerBorder: root.getPropertyValue("--ant-color-error-border").trim() || (isDark ? "#58181c" : "#ffccc7"),
        dangerText: root.getPropertyValue("--ant-color-error-text").trim() || "#cf1322",
        subtleBg: root.getPropertyValue("--ant-color-fill-secondary").trim() || (isDark ? "rgba(255,255,255,0.03)" : "#f8fafc"),
      };
    } catch {
      const isDark = detectSystemDarkMode(window.csmTheme || {});
      return {
        isDark,
        primary: "#1677ff",
        info: "#1677ff",
        success: "#52c41a",
        warning: "#faad14",
        danger: "#ff4d4f",
        bg: isDark ? "#0f1115" : "#f5f7fb",
        cardBg: isDark ? "#141414" : "#ffffff",
        cardBgMuted: isDark ? "rgba(255,255,255,0.06)" : "#f8fafc",
        text: isDark ? "rgba(255,255,255,0.88)" : "#0f172a",
        textSecondary: isDark ? "rgba(255,255,255,0.45)" : "#64748b",
        textTertiary: isDark ? "rgba(255,255,255,0.35)" : "#94a3b8",
        border: isDark ? "#303030" : "#dbe2ea",
        dangerBg: isDark ? "#2a1215" : "#fff2f0",
        dangerBorder: isDark ? "#58181c" : "#ffccc7",
        dangerText: "#cf1322",
        subtleBg: isDark ? "rgba(255,255,255,0.03)" : "#f8fafc",
      };
    }
  }

  function buildLocalizedCrmConfig(baseConfig) {
    const tone = getThemeTokens();
    const pipelineColorMap = {
      lead: tone.info,
      contacted: tone.primary || tone.info,
      site_visit: tone.primary,
      booking: tone.warning,
      contract: tone.success,
      after_sale: tone.primary,
    };
    const inventoryColorMap = {
      available: tone.success,
      booking: tone.warning,
      sold: tone.danger,
    };
    return {
      ...baseConfig,
      title: translate("crmTitle"),
      description: translate("crmDescription"),
      pipeline: {
        ...baseConfig.pipeline,
        stages: (baseConfig.pipeline?.stages || []).map((stage) => {
          const labelMap = {
            lead: translate("pipelineLead"),
            contacted: translate("pipelineContacted"),
            site_visit: translate("pipelineVisit"),
            booking: translate("pipelineBooking"),
            contract: translate("pipelineContract"),
            after_sale: translate("pipelineAfterSale"),
          };
          return {
            ...stage,
            label: labelMap[stage.id] || stage.label,
            color: pipelineColorMap[stage.id] || stage.color,
          };
        }),
      },
      inventory: {
        ...baseConfig.inventory,
        statuses: (baseConfig.inventory?.statuses || []).map((status) => {
          const labelMap = {
            available: translate("inventoryAvailable"),
            booking: translate("inventoryBooking"),
            sold: translate("inventorySold"),
          };
          return {
            ...status,
            label: labelMap[status.id] || status.label,
            color: inventoryColorMap[status.id] || status.color,
          };
        }),
        filters: (baseConfig.inventory?.filters || []).map((filter) => {
          const labelMap = {
            area_m2: translate("inventoryFilterArea"),
            direction: translate("inventoryFilterDirection"),
            bedrooms: translate("inventoryFilterBedrooms"),
            price: translate("inventoryFilterPrice"),
          };
          return { ...filter, label: labelMap[filter.field] || filter.label };
        }),
      },
    };
  }

  const crmConfig = {
    title: "CRM Môi Giới Bất Động Sản",
    description: "Quản lý toàn bộ sales pipeline, kho hàng, hoạt động và analytics theo thời gian thực.",
    defaultSection: "pipeline",
    sections: {
      pipeline: true,
      inventory: true,
      activities: true,
      analytics: true,
    },
    dataSources: {
      leads: {
        tableName: "crm_customers",
        pkField: "id",
        statusField: "status",
        titleField: "name",
        phoneField: "phone",
        projectField: "project_name",
        valueField: "expected_value",
        sourceField: "source",
        assignedToField: "assigned_to",
        teamField: "team_id",
        productIdsField: "interested_product_ids",
        lastInteractionField: "last_contact_at",
        updatedAtField: "updated_at",
        createdAtField: "created_at",
        useCrmApi: true,
      },
      inventory: {
        tableName: "crm_inventory",
        pkField: "id",
        statusField: "status",
        titleField: "product_name",
        productCodeField: "product_code",
        projectField: "project_name",
        leadRefField: "lead_id",
        areaField: "area_m2",
        directionField: "direction",
        bedroomField: "bedrooms",
        priceField: "price",
      },
      activities: {
        tableName: "crm_activities",
        pkField: "id",
        leadRefField: "lead_id",
        contactTypeField: "activity_type",
        resultField: "result",
        notesField: "notes",
        scheduledAtField: "scheduled_at",
        completedAtField: "completed_at",
        assignedToField: "owner_id",
        appointmentSuccessValue: "success",
      },
      tasks: {
        tableName: "crm_tasks",
        pkField: "id",
        titleKeyField: "title",
        leadRefField: "lead_id",
        statusField: "status",
        dueDateField: "due_at",
        assignedToField: "owner_id",
      },
      exports: {
        tableName: "crm_export_logs",
        pkField: "id",
        assignedToField: "owner_id",
        createdAtField: "created_at",
      },
    },
    pipeline: {
      stages: [
        { id: "lead", label: "Mới", color: "#1677ff", staleAfterHours: 24, probability: 10 },
        { id: "contacted", label: "Đã liên hệ", color: "#13c2c2", probability: 25 },
        { id: "site_visit", label: "Tham quan dự án", color: "#722ed1", probability: 45 },
        { id: "booking", label: "Đặt cọc", color: "#fa8c16", probability: 70 },
        { id: "contract", label: "Hợp đồng", color: "#52c41a", probability: 95 },
        { id: "after_sale", label: "Chăm sóc sau bán", color: "#2f54eb", probability: 100 },
      ],
      defaultStaleHours: 24,
      warningStageIds: ["lead"],
    },
    inventory: {
      statuses: [
        { id: "available", label: "Trống", color: "green" },
        { id: "booking", label: "Đang giữ chỗ", color: "orange" },
        { id: "sold", label: "Đã bán", color: "red" },
      ],
      filters: [
        { field: "area_m2", label: "Diện tích", type: "range", minField: "area_min", maxField: "area_max" },
        { field: "direction", label: "Hướng", type: "select" },
        { field: "bedrooms", label: "Phòng ngủ", type: "select" },
        { field: "price", label: "Khoảng giá", type: "range", minField: "price_min", maxField: "price_max" },
      ],
      leadLinkField: "lead_id",
    },
    activities: {
      activityTypes: ["call", "meeting", "site_visit", "email"],
      taskStatuses: ["todo", "in_progress", "done"],
    },
    analytics: {
      closedStageIds: ["contract", "after_sale"],
      bookingStageIds: ["booking"],
    },
    security: {
      adminRoles: ["admin", "dev"],
      leaderRoles: ["leader", "team_leader", "manager"],
      visibilityMode: "owner-team-admin",
      phoneMask: {
        enabled: true,
        visibleDigits: 3,
        unmaskedStages: ["contract", "after_sale"],
        placeholder: "***",
      },
      exportAlertThreshold: 100,
      exportLogTable: "crm_export_logs",
    },
  };

  const configOverride = (() => {
    try {
      const raw = localStorage.getItem(`crm_dynamic_config:${appId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  })();

  if (configOverride) {
    if (debug) console.log("[CRM Dynamic] Applying config override from localStorage", configOverride);
    Object.assign(crmConfig, configOverride);
    if (configOverride.dataSources) {
      crmConfig.dataSources = {
        ...crmConfig.dataSources,
        ...configOverride.dataSources,
      };
    }
  }

  const tableNames = [
    crmConfig.dataSources.leads.tableName,
    crmConfig.dataSources.inventory.tableName,
    crmConfig.dataSources.activities.tableName,
    crmConfig.dataSources.tasks.tableName,
    crmConfig.dataSources.exports.tableName,
  ].filter(Boolean);

  function applyContainerLayout(containerEl, scopedId) {
    if (!containerEl) return;
    containerEl.style.width = "100%";
    containerEl.style.maxWidth = "100%";
    containerEl.style.margin = "0 auto";
    containerEl.style.overflowX = "hidden";
    containerEl.style.boxSizing = "border-box";

    const rawId = String(scopedId || "dynamic-code-root");
    const escapedId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
      ? CSS.escape(rawId)
      : rawId.replace(/[^a-zA-Z0-9_-]+/g, "\\$&");
    const safeId = rawId.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const styleId = `crm_dynamic_layout_${safeId}`;
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #${escapedId} { width: 100%; max-width: 100%; overflow-x: hidden; box-sizing: border-box; }
      #${escapedId} * { box-sizing: border-box; min-width: 0; }
      #${escapedId} img,
      #${escapedId} video,
      #${escapedId} canvas,
      #${escapedId} svg,
      #${escapedId} iframe,
      #${escapedId} table,
      #${escapedId} pre { max-width: 100%; }
      #${escapedId} pre,
      #${escapedId} code,
      #${escapedId} p,
      #${escapedId} span,
      #${escapedId} div,
      #${escapedId} td,
      #${escapedId} th { overflow-wrap: anywhere; word-break: break-word; }
      #${escapedId} .ant-table-content { overflow-x: auto; }
    `;
    document.head.appendChild(style);
  }

  function getBackendBaseUrl() {
    const candidates = [];
    try {
      if (typeof seft?.apiBase === "string" && seft.apiBase.trim()) {
        candidates.push(seft.apiBase.replace(/\/api\/?$/, ""));
      }
    } catch {}
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        candidates.push(window.location.origin);
      }
    } catch {}
    for (let i = 0; i < candidates.length; i += 1) {
      const item = String(candidates[i] || "").trim().replace(/\/$/, "");
      if (item) return item;
    }
    return "";
  }

  function getAuthToken() {
    const possible = [
      window.csmToken,
      window.csmCurrentUser?.token,
      window.csmCurrentUser?.app_token,
      seft?.user?.token,
      seft?.user?.app_token,
    ];
    for (let i = 0; i < possible.length; i += 1) {
      const token = String(possible[i] || "").trim();
      if (token) return token;
    }
    return "";
  }

  function getCsrfToken() {
    try {
      const match = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/) : null;
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  }

  function getCreateTableEndpoints() {
    const base = getBackendBaseUrl();
    const endpoints = [
      "/api/create-table",
      "/create-table",
      base ? `${base}/api/create-table` : "",
      base ? `${base}/create-table` : "",
    ].filter(Boolean);
    return Array.from(new Set(endpoints));
  }

  function buildFieldIndex(defaultValue) {
    const fields = {};
    Object.keys(defaultValue).forEach((key, index) => {
      fields[index] = key;
    });
    return fields;
  }

  function createStruct(defaultValue, fieldsPK, fieldsSearch) {
    return {
      defaultValue,
      fieldsPK,
      fieldsSearch,
      fields: buildFieldIndex(defaultValue),
    };
  }

  const requiredTables = {
    [crmConfig.dataSources.leads.tableName]: createStruct(
      {
        id: "",
        app_id: appId,
        phone: "",
        name: "",
        email: "",
        birthday: "",
        status: "lead",
        source: "website",
        utm_source: "",
        utm_medium: "",
        utm_campaign: "",
        referrer: "",
        landing_page: "",
        assigned_to: "",
        team_id: "",
        notes: "",
        project_name: "",
        expected_value: 0,
        interested_product_ids: "[]",
        created_at: 0,
        updated_at: 0,
        last_contact_at: 0,
      },
      [crmConfig.dataSources.leads.pkField || "id"],
      ["id", "phone", "name", "email", "status", "source", "project_name", "assigned_to"]
    ),
    [crmConfig.dataSources.inventory.tableName]: createStruct(
      {
        id: "",
        product_code: "",
        product_name: "",
        project_name: "",
        status: "available",
        lead_id: "",
        area_m2: 0,
        direction: "",
        bedrooms: 0,
        price: 0,
        created_at: 0,
        updated_at: 0,
      },
      [crmConfig.dataSources.inventory.pkField || "id"],
      ["id", "product_code", "product_name", "project_name", "status"]
    ),
    [crmConfig.dataSources.activities.tableName]: createStruct(
      {
        id: "",
        lead_id: "",
        activity_type: "call",
        result: "pending",
        notes: "",
        scheduled_at: 0,
        completed_at: 0,
        owner_id: "",
      },
      [crmConfig.dataSources.activities.pkField || "id"],
      ["id", "lead_id", "activity_type", "result", "owner_id"]
    ),
    [crmConfig.dataSources.tasks.tableName]: createStruct(
      {
        id: "",
        title: "",
        lead_id: "",
        status: "todo",
        priority: "medium",
        task_type: "follow_up",
        due_at: 0,
        reminder_at: 0,
        completed_at: 0,
        owner_id: "",
        metadata: "",
        created_at: 0,
        updated_at: 0,
      },
      [crmConfig.dataSources.tasks.pkField || "id"],
      ["id", "title", "lead_id", "status", "priority", "task_type", "owner_id"]
    ),
    [crmConfig.dataSources.exports.tableName]: createStruct(
      {
        id: "",
        owner_id: "",
        action: "export",
        created_at: 0,
        metadata: "",
      },
      [crmConfig.dataSources.exports.pkField || "id"],
      ["id", "owner_id", "action", "created_at"]
    ),
    [crmConfig.security.exportLogTable || "crm_export_logs"]: createStruct(
      {
        id: "",
        owner_id: "",
        action: "export",
        created_at: 0,
        metadata: "",
      },
      ["id"],
      ["id", "owner_id", "action", "created_at"]
    ),
    "crm_ads": createStruct(
      {
        id: "",
        ad_id: "",
        app_id: appId,
        platform: "facebook",
        name: "",
        campaign_name: "",
        objective: "",
        status: "paused",
        budget: 0,
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        target_url: "",
        metadata: "",
        created_at: 0,
        updated_at: 0,
      },
      ["ad_id"],
      ["id", "ad_id", "platform", "status", "name", "campaign_name", "app_id"]
    ),
    "crm_ads_budget_logs": createStruct(
      {
        id: "",
        app_id: appId,
        platform: "facebook",
        campaign_name: "",
        objective: "",
        budget: 0,
        target_url: "",
        status: "paused",
        created_at: 0,
      },
      ["id"],
      ["id", "app_id", "platform", "campaign_name", "status"]
    ),
    "crm_analytics": createStruct(
      {
        id: "",
        app_id: appId,
        period: "week",
        created_date: "",
        updated_at: "",
        metrics: "{}",
        timeline: "[]",
        channels: "{}",
        ads: "{}",
        traffic_intelligence: "{}",
        analysis_text: "",
        recommendations: "[]",
      },
      ["app_id", "period", "created_date"],
      ["id", "app_id", "period", "created_date"]
    ),
  };

  function normalizeRows(response) {
    return response?.rows || response?.data || [];
  }

  async function postCreateTable(payload) {
    const token = getAuthToken();
    const csrfToken = getCsrfToken();
    const endpoints = getCreateTableEndpoints();
    let lastError = null;

    for (let i = 0; i < endpoints.length; i += 1) {
      const endpoint = endpoints[i];
      try {
        const headers = { "Content-Type": "application/json" };
        if (token) headers["csm-token"] = token;
        if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} at ${endpoint}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (debug) {
          console.warn("[CRM Dynamic] create-table failed", endpoint, error);
        }
      }
    }

    throw lastError || new Error("Khong goi duoc API create-table");
  }

  async function ensureTableExists(tableName, struct) {
    if (!tableName || !struct) return;
    try {
      await getTableData({
        app_id: appId,
        obj_name: tableName,
        where: defaultWhere,
        take: 1,
      });
      return;
    } catch (error) {
      if (debug) {
        console.warn(`[CRM Dynamic] Table missing, creating schema: ${tableName}`, error);
      }
    }

    const payload = {
      app_id: appId,
      obj_table: {
        id: tableName,
        struct,
      },
    };
    const result = await postCreateTable(payload);
    if (result?.success === false) {
      throw new Error(result?.message || `Khong the tao bang ${tableName}`);
    }
    if (notification?.info) {
      notification.info({
        message: translate("tableCreated"),
        description: translate("tableCreatedDesc", { table: tableName }),
        duration: 2,
      });
    }
  }

  async function ensureRequiredTables() {
    const entries = Object.entries(requiredTables).filter(([tableName]) => tableName);
    await Promise.all(entries.map(async ([tableName, struct]) => {
      try {
        await ensureTableExists(tableName, struct);
      } catch (error) {
        if (debug) {
          console.error(`[CRM Dynamic] ensure table failed: ${tableName}`, error);
        }
      }
    }));
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeAlias(value, aliases, fallback) {
    const source = String(value || "").trim().toLowerCase();
    if (!source) return fallback;
    for (const target in aliases) {
      if (aliases[target].includes(source)) return target;
    }
    return source;
  }

  function parseArrayLike(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[")) {
        try {
          return JSON.parse(trimmed).map(String);
        } catch {
          return [];
        }
      }
      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeLeadRows(rows) {
    const source = crmConfig.dataSources.leads;
    return rows.map((row, index) => {
      const id = String(row[source.pkField] || row.id || `lead_${index}_${now}`);
      const createdAt = toNumber(row[source.createdAtField], now);
      const updatedAt = toNumber(row[source.updatedAtField], createdAt);
      const expectedValue = toNumber(row[source.valueField], 0);
      const status = normalizeAlias(row[source.statusField], STAGE_ALIASES, leadDefaultStatus);
      const linkedProducts = parseArrayLike(row[source.productIdsField]);
      return {
        ...row,
        id,
        [source.pkField]: id,
        [source.statusField]: status,
        [source.valueField]: expectedValue,
        [source.createdAtField]: createdAt,
        [source.updatedAtField]: updatedAt,
        [source.productIdsField]: JSON.stringify(linkedProducts),
      };
    });
  }

  function normalizeInventoryRows(rows) {
    const source = crmConfig.dataSources.inventory;
    return rows.map((row, index) => {
      const id = String(row[source.pkField] || row.id || `inv_${index}_${now}`);
      const status = normalizeAlias(row[source.statusField], STATUS_ALIASES, inventoryDefaultStatus);
      return {
        ...row,
        id,
        [source.pkField]: id,
        [source.statusField]: status,
        [source.priceField]: toNumber(row[source.priceField], 0),
        [source.areaField]: toNumber(row[source.areaField], 0),
        [source.bedroomField]: toNumber(row[source.bedroomField], 0),
      };
    });
  }

  function normalizeActivityRows(rows) {
    const source = crmConfig.dataSources.activities;
    return rows.map((row, index) => {
      const id = String(row[source.pkField] || row.id || `act_${index}_${now}`);
      const scheduledAt = toNumber(row[source.scheduledAtField], now);
      const completedAt = toNumber(row[source.completedAtField], scheduledAt);
      return {
        ...row,
        id,
        [source.pkField]: id,
        [source.scheduledAtField]: scheduledAt,
        [source.completedAtField]: completedAt,
      };
    });
  }

  function normalizeTaskRows(rows) {
    const source = crmConfig.dataSources.tasks;
    return rows.map((row, index) => {
      const id = String(row[source.pkField] || row.id || `task_${index}_${now}`);
      const dueAt = toNumber(row[source.dueDateField], now + 24 * 60 * 60 * 1000);
      const status = String(row[source.statusField] || "todo").toLowerCase();
      const priorityRaw = String(row.priority || "medium").toLowerCase();
      const priority = ["low", "medium", "high", "urgent"].includes(priorityRaw) ? priorityRaw : "medium";
      const taskTypeRaw = String(row.task_type || row.taskType || "follow_up").toLowerCase();
      const taskType = ["follow_up", "call", "meeting", "visit", "paperwork", "other"].includes(taskTypeRaw) ? taskTypeRaw : "follow_up";
      return {
        ...row,
        id,
        [source.pkField]: id,
        [source.dueDateField]: dueAt,
        [source.statusField]: status,
        priority,
        task_type: taskType,
        reminder_at: toNumber(row.reminder_at, 0),
        completed_at: toNumber(row.completed_at, 0),
        metadata: row.metadata || "",
      };
    });
  }

  function normalizeExportRows(rows) {
    const source = crmConfig.dataSources.exports;
    return rows.map((row, index) => {
      const id = String(row[source.pkField] || row.id || `exp_${index}_${now}`);
      const createdAt = toNumber(row[source.createdAtField], now);
      return {
        ...row,
        id,
        [source.pkField]: id,
        [source.createdAtField]: createdAt,
      };
    });
  }

  function makeSeedData() {
    const uid = (seft?.user?.userId || seft?.user?.username || "sale_01");
    const team = (seft?.user?.team_id || "team_a");
    const leads = [
      {
        id: "LEAD001",
        name: "Nguyen Van An",
        phone: "0909000111",
        status: "lead",
        source: "facebook",
        project_name: "Celesta Riverside",
        expected_value: 3500000000,
        assigned_to: uid,
        team_id: team,
        interested_product_ids: JSON.stringify(["INV001"]),
        created_at: now - 36 * 60 * 60 * 1000,
        updated_at: now - 30 * 60 * 60 * 1000,
        last_contact_at: now - 30 * 60 * 60 * 1000,
      },
      {
        id: "LEAD002",
        name: "Le Thi Bich",
        phone: "0933000222",
        status: "site_visit",
        source: "website",
        project_name: "Lumiere Boulevard",
        expected_value: 5200000000,
        assigned_to: uid,
        team_id: team,
        interested_product_ids: JSON.stringify(["INV003", "INV004"]),
        created_at: now - 10 * 24 * 60 * 60 * 1000,
        updated_at: now - 6 * 60 * 60 * 1000,
        last_contact_at: now - 6 * 60 * 60 * 1000,
      },
      {
        id: "LEAD003",
        name: "Pham Quoc Cuong",
        phone: "0977000333",
        status: "booking",
        source: "walkin",
        project_name: "Masteri Centre Point",
        expected_value: 4100000000,
        assigned_to: "sale_02",
        team_id: "team_b",
        interested_product_ids: JSON.stringify(["INV005"]),
        created_at: now - 7 * 24 * 60 * 60 * 1000,
        updated_at: now - 4 * 60 * 60 * 1000,
        last_contact_at: now - 4 * 60 * 60 * 1000,
      },
    ];

    const inventory = [
      { id: "INV001", product_code: "A1-1208", product_name: "Can ho A1-1208", project_name: "Celesta Riverside", status: "available", area_m2: 72, bedrooms: 2, direction: "Dong Nam", price: 3400000000 },
      { id: "INV002", product_code: "A2-0910", product_name: "Can ho A2-0910", project_name: "Celesta Riverside", status: "booking", area_m2: 85, bedrooms: 3, direction: "Tay Nam", price: 4500000000 },
      { id: "INV003", product_code: "B3-1802", product_name: "Can ho B3-1802", project_name: "Lumiere Boulevard", status: "available", area_m2: 64, bedrooms: 2, direction: "Dong Bac", price: 3900000000 },
      { id: "INV004", product_code: "B3-1506", product_name: "Can ho B3-1506", project_name: "Lumiere Boulevard", status: "sold", area_m2: 78, bedrooms: 2, direction: "Nam", price: 4700000000 },
      { id: "INV005", product_code: "C1-2201", product_name: "Can ho C1-2201", project_name: "Masteri Centre Point", status: "booking", area_m2: 95, bedrooms: 3, direction: "Dong", price: 5400000000 },
    ];

    const activities = [
      { id: "ACT001", lead_id: "LEAD001", activity_type: "call", result: "pending", notes: "Khach yeu cau them bang gia va chinh sach vay", owner_id: uid, scheduled_at: now - 2 * 60 * 60 * 1000, completed_at: now - 2 * 60 * 60 * 1000 },
      { id: "ACT002", lead_id: "LEAD002", activity_type: "site_visit", result: "success", notes: "Da di xem can B3-1802, khach quan tam huong", owner_id: uid, scheduled_at: now - 6 * 60 * 60 * 1000, completed_at: now - 5 * 60 * 60 * 1000 },
      { id: "ACT003", lead_id: "LEAD003", activity_type: "meeting", result: "success", notes: "Thong nhat tien coc dot 1", owner_id: "sale_02", scheduled_at: now - 3 * 60 * 60 * 1000, completed_at: now - 2 * 60 * 60 * 1000 },
    ];

    const tasks = [
      { id: "TASK001", title: translate("seedTaskTitle1"), lead_id: "LEAD001", status: "todo", owner_id: uid, due_at: now + 12 * 60 * 60 * 1000 },
      { id: "TASK002", title: translate("seedTaskTitle2"), lead_id: "LEAD003", status: "in_progress", owner_id: "sale_02", due_at: now + 24 * 60 * 60 * 1000 },
    ];

    const exports = [
      { id: "EXP001", owner_id: uid, created_at: now - 2 * 60 * 60 * 1000 },
      { id: "EXP002", owner_id: uid, created_at: now - 10 * 60 * 60 * 1000 },
    ];

    return {
      [crmConfig.dataSources.leads.tableName]: leads,
      [crmConfig.dataSources.inventory.tableName]: inventory,
      [crmConfig.dataSources.activities.tableName]: activities,
      [crmConfig.dataSources.tasks.tableName]: tasks,
      [crmConfig.dataSources.exports.tableName]: exports,
    };
  }

  function enforceConsistency(database) {
    const leadSource = crmConfig.dataSources.leads;
    const inventorySource = crmConfig.dataSources.inventory;
    const leadPk = leadSource.pkField;
    const productIdsField = leadSource.productIdsField;
    const inventoryPk = inventorySource.pkField;
    const leadRefField = crmConfig.inventory.leadLinkField || inventorySource.leadRefField;

    const leadRows = (database[leadSource.tableName] && database[leadSource.tableName].rows) || [];
    const inventoryRows = (database[inventorySource.tableName] && database[inventorySource.tableName].rows) || [];
    const leadMap = new Map();
    const inventoryMap = new Map();

    leadRows.forEach((lead) => {
      const id = String(lead[leadPk]);
      leadMap.set(id, lead);
      const linked = parseArrayLike(lead[productIdsField]);
      linked.forEach((inventoryId) => {
        const key = String(inventoryId);
        if (!inventoryMap.has(key)) inventoryMap.set(key, id);
      });
    });

    inventoryRows.forEach((item) => {
      const itemId = String(item[inventoryPk]);
      const linkedLead = item[leadRefField] ? String(item[leadRefField]) : null;
      if (linkedLead && leadMap.has(linkedLead)) {
        const lead = leadMap.get(linkedLead);
        const linked = parseArrayLike(lead[productIdsField]);
        if (!linked.includes(itemId)) {
          linked.push(itemId);
          lead[productIdsField] = JSON.stringify(linked);
        }
      } else if (!linkedLead && inventoryMap.has(itemId)) {
        item[leadRefField] = inventoryMap.get(itemId);
      }
    });

    return database;
  }

  async function trySeedIfNeeded(database) {
    if (!enableSeed) return database;
    const next = { ...database };
    const seedMap = makeSeedData();
    const saves = [];

    tableNames.forEach((tableName) => {
      const currentRows = next[tableName]?.rows || [];
      if (currentRows.length > 0) return;
      const seedRows = seedMap[tableName] || [];
      next[tableName] = {
        id: tableName,
        rows: seedRows,
        fieldsPK: ["id"],
      };

      if (typeof updateTableData === "function") {
        seedRows.forEach((row) => {
          saves.push(updateTableData({
            app_id: appId,
            obj_name: tableName,
            command: "create",
            obj_update: row,
            pk_fields: ["id"],
          }).catch(() => null));
        });
      }
    });

    if (saves.length > 0) {
      await Promise.all(saves);
      if (notification?.info) {
        notification.info({
          message: translate("seedMode"),
          description: translate("seedModeDesc"),
          duration: 2,
        });
      }
    }

    return next;
  }

  function buildDatabaseMap(rawMap) {
    const map = { ...rawMap };
    const leadTable = crmConfig.dataSources.leads.tableName;
    const inventoryTable = crmConfig.dataSources.inventory.tableName;
    const activitiesTable = crmConfig.dataSources.activities.tableName;
    const tasksTable = crmConfig.dataSources.tasks.tableName;
    const exportsTable = crmConfig.dataSources.exports.tableName;

    map[leadTable] = {
      id: leadTable,
      rows: normalizeLeadRows(map[leadTable]?.rows || []),
      fieldsPK: [crmConfig.dataSources.leads.pkField],
    };
    map[inventoryTable] = {
      id: inventoryTable,
      rows: normalizeInventoryRows(map[inventoryTable]?.rows || []),
      fieldsPK: [crmConfig.dataSources.inventory.pkField],
    };
    map[activitiesTable] = {
      id: activitiesTable,
      rows: normalizeActivityRows(map[activitiesTable]?.rows || []),
      fieldsPK: [crmConfig.dataSources.activities.pkField],
    };
    map[tasksTable] = {
      id: tasksTable,
      rows: normalizeTaskRows(map[tasksTable]?.rows || []),
      fieldsPK: [crmConfig.dataSources.tasks.pkField],
    };
    map[exportsTable] = {
      id: exportsTable,
      rows: normalizeExportRows(map[exportsTable]?.rows || []),
      fieldsPK: [crmConfig.dataSources.exports.pkField],
    };

    return enforceConsistency(map);
  }

  function unwrapApiEnvelope(response) {
    if (!response) return null;
    if (response.success !== undefined || response.code !== undefined || response.message !== undefined) {
      if (response.data !== undefined) return response.data;
      if (response.result !== undefined) return response.result;
      if (response.rows !== undefined) return response.rows;
      return null;
    }
    return response;
  }

  function toRows(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.list)) return payload.list;
    return [];
  }

  function pickNumber(source, keys, fallback) {
    if (!source || typeof source !== "object") return fallback;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!(key in source)) continue;
      const num = Number(source[key]);
      if (Number.isFinite(num)) return num;
    }
    return fallback;
  }

  function formatNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return new Intl.NumberFormat(getLocaleCode(getUILanguage())).format(num);
  }

  function formatCurrency(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return new Intl.NumberFormat(getLocaleCode(getUILanguage()), {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(num);
  }

  function formatPercent(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0%";
    return `${num.toFixed(1)}%`;
  }

  function normalizeLeadSource(source) {
    const key = String(source || "unknown").trim().toLowerCase();
    if (!key) return "unknown";
    if (["facebook", "fb", "facebook_ads"].includes(key)) return "facebook";
    if (["google", "google_ads", "google_organic", "seo"].includes(key)) return "google";
    if (["website", "web", "landing"].includes(key)) return "website";
    if (["sales", "sales_self", "self_find", "self", "referral", "offline"].includes(key)) return "sales_self";
    if (["external_floor", "marketplace", "partner", "sangiao", "san", "affiliate"].includes(key)) return "external_floor";
    return key;
  }

  function getLeadSourceStats(database) {
    const leadSource = crmConfig.dataSources.leads;
    const leadRows = (database[leadSource.tableName] && database[leadSource.tableName].rows) || [];
    const sourceField = leadSource.sourceField || "source";
    const valueField = leadSource.valueField || "expected_value";
    const statusField = leadSource.statusField || "status";
    const closedStageIds = (crmConfig.analytics && crmConfig.analytics.closedStageIds) || ["contract", "after_sale"];
    const map = new Map();

    leadRows.forEach((row) => {
      const source = normalizeLeadSource(row[sourceField] || row.utm_source || row.utm_medium);
      if (!map.has(source)) {
        map.set(source, { source, leads: 0, closed: 0, expectedValue: 0 });
      }
      const stat = map.get(source);
      stat.leads += 1;
      stat.expectedValue += toNumber(row[valueField], 0);
      if (closedStageIds.includes(String(row[statusField] || ""))) {
        stat.closed += 1;
      }
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        closeRate: row.leads > 0 ? (row.closed * 100) / row.leads : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }

  function buildOpsSummary(raw) {
    const crmStats = raw.crmStats || {};
    const websiteStats = raw.websiteStats || {};
    const adsStats = raw.adsStats || {};
    const googlebotStats = raw.googlebotStats || {};
    const indexQuota = raw.indexQuota || {};
    const queueInfo = raw.queueInfo || {};
    const sourceStats = raw.sourceStats || [];

    const adsSpend = pickNumber(adsStats, ["total_spent", "totalSpend", "spend", "cost", "ads_cost"], 0);
    const crmRevenue = pickNumber(crmStats, ["revenue", "total_revenue", "sales_value", "purchase_value"], 0);
    const sourceRevenue = sourceStats.reduce((sum, row) => sum + toNumber(row.expectedValue, 0), 0);
    const revenue = crmRevenue > 0 ? crmRevenue : sourceRevenue;
    const profit = revenue - adsSpend;
    const roi = adsSpend > 0 ? (profit * 100) / adsSpend : 0;

    const totalLeads = pickNumber(crmStats, ["total_leads", "total_customers", "leads"], sourceStats.reduce((sum, row) => sum + row.leads, 0));
    const totalClosed = pickNumber(crmStats, ["closed_deals", "purchased_customers", "deals"], sourceStats.reduce((sum, row) => sum + row.closed, 0));
    const conversionRate = totalLeads > 0 ? (totalClosed * 100) / totalLeads : pickNumber(crmStats, ["conversion_rate", "close_rate"], 0);

    const totalVisits = pickNumber(websiteStats, ["total_visits", "views", "traffic", "page_views"], 0);
    const googlebotVisits = pickNumber(googlebotStats, ["totalVisits", "total_visits", "google_bot_visits"], 0);
    const indexRemaining = pickNumber(indexQuota, ["remaining", "remainingQuota", "remaining_quota"], 0);
    const queuePending = pickNumber(queueInfo, ["pending", "queueSize", "totalPending"], 0);

    return {
      adsSpend,
      revenue,
      profit,
      roi,
      totalLeads,
      totalClosed,
      conversionRate,
      totalVisits,
      googlebotVisits,
      indexRemaining,
      queuePending,
    };
  }

  function WorkspaceShell({ database, reloadDatabase }) {
    const ConfigProvider = antd.ConfigProvider;
    const antdTheme = antd.theme || {};
    const Card = antd.Card || "div";
    const Space = antd.Space || "div";
    const Button = antd.Button || "button";
    const Input = antd.Input || "input";
    const Select = antd.Select;
    const Table = antd.Table;
    const Tabs = antd.Tabs;
    const Checkbox = antd.Checkbox;
      const Modal = antd.Modal;

    const [loadingOps, setLoadingOps] = React.useState(false);
    const [submittingAd, setSubmittingAd] = React.useState(false);
    const [opsData, setOpsData] = React.useState({
      crmStats: {},
      websiteStats: {},
      adsStats: {},
      googlebotStats: {},
      indexQuota: {},
      queueInfo: {},
      adsRows: [],
      updatedAt: Date.now(),
      error: "",
    });
    const [adForm, setAdForm] = React.useState({
      platform: "all",
      campaign_name: "",
      objective: "OUTCOME_TRAFFIC",
      budget: "500000",
      target_url: "",
      message: "",
      headline: "",
      description: "",
      ai_brief: "",
      auto_activate: true,
      auto_push_facebook: false,
      fb_page_id: "",
      fb_page_access_token: "",
      gg_customer_id: "",
      gg_access_token: "",
      gg_developer_token: "",
      gg_login_customer_id: "",
      facebook_user_token: "",
    });
    const [facebookPages, setFacebookPages] = React.useState([]);
    const [activeHubTab, setActiveHubTab] = React.useState("crm");
    const [selectedFacebookPageIds, setSelectedFacebookPageIds] = React.useState([]);
    const [loadingFacebookPages, setLoadingFacebookPages] = React.useState(false);
    const [salesUsers, setSalesUsers] = React.useState([]);
    const [loadingSalesUsers, setLoadingSalesUsers] = React.useState(false);
    const [todoMode, setTodoMode] = React.useState("create");
    const [todoDraft, setTodoDraft] = React.useState({
      id: "",
      title: "",
      lead_id: "",
      owner_id: "",
      status: "todo",
      due_at: Date.now() + 24 * 60 * 60 * 1000,
    });
    const [todoSaving, setTodoSaving] = React.useState(false);
    const [todoModalOpen, setTodoModalOpen] = React.useState(false);
    const [todoOwnerFilter, setTodoOwnerFilter] = React.useState("all");
    const [todoStatusFilter, setTodoStatusFilter] = React.useState("all");
    const [todoPriorityFilter, setTodoPriorityFilter] = React.useState("all");
    const [todoTypeFilter, setTodoTypeFilter] = React.useState("all");
    const [aiGenerating, setAiGenerating] = React.useState(false);
    const [crudEntity, setCrudEntity] = React.useState("leads");
    const [crudMode, setCrudMode] = React.useState("create");
    const [crudDraft, setCrudDraft] = React.useState({});
    const [crudSaving, setCrudSaving] = React.useState(false);
      const [crudModalOpen, setCrudModalOpen] = React.useState(false);
    const [projectOptions, setProjectOptions] = React.useState([]);
    const [language, setLanguage] = React.useState(getUILanguage());
    const [themeVersion, setThemeVersion] = React.useState(0);

    function normalizePageId(value) {
      return String(value || "").trim();
    }

    function normalizeSelectedPageIds(ids) {
      return uniqueStringList((Array.isArray(ids) ? ids : []).map((id) => normalizePageId(id)).filter(Boolean));
    }

    function toggleSelectedFacebookPage(pageId, nextChecked) {
      const normalizedId = normalizePageId(pageId);
      if (!normalizedId) return;
      setSelectedFacebookPageIds((prev) => {
        const prevIds = normalizeSelectedPageIds(prev);
        const hasId = prevIds.includes(normalizedId);
        const shouldCheck = typeof nextChecked === "boolean" ? nextChecked : !hasId;
        if (shouldCheck) return normalizeSelectedPageIds([...prevIds, normalizedId]);
        return prevIds.filter((id) => id !== normalizedId);
      });
    }

    React.useEffect(() => {
      const syncLanguage = (event) => setLanguage(normalizeUILanguage(event?.detail?.language || getUILanguage()));
      const syncTheme = () => setThemeVersion((current) => current + 1);
      window.addEventListener("csm:locale-change", syncLanguage);
      window.addEventListener("csm:theme-change", syncTheme);
      return () => {
        window.removeEventListener("csm:locale-change", syncLanguage);
        window.removeEventListener("csm:theme-change", syncTheme);
      };
    }, []);

    const themeTokens = React.useMemo(() => getThemeTokens(), [themeVersion]);
    const localizedCrmConfig = React.useMemo(() => buildLocalizedCrmConfig(crmConfig), [language, themeVersion]);
    const sourceStats = React.useMemo(() => getLeadSourceStats(database), [database]);
    const summary = React.useMemo(() => buildOpsSummary({ ...opsData, sourceStats }), [opsData, sourceStats]);
    const leadTableName = crmConfig.dataSources.leads.tableName;
    const taskTableName = crmConfig.dataSources.tasks.tableName;
    const leadRows = React.useMemo(() => {
      const rows = (database[leadTableName] && database[leadTableName].rows) || [];
      return Array.isArray(rows) ? rows : [];
    }, [database, leadTableName]);
    const taskRows = React.useMemo(() => {
      const rows = (database[taskTableName] && database[taskTableName].rows) || [];
      return Array.isArray(rows) ? rows : [];
    }, [database, taskTableName]);

    const currentUserId = React.useMemo(() => String(seft?.user?.userId || seft?.user?.username || "").trim(), [seft?.user?.userId, seft?.user?.username]);
    const roleSet = React.useMemo(() => {
      const fromPermissions = Array.isArray(seft?.user?.permissions) ? seft.user.permissions : [];
      const fromRoles = Array.isArray(seft?.user?.roles) ? seft.user.roles : [];
      const normalized = [...fromPermissions, ...fromRoles]
        .map((item) => String(item || "").toLowerCase().trim())
        .filter(Boolean);
      return new Set(normalized);
    }, [seft?.user?.permissions, seft?.user?.roles]);
    const canManageAnyTask = roleSet.has("admin") || roleSet.has("dev") || roleSet.has("manager") || roleSet.has("leader") || roleSet.has("team_leader");

    function isOverdueTask(task) {
      const dueAt = toNumber(task?.due_at, 0);
      const status = String(task?.status || "").toLowerCase();
      return dueAt > 0 && dueAt < Date.now() && status !== "done";
    }

    function canManageTask(task) {
      if (canManageAnyTask) return true;
      const owner = String(task?.owner_id || "").trim();
      return Boolean(currentUserId) && owner === currentUserId;
    }

    function parseTaskMetadata(task) {
      const raw = task?.metadata;
      if (!raw) return {};
      if (typeof raw === "object") return raw;
      try {
        return JSON.parse(String(raw));
      } catch {
        return {};
      }
    }

    function buildTaskMetadataWithHistory(taskSnapshot, action) {
      const actor = currentUserId || "system";
      const previous = parseTaskMetadata(taskSnapshot);
      const history = Array.isArray(previous.history) ? previous.history.slice(-49) : [];
      history.push({
        action,
        at: Date.now(),
        by: actor,
        owner_id: String(taskSnapshot?.owner_id || ""),
        status: String(taskSnapshot?.status || ""),
        priority: String(taskSnapshot?.priority || "medium"),
      });
      return JSON.stringify({ ...previous, history });
    }

    const entityConfig = React.useMemo(() => ({
      leads: {
        tableName: crmConfig.dataSources.leads.tableName,
        pkField: crmConfig.dataSources.leads.pkField || "id",
        fields: ["id", "name", "phone", "source", "project_name", "expected_value", "status", "assigned_to", "team_id", "notes"],
        defaults: {
          id: `LEAD_${Date.now()}`,
          name: "",
          phone: "",
          source: "sales_self",
          project_name: "",
          expected_value: 0,
          status: "lead",
          assigned_to: "",
          team_id: "",
          notes: "",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      },
      inventory: {
        tableName: crmConfig.dataSources.inventory.tableName,
        pkField: crmConfig.dataSources.inventory.pkField || "id",
        fields: ["id", "product_code", "product_name", "project_name", "status", "price", "area_m2", "bedrooms", "direction", "lead_id"],
        defaults: {
          id: `INV_${Date.now()}`,
          product_code: "",
          product_name: "",
          project_name: "",
          status: "available",
          price: 0,
          area_m2: 0,
          bedrooms: 0,
          direction: "",
          lead_id: "",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      },
      activities: {
        tableName: crmConfig.dataSources.activities.tableName,
        pkField: crmConfig.dataSources.activities.pkField || "id",
        fields: ["id", "lead_id", "activity_type", "result", "notes", "owner_id", "scheduled_at", "completed_at"],
        defaults: {
          id: `ACT_${Date.now()}`,
          lead_id: "",
          activity_type: "call",
          result: "pending",
          notes: "",
          owner_id: seft?.user?.userId || seft?.user?.username || "",
          scheduled_at: Date.now(),
          completed_at: Date.now(),
        },
      },
      tasks: {
        tableName: crmConfig.dataSources.tasks.tableName,
        pkField: crmConfig.dataSources.tasks.pkField || "id",
        fields: ["id", "title", "lead_id", "status", "priority", "task_type", "owner_id", "due_at", "reminder_at", "completed_at"],
        defaults: {
          id: `TASK_${Date.now()}`,
          title: "",
          lead_id: "",
          status: "todo",
          priority: "medium",
          task_type: "follow_up",
          owner_id: seft?.user?.userId || seft?.user?.username || "",
          due_at: Date.now() + 24 * 60 * 60 * 1000,
          reminder_at: 0,
          completed_at: 0,
          metadata: "",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      },
    }), [language]);

    const currentEntity = entityConfig[crudEntity] || entityConfig.leads;
    const crudRows = React.useMemo(() => {
      const tableName = currentEntity.tableName;
      const rawRows = (database[tableName] && database[tableName].rows) || [];
      return Array.isArray(rawRows) ? rawRows : [];
    }, [database, currentEntity]);

    const loadProjectOptions = React.useCallback(async () => {
      try {
        const payload = await getTableData({ app_id: appId, obj_name: "web_services", where: defaultWhere, take: FETCH_TAKE_LIMIT });
        const rows = normalizeRows(payload);
        const options = rows
          .filter((row) => {
            const isService = row?.is_service === true || String(row?.is_service || "").toLowerCase() === "true" || Number(row?.is_service) === 1;
            const groupSlug = String(row?.group_slug || "").trim();
            return isService && Boolean(groupSlug);
          })
          .map((row, idx) => {
            const value = String(row.project_name || row.name || row.title || row.slug || row.service_code || `project_${idx}`);
            return { value, label: value };
          })
          .filter((item) => item.value)
          .filter((item, idx, list) => list.findIndex((x) => x.value === item.value) === idx)
          .slice(0, 300);
        setProjectOptions(options);
      } catch (error) {
        if (debug) console.warn("[CRM Dynamic] Failed to load web_services projects", error);
      }
    }, []);

    React.useEffect(() => {
      loadProjectOptions();
    }, [loadProjectOptions]);

    function normalizeSalesUser(row, index, sourceName) {
      const loginIdentifier = String(row?.login_identifier || "").trim();
      const id = String(loginIdentifier || row?.username || row?.user_name || row?.userid || row?.email || row?.id || `user_${sourceName}_${index}`).trim();
      const username = String(loginIdentifier || row?.username || row?.user_name || row?.userid || row?.email || id).trim();
      const fullName = String(row?.full_name || row?.fullName || row?.name || row?.display_name || username).trim();
      const rowAppId = String(row?.app_id || row?.appId || row?.parent_app_id || row?.parent_account_id || "").trim();
      const activeRaw = row?.active ?? row?.actived ?? row?.status;
      const isActive = activeRaw === undefined
        ? true
        : (activeRaw === true || String(activeRaw).toLowerCase() === "true" || Number(activeRaw) === 1 || String(activeRaw).toLowerCase() === "active");
      return {
        id,
        username,
        full_name: fullName,
        app_id: rowAppId,
        parent_account_id: String(row?.parent_account_id || "").trim(),
        active: isActive,
      };
    }

    const loadSalesUsers = React.useCallback(async () => {
      const merged = new Map();
      const adminAppId = String(seft?.user?.app_id || seft?.user?.appId || appId || "").trim();
      setLoadingSalesUsers(true);
      try {
        const payload = await getTableData({ app_id: "csm", obj_name: "csm_group_members", where: defaultWhere, take: FETCH_TAKE_LIMIT });
        const rows = normalizeRows(payload);
        rows.forEach((row, idx) => {
          const user = normalizeSalesUser(row, idx, "csm_group_members");
          if (!user.id || !user.active) return;

          // Sales members must belong to the logged-in admin's app_id scope.
          const scopedAppId = String(user.app_id || user.parent_account_id || "").trim();
          if (!adminAppId || !scopedAppId || scopedAppId !== adminAppId) return;

          if (!merged.has(user.id)) merged.set(user.id, user);
        });

        const users = Array.from(merged.values()).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
        setSalesUsers(users);
        if (users.length) {
          setTodoDraft((prev) => (prev.owner_id ? prev : { ...prev, owner_id: users[0].id }));
        }
      } finally {
        setLoadingSalesUsers(false);
      }
    }, [appId]);

    React.useEffect(() => {
      loadSalesUsers();
    }, [loadSalesUsers]);

    function openCreateTodo() {
      const defaultOwner = salesUsers[0]?.id || seft?.user?.userId || seft?.user?.username || "";
      setTodoMode("create");
      setTodoDraft({
        id: `TASK_${Date.now()}`,
        title: "",
        lead_id: "",
        owner_id: String(defaultOwner || ""),
        status: "todo",
        priority: "medium",
        task_type: "follow_up",
        due_at: Date.now() + 24 * 60 * 60 * 1000,
        reminder_at: 0,
        completed_at: 0,
      });
      setTodoModalOpen(true);
    }

    function openEditTodo(row) {
      setTodoMode("edit");
      setTodoDraft({
        id: String(row?.id || ""),
        title: String(row?.title || ""),
        lead_id: String(row?.lead_id || ""),
        owner_id: String(row?.owner_id || ""),
        status: String(row?.status || "todo"),
        priority: String(row?.priority || "medium"),
        task_type: String(row?.task_type || "follow_up"),
        due_at: toNumber(row?.due_at, Date.now() + 24 * 60 * 60 * 1000),
        reminder_at: toNumber(row?.reminder_at, 0),
        completed_at: toNumber(row?.completed_at, 0),
      });
      setTodoModalOpen(true);
    }

    async function saveTodoTask() {
      if (typeof updateTableData !== "function") return;
      const id = String(todoDraft.id || `TASK_${Date.now()}`);
      const existingTask = taskRows.find((row) => String(row?.id || "") === id);
      if (todoMode === "edit" && existingTask && !canManageTask(existingTask)) {
        if (notification?.warning) notification.warning({ message: translate("permissionDenied") });
        return;
      }
      if (!String(todoDraft.title || "").trim()) {
        if (notification?.warning) notification.warning({ message: translate("todoSaveFailed"), description: translate("taskTitleField") });
        return;
      }
      if (!String(todoDraft.owner_id || "").trim()) {
        if (notification?.warning) notification.warning({ message: translate("todoSaveFailed"), description: translate("assignee") });
        return;
      }

      setTodoSaving(true);
      try {
        const nowTs = Date.now();
        const payload = {
          id,
          title: String(todoDraft.title || "").trim(),
          lead_id: String(todoDraft.lead_id || "").trim(),
          owner_id: String(todoDraft.owner_id || "").trim(),
          status: String(todoDraft.status || "todo"),
          priority: String(todoDraft.priority || "medium"),
          task_type: String(todoDraft.task_type || "follow_up"),
          due_at: toNumber(todoDraft.due_at, nowTs + 24 * 60 * 60 * 1000),
          reminder_at: toNumber(todoDraft.reminder_at, 0),
          completed_at: String(todoDraft.status || "todo") === "done"
            ? (toNumber(todoDraft.completed_at, 0) || nowTs)
            : 0,
          metadata: buildTaskMetadataWithHistory({ ...existingTask, ...todoDraft }, todoMode === "create" ? "create" : "update"),
          updated_at: nowTs,
          created_at: todoMode === "create" ? nowTs : undefined,
        };

        await updateTableData({
          app_id: appId,
          obj_name: taskTableName,
          command: todoMode === "create" ? "create" : "update",
          pk_fields: ["id"],
          obj_update: payload,
          where: { id },
        });

        // Closed-loop CRM linkage: when a task is assigned for a lead, sync lead owner to same sales.
        if (String(payload.lead_id || "").trim()) {
          const linkedLead = leadRows.find((row) => String(row?.id || "") === String(payload.lead_id));
          if (linkedLead) {
            await updateTableData({
              app_id: appId,
              obj_name: leadTableName,
              command: "update",
              pk_fields: ["id"],
              obj_update: {
                ...linkedLead,
                id: String(linkedLead.id || payload.lead_id),
                assigned_to: payload.owner_id,
                updated_at: nowTs,
              },
              where: { id: String(linkedLead.id || payload.lead_id) },
            });
          }
        }

        if (notification?.success) notification.success({ message: translate("todoSaved"), duration: 1.5 });
        setTodoModalOpen(false);
        if (typeof reloadDatabase === "function") await reloadDatabase();
      } catch (error) {
        if (notification?.error) notification.error({ message: translate("todoSaveFailed"), description: error?.message || translate("unknownError") });
      } finally {
        setTodoSaving(false);
      }
    }

    function confirmDeleteTodoTask(row) {
      if (!canManageTask(row)) {
        if (notification?.warning) notification.warning({ message: translate("permissionDenied") });
        return;
      }
      if (Modal && typeof Modal.confirm === "function") {
        Modal.confirm({
          title: translate("todoDeleteTitle"),
          content: translate("confirmDeleteRecord"),
          okText: translate("delete"),
          cancelText: translate("cancel"),
          okButtonProps: { danger: true },
          onOk: () => deleteTodoTask(row),
          className: "crm-dynamic-theme-modal",
          wrapClassName: "crm-dynamic-theme-modal",
        });
        return;
      }
      deleteTodoTask(row);
    }

    async function completeTodoTask(row) {
      if (typeof updateTableData !== "function") return;
      const id = String(row?.id || "").trim();
      if (!id) return;
      if (!canManageTask(row)) {
        if (notification?.warning) notification.warning({ message: translate("permissionDenied") });
        return;
      }
      try {
        const next = {
          ...row,
          id,
          status: "done",
          completed_at: Date.now(),
          updated_at: Date.now(),
        };
        await updateTableData({
          app_id: appId,
          obj_name: taskTableName,
          command: "update",
          pk_fields: ["id"],
          obj_update: {
            ...next,
            metadata: buildTaskMetadataWithHistory(next, "complete"),
          },
          where: { id },
        });
        if (notification?.success) notification.success({ message: translate("todoCompleted"), duration: 1.5 });
        if (typeof reloadDatabase === "function") await reloadDatabase();
      } catch (error) {
        if (notification?.error) notification.error({ message: translate("todoSaveFailed"), description: error?.message || translate("unknownError") });
      }
    }

    async function deleteTodoTask(row) {
      if (typeof updateTableData !== "function") return;
      const id = String(row?.id || "").trim();
      if (!id) return;
      if (!canManageTask(row)) {
        if (notification?.warning) notification.warning({ message: translate("permissionDenied") });
        return;
      }
      try {
        await updateTableData({
          app_id: appId,
          obj_name: taskTableName,
          command: "delete",
          pk_fields: ["id"],
          obj_update: { id },
          where: { id },
        });
        if (notification?.success) notification.success({ message: translate("dataDeleted"), duration: 1.5 });
        if (typeof reloadDatabase === "function") await reloadDatabase();
      } catch (error) {
        if (notification?.error) notification.error({ message: translate("dataDeleteFailed"), description: error?.message || translate("unknownError") });
      }
    }

    const leadOptions = React.useMemo(() => {
      return leadRows.map((row, idx) => {
        const id = String(row?.id || `lead_${idx}`);
        const label = String(row?.name || row?.phone || id);
        return { value: id, label: `${label} (${id})` };
      });
    }, [leadRows]);

    const salesUserOptions = React.useMemo(() => {
      return salesUsers.map((user) => ({ value: user.id, label: user.full_name || user.username || user.id }));
    }, [salesUsers]);

    const todoPriorityOptions = [
      { value: "all", label: translate("allPriority") },
      { value: "low", label: translate("priorityLow") },
      { value: "medium", label: translate("priorityMedium") },
      { value: "high", label: translate("priorityHigh") },
      { value: "urgent", label: translate("priorityUrgent") },
    ];

    const todoTaskTypeOptions = [
      { value: "all", label: translate("allTaskTypes") },
      { value: "follow_up", label: translate("taskTypeFollowUp") },
      { value: "call", label: translate("taskTypeCall") },
      { value: "meeting", label: translate("taskTypeMeeting") },
      { value: "visit", label: translate("taskTypeVisit") },
      { value: "paperwork", label: translate("taskTypePaperwork") },
      { value: "other", label: translate("taskTypeOther") },
    ];

    const filteredTodoRows = React.useMemo(() => {
      const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 };
      const filtered = taskRows.filter((row) => {
        const ownerOk = todoOwnerFilter === "all" ? true : String(row?.owner_id || "") === todoOwnerFilter;
        const status = String(row?.status || "");
        const statusOk = todoStatusFilter === "all"
          ? true
          : (todoStatusFilter === "overdue" ? isOverdueTask(row) : status === todoStatusFilter);
        const priorityOk = todoPriorityFilter === "all" ? true : String(row?.priority || "medium") === todoPriorityFilter;
        const typeOk = todoTypeFilter === "all" ? true : String(row?.task_type || "follow_up") === todoTypeFilter;
        return ownerOk && statusOk && priorityOk && typeOk;
      });

      return filtered.sort((a, b) => {
        const aDone = String(a?.status || "") === "done";
        const bDone = String(b?.status || "") === "done";
        if (aDone !== bDone) return aDone ? 1 : -1;
        const priDiff = (priorityRank[String(b?.priority || "medium")] || 0) - (priorityRank[String(a?.priority || "medium")] || 0);
        if (priDiff !== 0) return priDiff;
        return toNumber(a?.due_at, 0) - toNumber(b?.due_at, 0);
      });
    }, [taskRows, todoOwnerFilter, todoStatusFilter, todoPriorityFilter, todoTypeFilter]);

    const todoKpi = React.useMemo(() => {
      const nowTs = Date.now();
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const startTodayTs = startToday.getTime();
      const endTodayTs = startTodayTs + 24 * 60 * 60 * 1000;

      return taskRows.reduce((acc, row) => {
        const status = String(row?.status || "");
        const dueAt = toNumber(row?.due_at, 0);
        const completedAt = toNumber(row?.completed_at, 0);
        if (isOverdueTask(row)) acc.overdue += 1;
        if (status === "in_progress") acc.inProgress += 1;
        if (dueAt >= startTodayTs && dueAt < endTodayTs && status !== "done") acc.dueToday += 1;
        if (completedAt >= startTodayTs && completedAt < endTodayTs) acc.doneToday += 1;
        return acc;
      }, { overdue: 0, inProgress: 0, doneToday: 0, dueToday: 0 });
    }, [taskRows]);

    function setDraftField(key, value) {
      setCrudDraft((prev) => ({ ...prev, [key]: value }));
    }

    function openCreateEntity() {
      setCrudMode("create");
      setCrudDraft({ ...currentEntity.defaults, id: `${String(crudEntity).toUpperCase()}_${Date.now()}` });
      setCrudModalOpen(true);
    }

    function openEditEntity(row) {
      setCrudMode("edit");
      setCrudDraft({ ...row });
      setCrudModalOpen(true);
    }

    async function saveCrudDraft() {
      if (typeof updateTableData !== "function") return;
      setCrudSaving(true);
      try {
        const nowTs = Date.now();
        const pkField = currentEntity.pkField || "id";
        const id = String(crudDraft[pkField] || crudDraft.id || `${String(crudEntity).toUpperCase()}_${nowTs}`);
        const next = {
          ...crudDraft,
          [pkField]: id,
          id,
          updated_at: nowTs,
        };
        if (crudMode === "create" && !next.created_at) next.created_at = nowTs;

        await updateTableData({
          app_id: appId,
          obj_name: currentEntity.tableName,
          command: crudMode === "create" ? "create" : "update",
          pk_fields: [pkField],
          obj_update: next,
          where: { [pkField]: id },
        });

        setCrudModalOpen(false);
        if (notification?.success) {
          notification.success({ message: translate("dataSaved"), duration: 1.5 });
        }
        if (typeof reloadDatabase === "function") await reloadDatabase();
      } catch (error) {
        if (notification?.error) {
          notification.error({ message: translate("dataSaveFailed"), description: error?.message || translate("unknownError") });
        }
      } finally {
        setCrudSaving(false);
      }
    }

    async function deleteEntityRow(row) {
      if (typeof updateTableData !== "function") return;
      try {
        const pkField = currentEntity.pkField || "id";
        const id = String(row[pkField] || row.id || "");
        if (!id) return;
        await updateTableData({
          app_id: appId,
          obj_name: currentEntity.tableName,
          command: "delete",
          pk_fields: [pkField],
          where: { [pkField]: id },
          obj_update: { [pkField]: id },
        });
        if (notification?.success) {
          notification.success({ message: translate("dataDeleted"), duration: 1.5 });
        }
        if (typeof reloadDatabase === "function") await reloadDatabase();
      } catch (error) {
        if (notification?.error) {
          notification.error({ message: translate("dataDeleteFailed"), description: error?.message || translate("unknownError") });
        }
      }
    }

    function confirmDeleteEntity(row) {
      if (Modal && typeof Modal.confirm === "function") {
        Modal.confirm({
          title: translate("crudDeleteTitle"),
          content: translate("confirmDeleteRecord"),
          okText: translate("delete"),
          cancelText: translate("cancel"),
          okButtonProps: { danger: true },
          onOk: () => deleteEntityRow(row),
          className: "crm-dynamic-theme-modal",
          wrapClassName: "crm-dynamic-theme-modal",
        });
        return;
      }
      deleteEntityRow(row);
    }

    async function generateAdCopyWithAI() {
      const ai = window.csmAI || seft;
      if (!ai || typeof ai.generateSeoContentWithPrompt !== "function") {
        if (notification?.warning) notification.warning({ message: translate("aiGenerateFailed"), description: translate("aiBridgeUnavailable") });
        return null;
      }
      const prompt = [
        "Generate ad copy as strict JSON only.",
        "Keys: headline, description, message.",
        `Campaign: ${adForm.campaign_name || "CRM Campaign"}`,
        `Objective: ${adForm.objective || "OUTCOME_TRAFFIC"}`,
        `Landing URL: ${adForm.target_url || ""}`,
        `Brief: ${adForm.ai_brief || ""}`,
      ].join("\n");

      try {
        setAiGenerating(true);
        const result = await ai.generateSeoContentWithPrompt(prompt);
        const raw = typeof result === "string" ? result : (result?.data || result?.result || result?.content || "");
        const textPayload = String(raw || "").trim();
        const jsonText = textPayload.startsWith("```") ? textPayload.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "") : textPayload;
        const parsed = JSON.parse(jsonText);
        const headline = String(parsed.headline || parsed.title || "").trim();
        const description = String(parsed.description || "").trim();
        const messageText = String(parsed.message || parsed.content || "").trim();
        setAdForm((prev) => ({
          ...prev,
          headline: headline || prev.headline,
          description: description || prev.description,
          message: messageText || prev.message,
        }));
        if (notification?.success) notification.success({ message: translate("aiGenerated"), duration: 1.5 });
        return { headline, description, message: messageText };
      } catch (error) {
        if (notification?.error) notification.error({ message: translate("aiGenerateFailed"), description: error?.message || translate("unknownError") });
        return null;
      } finally {
        setAiGenerating(false);
      }
    }

    function normalizeFacebookPagesFromResponse(response, fallbackToken) {
      const payload = response?.data || response?.result || response;
      const sourceRows = Array.isArray(payload?.data)
        ? payload.data
        : (Array.isArray(payload) ? payload : []);
      const rows = sourceRows
        .map((row) => {
          const id = String(row?.id || row?.page_id || "").trim();
          const name = String(row?.name || row?.page_name || id || "").trim();
          const accessToken = String(row?.access_token || row?.page_access_token || row?.token || fallbackToken || "").trim();
          if (!id) return null;
          return {
            id,
            name: name || id,
            access_token: accessToken,
          };
        })
        .filter(Boolean);
      return rows;
    }

    function splitTokenList(raw) {
      return String(raw || "")
        .split(/[\n,;]+/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }

    function uniqueStringList(list) {
      const seen = new Set();
      const out = [];
      (Array.isArray(list) ? list : []).forEach((item) => {
        const value = String(item || "").trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        out.push(value);
      });
      return out;
    }

    function normalizeConfigRows(payload) {
      if (Array.isArray(payload)) return payload;
      const wrapped = payload?.data || payload?.result || payload;
      if (Array.isArray(wrapped)) return wrapped;
      if (Array.isArray(wrapped?.data)) return wrapped.data;
      return [];
    }

    async function loadOptionConfigRows() {
      const readers = [];
      if (typeof seft?.loadDataOptionUser === "function") readers.push(() => seft.loadDataOptionUser());
      if (typeof window?.loadDataOptionUser === "function" && window.loadDataOptionUser !== seft?.loadDataOptionUser) {
        readers.push(() => window.loadDataOptionUser());
      }
      if (typeof window?.csmUserData?.get === "function") {
        readers.push(() => window.csmUserData.get());
      }

      const merged = [];
      for (let i = 0; i < readers.length; i += 1) {
        try {
          const res = await Promise.resolve(readers[i]());
          merged.push(...normalizeConfigRows(res));
        } catch (error) {
          if (debug) console.warn("[CRM Dynamic] Failed to load option user config", error);
        }
      }
      return merged;
    }

    function buildConfiguredFanpagePool(configRows) {
      const byId = {};
      const fallbackTokens = [];

      const addToken = (token) => {
        const value = String(token || "").trim();
        if (!value) return;
        if (!fallbackTokens.includes(value)) fallbackTokens.push(value);
      };

      const addPage = (id, token, name) => {
        const pageId = String(id || "").trim();
        const accessToken = String(token || "").trim();
        const pageName = String(name || pageId || "").trim();
        if (!pageId && !accessToken) return;
        addToken(accessToken);
        if (!pageId) return;
        const prev = byId[pageId] || { id: pageId, name: pageName || pageId, access_token: "" };
        byId[pageId] = {
          ...prev,
          id: pageId,
          name: pageName || prev.name || pageId,
          access_token: accessToken || prev.access_token || "",
        };
      };

      addPage(adForm.fb_page_id, adForm.fb_page_access_token, adForm.fb_page_id);
      splitTokenList(adForm.facebook_user_token).forEach(addToken);

      const inlinePageIds = splitTokenList(adForm.fb_page_id);
      const inlinePageTokens = splitTokenList(adForm.fb_page_access_token);
      inlinePageIds.forEach((id, idx) => addPage(id, inlinePageTokens[idx] || inlinePageTokens[0] || "", id));

      (Array.isArray(configRows) ? configRows : []).forEach((cfg) => {
        if (!cfg || typeof cfg !== "object") return;

        if (Array.isArray(cfg.zalo_fanpages)) {
          cfg.zalo_fanpages.forEach((page) => addPage(
            page?.id,
            page?.access_token || page?.token || page?.page_token,
            page?.name || page?.page_name,
          ));
        }

        if (Array.isArray(cfg.fanpages)) {
          cfg.fanpages.forEach((page) => addPage(
            page?.id,
            page?.access_token || page?.token || page?.page_token,
            page?.name || page?.page_name,
          ));
        }

        if (Array.isArray(cfg.fanpage_ids)) {
          cfg.fanpage_ids.forEach((id, idx) => addPage(
            id,
            cfg?.fanpage_tokens?.[idx] || cfg?.fanpage_token,
            cfg?.fanpage_names?.[idx] || cfg?.fanpage_name,
          ));
        }

        addPage(cfg.fanpage_id || cfg.fb_page_id, cfg.fanpage_token || cfg.fb_page_access_token, cfg.fanpage_name || cfg.fb_page_name);
        splitTokenList(cfg.facebook_user_token || cfg.user_access_token).forEach(addToken);
      });

      return {
        pages: Object.values(byId),
        fallbackTokens: uniqueStringList(fallbackTokens),
      };
    }

    function mergeFanpagesById(basePages, appendPages) {
      const map = {};
      [...(Array.isArray(basePages) ? basePages : []), ...(Array.isArray(appendPages) ? appendPages : [])].forEach((page) => {
        const id = String(page?.id || "").trim();
        const token = String(page?.access_token || page?.token || "").trim();
        const name = String(page?.name || page?.page_name || id || "").trim();
        if (!id) return;
        const prev = map[id] || { id, name: name || id, access_token: "" };
        map[id] = {
          ...prev,
          id,
          name: name || prev.name || id,
          access_token: token || prev.access_token || "",
        };
      });
      return Object.values(map);
    }

    async function loadFacebookPagesWithToken() {
      const userToken = String(adForm.facebook_user_token || "").trim();
      const configRows = await loadOptionConfigRows();
      const configuredPool = buildConfiguredFanpagePool(configRows);
      const tokenCandidates = uniqueStringList([userToken, ...configuredPool.fallbackTokens]);

      if (!tokenCandidates.length && !configuredPool.pages.length) {
        if (notification?.warning) notification.warning({ message: translate("fbPagesLoadFailed"), description: translate("fbUserToken") });
        return;
      }

      setLoadingFacebookPages(true);
      try {
        let pages = configuredPool.pages.slice();
        const runtimeTokens = tokenCandidates.slice();

        // Align with LMKT flow: if exchange API exists, try obtaining a long-lived token first.
        if (userToken && typeof seft?.facebookExchangeToken === "function") {
          try {
            const exchangeRes = await seft.facebookExchangeToken(userToken);
            const longLivedToken = String(exchangeRes?.data?.access_token || exchangeRes?.access_token || "").trim();
            if (longLivedToken && !runtimeTokens.includes(longLivedToken)) {
              runtimeTokens.unshift(longLivedToken);
            }
          } catch (error) {
            if (debug) console.warn("[CRM Dynamic] facebookExchangeToken failed, fallback to raw token", error);
          }
        }

        for (let i = 0; i < runtimeTokens.length; i += 1) {
          const candidateToken = runtimeTokens[i];
          let pagesFromToken = [];

          if (typeof seft?.facebookGetPages === "function") {
            try {
              const pagesRes = await seft.facebookGetPages(candidateToken);
              pagesFromToken = normalizeFacebookPagesFromResponse(pagesRes, candidateToken);
            } catch (error) {
              if (debug) console.warn("[CRM Dynamic] facebookGetPages failed for token candidate", error);
            }
          }

          // Fallback when token is page token (can't list /me/accounts)
          if (!pagesFromToken.length && typeof seft?.facebookValidateToken === "function") {
            try {
              const meRes = await seft.facebookValidateToken(candidateToken);
              const meData = meRes?.data || {};
              const maybePageId = String(meData?.id || "").trim();
              if (maybePageId) {
                pagesFromToken = [{
                  id: maybePageId,
                  name: String(meData?.name || maybePageId),
                  access_token: candidateToken,
                }];
              }
            } catch (error) {
              if (debug) console.warn("[CRM Dynamic] facebookValidateToken failed for token candidate", error);
            }
          }

          if (pagesFromToken.length) {
            pages = mergeFanpagesById(pages, pagesFromToken);
          }
        }

        if (!pages.length) {
          throw new Error(translate("fbNoPagesFound"));
        }

        pages = mergeFanpagesById(pages, []);
        setFacebookPages(pages);
        setSelectedFacebookPageIds(normalizeSelectedPageIds(pages.map((item) => item.id)));
        setAdForm((prev) => ({
          ...prev,
          fb_page_id: pages[0]?.id || prev.fb_page_id,
          fb_page_access_token: pages[0]?.access_token || prev.fb_page_access_token,
        }));
        if (notification?.success) {
          notification.success({
            message: translate("fbPagesLoaded"),
            description: translate("pagesCountDesc", { count: pages.length }),
            duration: 2,
          });
        }
      } catch (error) {
        if (notification?.error) {
          notification.error({
            message: translate("fbPagesLoadFailed"),
            description: error?.message || translate("unknownError"),
          });
        }
      } finally {
        setLoadingFacebookPages(false);
      }
    }

    const loadOpsData = React.useCallback(async () => {
      setLoadingOps(true);
      try {
        const [crmRes, websiteRes, adsStatsRes, adsListRes, googlebotRes, quotaRes, queueRes] = await Promise.allSettled([
          typeof csmApi.getCRMStats === "function" ? csmApi.getCRMStats({ appId }) : Promise.resolve(null),
          typeof csmApi.getWebsiteStats === "function" ? csmApi.getWebsiteStats({ appId }) : Promise.resolve(null),
          typeof csmApi.getAdsStats === "function" ? csmApi.getAdsStats({ appId, platform: "all" }) : Promise.resolve(null),
          typeof csmApi.getAds === "function" ? csmApi.getAds({ appId, limit: 50, offset: 0 }) : Promise.resolve(null),
          typeof csmApi.getGooglebotStats === "function" ? csmApi.getGooglebotStats({ limit: 30 }) : Promise.resolve(null),
          typeof csmApi.checkGoogleIndexQuota === "function" ? csmApi.checkGoogleIndexQuota() : Promise.resolve(null),
          typeof csmApi.getQueueInfo === "function" ? csmApi.getQueueInfo() : Promise.resolve(null),
        ]);

        const crmPayload = crmRes.status === "fulfilled" ? unwrapApiEnvelope(crmRes.value) : null;
        const websitePayload = websiteRes.status === "fulfilled" ? unwrapApiEnvelope(websiteRes.value) : null;
        const adsStatsPayload = adsStatsRes.status === "fulfilled" ? unwrapApiEnvelope(adsStatsRes.value) : null;
        const adsListPayload = adsListRes.status === "fulfilled" ? unwrapApiEnvelope(adsListRes.value) : null;
        const googlebotPayload = googlebotRes.status === "fulfilled" ? unwrapApiEnvelope(googlebotRes.value) : null;
        const quotaPayload = quotaRes.status === "fulfilled" ? unwrapApiEnvelope(quotaRes.value) : null;
        const queuePayload = queueRes.status === "fulfilled" ? unwrapApiEnvelope(queueRes.value) : null;

        setOpsData({
          crmStats: (crmPayload && typeof crmPayload === "object") ? crmPayload : {},
          websiteStats: (websitePayload && typeof websitePayload === "object") ? websitePayload : {},
          adsStats: (adsStatsPayload && typeof adsStatsPayload === "object") ? adsStatsPayload : {},
          googlebotStats: (googlebotPayload && typeof googlebotPayload === "object") ? googlebotPayload : {},
          indexQuota: (quotaPayload && typeof quotaPayload === "object") ? quotaPayload : {},
          queueInfo: (queuePayload && typeof queuePayload === "object") ? queuePayload : {},
          adsRows: toRows(adsListPayload),
          updatedAt: Date.now(),
          error: "",
        });
      } catch (error) {
        const errorMessage = error?.message || translate("opsLoadError");
        setOpsData((prev) => ({ ...prev, error: errorMessage, updatedAt: Date.now() }));
        if (notification?.warning) {
          notification.warning({
            message: translate("opsTitle"),
            description: errorMessage,
            duration: 2,
          });
        }
      } finally {
        setLoadingOps(false);
      }
    }, []);

    React.useEffect(() => {
      loadOpsData();
      const timer = setInterval(loadOpsData, OPS_REFRESH_MS);
      return () => clearInterval(timer);
    }, [loadOpsData]);

    const handleCreateAd = React.useCallback(async (options) => {
      const forceGenerate = Boolean(options && options.forceGenerate);
      const forceActivate = Boolean(options && options.forceActivate);
      if (typeof csmApi.createAd !== "function") {
        if (notification?.error) {
          notification.error({ message: translate("adUnavailable") });
        }
        return;
      }
      if (!String(adForm.target_url || "").trim()) {
        if (notification?.warning) {
          notification.warning({ message: translate("adTargetRequired") });
        }
        return;
      }

      setSubmittingAd(true);
      try {
        let aiPayload = null;
        if (forceGenerate || !String(adForm.message || "").trim() || !String(adForm.headline || "").trim()) {
          aiPayload = await generateAdCopyWithAI();
        }

        const platforms = adForm.platform === "all" ? ["facebook", "google"] : [adForm.platform || "facebook"];
        const status = (forceActivate || adForm.auto_activate) ? "active" : "paused";
        const campaignName = adForm.campaign_name || `Campaign ${new Date().toISOString().slice(0, 10)}`;
        const generatedHeadline = (aiPayload?.headline || adForm.headline || campaignName).trim();
        const generatedDescription = (aiPayload?.description || adForm.description || "").trim();
        const generatedMessage = (aiPayload?.message || adForm.message || generatedHeadline).trim();

        const selectedIdSet = new Set(normalizeSelectedPageIds(selectedFacebookPageIds));
        const selectedFanpages = facebookPages.filter((page) => selectedIdSet.has(normalizePageId(page.id)));
        if (platforms.includes("facebook") && !selectedFanpages.length && !String(adForm.fb_page_id || "").trim()) {
          throw new Error(translate("fbPageRequired"));
        }
        if (platforms.includes("facebook") && selectedFanpages.some((page) => !String(page?.access_token || "").trim())) {
          throw new Error(translate("fbPageTokenRequired"));
        }

        for (let i = 0; i < platforms.length; i += 1) {
          const platform = platforms[i];
          const facebookTargets = platform === "facebook"
            ? (selectedFanpages.length
              ? selectedFanpages
              : [{ id: adForm.fb_page_id, name: adForm.fb_page_id, access_token: adForm.fb_page_access_token }])
            : [null];

          for (let t = 0; t < facebookTargets.length; t += 1) {
            const target = facebookTargets[t];
            const payload = {
              app_id: appId,
              platform,
              campaign_name: campaignName,
              objective: adForm.objective || "OUTCOME_TRAFFIC",
              budget: toNumber(adForm.budget, 0),
              target_url: adForm.target_url,
              message: generatedMessage,
              name: generatedHeadline,
              status,
              created_at: Date.now(),
              metadata: JSON.stringify({
                headline: generatedHeadline,
                description: generatedDescription,
                ai_brief: adForm.ai_brief,
                credentials: {
                  fb_page_id: target?.id || adForm.fb_page_id,
                  fb_page_access_token: (target?.access_token || adForm.fb_page_access_token) ? "***" : "",
                  gg_customer_id: adForm.gg_customer_id,
                  gg_access_token: adForm.gg_access_token ? "***" : "",
                  gg_developer_token: adForm.gg_developer_token ? "***" : "",
                  gg_login_customer_id: adForm.gg_login_customer_id,
                },
              }),
              fb_page_id: target?.id || adForm.fb_page_id,
              fb_page_access_token: target?.access_token || adForm.fb_page_access_token,
              gg_customer_id: adForm.gg_customer_id,
              gg_access_token: adForm.gg_access_token,
              gg_developer_token: adForm.gg_developer_token,
              gg_login_customer_id: adForm.gg_login_customer_id,
            };

            const res = await csmApi.createAd(payload);
            const ok = res?.success !== false;
            if (!ok) {
              throw new Error(res?.message || translate("adCreateFailed"));
            }
          }
        }

        if (typeof updateTableData === "function") {
          updateTableData({
            app_id: appId,
            obj_name: "crm_ads_budget_logs",
            command: "create",
            pk_fields: ["id"],
            obj_update: {
              id: `adlog_${Date.now()}`,
              app_id: appId,
              platform: adForm.platform,
              campaign_name: campaignName,
              budget: toNumber(adForm.budget, 0),
              target_url: adForm.target_url,
              objective: adForm.objective,
              status,
              created_at: Date.now(),
            },
          }).catch(() => null);
        }

        if (forceActivate || adForm.auto_push_facebook) {
          const selectedIdSet = new Set(normalizeSelectedPageIds(selectedFacebookPageIds));
          const publishTargets = facebookPages.filter((page) => selectedIdSet.has(normalizePageId(page.id)));
          const fallbackTarget = String(adForm.fb_page_id || "").trim() && String(adForm.fb_page_access_token || "").trim()
            ? [{ id: adForm.fb_page_id, access_token: adForm.fb_page_access_token }]
            : [];
          const targets = publishTargets.length ? publishTargets : fallbackTarget;
          for (let p = 0; p < targets.length; p += 1) {
            const target = targets[p];
            if (!target?.id || !target?.access_token) continue;
            try {
              if (typeof seft?.postToFacebook === "function") {
                await seft.postToFacebook(target.id, target.access_token, generatedMessage, null, adForm.target_url);
              }
            } catch (fbError) {
              if (debug) console.warn("[CRM Dynamic] Auto publish to Facebook failed", fbError);
            }
          }
        }

        if (notification?.success) {
          notification.success({
            message: translate("adCreated"),
            description: `${adForm.platform.toUpperCase()} - ${campaignName}`,
            duration: 2,
          });
        }
        loadOpsData();
        if (typeof reloadDatabase === "function") {
          await reloadDatabase();
        }
      } catch (error) {
        if (notification?.error) {
          notification.error({
            message: translate("adCreateFailed"),
            description: error?.message || translate("unknownError"),
            duration: 3,
          });
        }
      } finally {
        setSubmittingAd(false);
      }
    }, [adForm, facebookPages, selectedFacebookPageIds, loadOpsData, reloadDatabase]);

    const sourceColumns = [
      { title: translate("source"), dataIndex: "source", key: "source", width: 140 },
      { title: translate("leads"), dataIndex: "leads", key: "leads", width: 90 },
      { title: translate("closedDeals"), dataIndex: "closed", key: "closed", width: 110 },
      {
        title: translate("rate"),
        dataIndex: "closeRate",
        key: "closeRate",
        width: 110,
        render: (value) => formatPercent(value),
      },
      {
        title: translate("expectedValue"),
        dataIndex: "expectedValue",
        key: "expectedValue",
        render: (value) => formatCurrency(value),
      },
    ];

    const adsColumns = [
      { title: translate("platformLabel"), dataIndex: "platform", key: "platform", width: 110 },
      { title: translate("campaign"), dataIndex: "campaign_name", key: "campaign_name" },
      {
        title: translate("budget"),
        dataIndex: "budget",
        key: "budget",
        width: 140,
        render: (value) => formatCurrency(value),
      },
      { title: translate("status"), dataIndex: "status", key: "status", width: 120 },
    ];

    const crudColumns = [
      {
        title: translate("idLabel"),
        dataIndex: currentEntity.pkField || "id",
        key: "id",
        width: 180,
      },
      ...currentEntity.fields
        .filter((field) => field !== (currentEntity.pkField || "id") && field !== "id")
        .slice(0, 4)
        .map((field) => ({
          title: getFieldLabel(field),
          dataIndex: field,
          key: field,
          ellipsis: true,
          render: (value) => (value === undefined || value === null ? "" : String(value)),
        })),
      {
        title: translate("actions"),
        key: "actions",
        width: 160,
        render: (_, row) => {
          return React.createElement("div", { style: { display: "flex", gap: 6 } }, [
            React.createElement(Button, {
              key: `edit_${String(row[currentEntity.pkField || "id"] || row.id)}`,
              size: "small",
              onClick: () => openEditEntity(row),
            }, translate("edit")),
            React.createElement(Button, {
              key: `del_${String(row[currentEntity.pkField || "id"] || row.id)}`,
              danger: true,
              size: "small",
              onClick: () => confirmDeleteEntity(row),
            }, translate("delete")),
          ]);
        },
      },
    ];

    const headerRowStyle = {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
    };

    const uiPalette = React.useMemo(() => ({
      danger: themeTokens.dangerText || themeTokens.danger,
      success: themeTokens.success,
      warning: themeTokens.warning,
      info: themeTokens.info || themeTokens.primary,
      accentA: themeTokens.primary,
      accentB: themeTokens.info || themeTokens.primary,
      accentC: themeTokens.warning,
      accentD: themeTokens.success,
      accentE: themeTokens.primary,
      accentF: themeTokens.info || themeTokens.primary,
    }), [themeTokens]);

    const configProviderTheme = React.useMemo(() => {
      const darkAlgorithm = antdTheme.darkAlgorithm;
      const defaultAlgorithm = antdTheme.defaultAlgorithm;
      return {
        algorithm: themeTokens.isDark ? (darkAlgorithm || defaultAlgorithm) : defaultAlgorithm,
        token: {
          colorPrimary: themeTokens.primary,
          colorInfo: themeTokens.info || themeTokens.primary,
          colorSuccess: themeTokens.success,
          colorWarning: themeTokens.warning,
          colorError: themeTokens.danger,
          colorBgLayout: themeTokens.bg,
          colorBgContainer: themeTokens.cardBg,
          colorBorder: themeTokens.border,
          colorText: themeTokens.text,
          colorTextSecondary: themeTokens.textSecondary,
          colorTextTertiary: themeTokens.textTertiary,
          colorFillSecondary: themeTokens.subtleBg,
          colorFillTertiary: themeTokens.cardBgMuted,
        },
      };
    }, [
      antdTheme.darkAlgorithm,
      antdTheme.defaultAlgorithm,
      themeTokens.bg,
      themeTokens.cardBg,
      themeTokens.cardBgMuted,
      themeTokens.danger,
      themeTokens.border,
      themeTokens.info,
      themeTokens.isDark,
      themeTokens.primary,
      themeTokens.success,
      themeTokens.subtleBg,
      themeTokens.text,
      themeTokens.textSecondary,
      themeTokens.textTertiary,
      themeTokens.warning,
    ]);

    const resolvePopupContainer = React.useCallback((node) => {
      if (node && typeof node.closest === "function") {
        const scopedRoot = node.closest(".crm-dynamic-theme");
        if (scopedRoot) return scopedRoot;
      }
      return container;
    }, []);

    const runtimeThemeCss = React.useMemo(() => {
      return `
        .crm-dynamic-theme {
          color: ${themeTokens.text};
          background: ${themeTokens.bg};
        }
        .crm-dynamic-theme .ant-card,
        .crm-dynamic-theme .ant-card .ant-card-head,
        .crm-dynamic-theme .ant-card .ant-card-body {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .crm-workspace-theme {
          background: ${themeTokens.bg} !important;
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .crm-workspace-theme .ant-typography,
        .crm-dynamic-theme .crm-workspace-theme .ant-statistic-content,
        .crm-dynamic-theme .crm-workspace-theme .ant-statistic-title {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-card .ant-card-head-title,
        .crm-dynamic-theme .ant-card .ant-card-extra,
        .crm-dynamic-theme .ant-typography,
        .crm-dynamic-theme .ant-form-item-label > label {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-table-wrapper .ant-table,
        .crm-dynamic-theme .ant-table-wrapper .ant-table-container,
        .crm-dynamic-theme .ant-table-wrapper .ant-table-content,
        .crm-dynamic-theme .ant-table-wrapper .ant-table-tbody > tr > td,
        .crm-dynamic-theme .ant-table-wrapper .ant-table-thead > tr > th,
        .crm-dynamic-theme .ant-table-wrapper .ant-table-cell {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-table-wrapper .ant-table-thead > tr > th {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.textSecondary} !important;
        }
        .crm-dynamic-theme .ant-tabs,
        .crm-dynamic-theme .ant-tabs-content,
        .crm-dynamic-theme .ant-tabs-tabpane,
        .crm-dynamic-theme .ant-segmented,
        .crm-dynamic-theme .ant-calendar,
        .crm-dynamic-theme .ant-picker-panel,
        .crm-dynamic-theme .ant-list,
        .crm-dynamic-theme .ant-empty,
        .crm-dynamic-theme .ant-statistic,
        .crm-dynamic-theme .ant-statistic-content,
        .crm-dynamic-theme .ant-statistic-title {
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-tabs-nav,
        .crm-dynamic-theme .ant-tabs-ink-bar,
        .crm-dynamic-theme .ant-tabs-tab,
        .crm-dynamic-theme .ant-tabs-tab .ant-tabs-tab-btn,
        .crm-dynamic-theme .ant-segmented-item,
        .crm-dynamic-theme .ant-radio-button-wrapper,
        .crm-dynamic-theme .ant-divider,
        .crm-dynamic-theme .ant-empty-description {
          color: ${themeTokens.textSecondary} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-tabs-tab {
          background: ${themeTokens.cardBg} !important;
        }
        .crm-dynamic-theme .ant-tabs-tab:hover,
        .crm-dynamic-theme .ant-tabs-tab:hover .ant-tabs-tab-btn {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-segmented {
          background: ${themeTokens.cardBgMuted} !important;
          border: 1px solid ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-segmented-item {
          background: transparent !important;
        }
        .crm-dynamic-theme .ant-radio-group,
        .crm-dynamic-theme .ant-radio-group-solid {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-radio-button-wrapper {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.textSecondary} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-radio-button-wrapper:hover {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-tabs-tab-active .ant-tabs-tab-btn,
        .crm-dynamic-theme .ant-tabs-tab-active,
        .crm-dynamic-theme .ant-segmented-item-selected,
        .crm-dynamic-theme .ant-segmented-item-selected .ant-segmented-item-label,
        .crm-dynamic-theme .ant-radio-group-solid .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled),
        .crm-dynamic-theme .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
          color: ${themeTokens.text} !important;
          background: ${themeTokens.cardBgMuted} !important;
          border-color: ${themeTokens.primary} !important;
          box-shadow: none !important;
        }
        .crm-dynamic-theme .ant-picker-panel,
        .crm-dynamic-theme .ant-picker-header,
        .crm-dynamic-theme .ant-picker-content th,
        .crm-dynamic-theme .ant-picker-cell,
        .crm-dynamic-theme .ant-picker-cell-inner {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-alert,
        .crm-dynamic-theme .ant-alert-message,
        .crm-dynamic-theme .ant-alert-description {
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal.ant-modal,
        .crm-dynamic-theme-modal .ant-modal,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-content,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-content,
        .crm-dynamic-theme-modal .ant-modal-content,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-header,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-header,
        .crm-dynamic-theme-modal .ant-modal-header,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-body,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-body,
        .crm-dynamic-theme-modal .ant-modal-body,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-footer,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-footer,
        .crm-dynamic-theme-modal .ant-modal-footer,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-title,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-title,
        .crm-dynamic-theme-modal .ant-modal-title,
        .crm-dynamic-theme-modal .ant-modal-confirm .ant-modal-confirm-title,
        .crm-dynamic-theme-modal .ant-modal-confirm .ant-modal-confirm-content,
        .crm-workspace-theme-modal.ant-modal,
        .crm-workspace-theme-modal .ant-modal,
        .crm-workspace-theme-modal .ant-modal .ant-modal-content,
        .crm-workspace-theme-modal.ant-modal .ant-modal-content,
        .crm-workspace-theme-modal .ant-modal-content,
        .crm-workspace-theme-modal .ant-modal .ant-modal-header,
        .crm-workspace-theme-modal.ant-modal .ant-modal-header,
        .crm-workspace-theme-modal .ant-modal-header,
        .crm-workspace-theme-modal .ant-modal .ant-modal-body,
        .crm-workspace-theme-modal.ant-modal .ant-modal-body,
        .crm-workspace-theme-modal .ant-modal-body,
        .crm-workspace-theme-modal .ant-modal .ant-modal-footer,
        .crm-workspace-theme-modal.ant-modal .ant-modal-footer,
        .crm-workspace-theme-modal .ant-modal-footer,
        .crm-workspace-theme-modal .ant-modal .ant-modal-title,
        .crm-workspace-theme-modal.ant-modal .ant-modal-title,
        .crm-workspace-theme-modal .ant-modal-title,
        .crm-workspace-theme-modal .ant-modal-confirm .ant-modal-confirm-title,
        .crm-workspace-theme-modal .ant-modal-confirm .ant-modal-confirm-content {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal.ant-modal .ant-modal-content,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-content,
        .crm-dynamic-theme-modal .ant-modal-content,
        .crm-workspace-theme-modal.ant-modal .ant-modal-content,
        .crm-workspace-theme-modal .ant-modal .ant-modal-content,
        .crm-workspace-theme-modal .ant-modal-content {
          box-shadow: 0 20px 50px rgba(0, 0, 0, ${themeTokens.isDark ? "0.48" : "0.18"}) !important;
        }
        .crm-dynamic-theme-modal.ant-modal-root .ant-modal-mask,
        .crm-dynamic-theme-modal .ant-modal-root .ant-modal-mask,
        .crm-workspace-theme-modal.ant-modal-root .ant-modal-mask,
        .crm-workspace-theme-modal .ant-modal-root .ant-modal-mask,
        .crm-workspace-theme-modal.ant-modal-wrap + .ant-modal-root .ant-modal-mask,
        .crm-dynamic-theme-modal.ant-modal-wrap + .ant-modal-root .ant-modal-mask {
          background: rgba(0, 0, 0, ${themeTokens.isDark ? "0.72" : "0.45"}) !important;
        }
        .crm-dynamic-theme-modal .ant-modal .ant-modal-close,
        .crm-dynamic-theme-modal .ant-modal .ant-modal-close-x,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-close,
        .crm-dynamic-theme-modal.ant-modal .ant-modal-close-x,
        .crm-workspace-theme-modal .ant-modal .ant-modal-close,
        .crm-workspace-theme-modal .ant-modal .ant-modal-close-x,
        .crm-workspace-theme-modal.ant-modal .ant-modal-close,
        .crm-workspace-theme-modal.ant-modal .ant-modal-close-x {
          color: ${themeTokens.textSecondary} !important;
        }
        .crm-dynamic-theme-modal .ant-form-item-label > label,
        .crm-dynamic-theme-modal .ant-form-item-explain,
        .crm-dynamic-theme-modal .ant-form-item-extra,
        .crm-dynamic-theme-modal .ant-typography,
        .crm-dynamic-theme-modal .ant-spin-text,
        .crm-workspace-theme-modal .ant-form-item-label > label,
        .crm-workspace-theme-modal .ant-form-item-explain,
        .crm-workspace-theme-modal .ant-form-item-extra,
        .crm-workspace-theme-modal .ant-typography,
        .crm-workspace-theme-modal .ant-spin-text,
        .crm-workspace-theme-modal .ant-empty-description {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme-modal .ant-form-item-label > label,
        .crm-workspace-theme-modal .ant-form-item-label > label {
          background: ${themeTokens.isDark ? themeTokens.subtleBg : themeTokens.cardBgMuted} !important;
          border: 1px solid ${themeTokens.border} !important;
          border-radius: 8px !important;
          padding: 2px 8px !important;
          min-height: 28px !important;
          display: inline-flex !important;
          align-items: center !important;
          line-height: 1.2 !important;
        }
        .crm-dynamic-theme-modal .ant-form-item-required::before,
        .crm-workspace-theme-modal .ant-form-item-required::before {
          color: ${themeTokens.danger} !important;
        }
        .crm-dynamic-theme-modal .ant-input,
        .crm-dynamic-theme-modal .ant-input-affix-wrapper,
        .crm-dynamic-theme-modal .ant-input-outlined,
        .crm-dynamic-theme-modal .ant-input-password,
        .crm-dynamic-theme-modal .ant-input-textarea,
        .crm-dynamic-theme-modal .ant-input-number,
        .crm-dynamic-theme-modal .ant-input-number-input,
        .crm-dynamic-theme-modal .ant-picker,
        .crm-dynamic-theme-modal textarea,
        .crm-dynamic-theme-modal input,
        .crm-dynamic-theme-modal select,
        .crm-workspace-theme-modal .ant-input,
        .crm-workspace-theme-modal .ant-input-affix-wrapper,
        .crm-workspace-theme-modal .ant-input-outlined,
        .crm-workspace-theme-modal .ant-input-password,
        .crm-workspace-theme-modal .ant-input-textarea,
        .crm-workspace-theme-modal .ant-input-number,
        .crm-workspace-theme-modal .ant-input-number-input,
        .crm-workspace-theme-modal .ant-picker,
        .crm-workspace-theme-modal textarea,
        .crm-workspace-theme-modal input,
        .crm-workspace-theme-modal select {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-input::placeholder,
        .crm-dynamic-theme-modal textarea::placeholder,
        .crm-dynamic-theme-modal input::placeholder,
        .crm-workspace-theme-modal .ant-input::placeholder,
        .crm-workspace-theme-modal textarea::placeholder,
        .crm-workspace-theme-modal input::placeholder {
          color: ${themeTokens.textTertiary} !important;
        }
        .crm-dynamic-theme-modal .ant-select .ant-select-selector,
        .crm-dynamic-theme-modal .ant-select-single:not(.ant-select-customize-input) .ant-select-selector,
        .crm-workspace-theme-modal .ant-select .ant-select-selector,
        .crm-workspace-theme-modal .ant-select-single:not(.ant-select-customize-input) .ant-select-selector {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-select .ant-select-selection-placeholder,
        .crm-dynamic-theme-modal .ant-select .ant-select-selection-item,
        .crm-workspace-theme-modal .ant-select .ant-select-selection-placeholder,
        .crm-workspace-theme-modal .ant-select .ant-select-selection-item,
        .crm-workspace-theme-modal .ant-picker-input > input,
        .crm-workspace-theme-modal .ant-input-number-input,
        .crm-dynamic-theme-modal .ant-picker-input > input,
        .crm-dynamic-theme-modal .ant-input-number-input {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme-modal .ant-select-arrow,
        .crm-dynamic-theme-modal .ant-select-clear,
        .crm-dynamic-theme-modal .ant-picker-suffix,
        .crm-dynamic-theme-modal .ant-picker-clear,
        .crm-dynamic-theme-modal .ant-input-password-icon,
        .crm-workspace-theme-modal .ant-select-arrow,
        .crm-workspace-theme-modal .ant-select-clear,
        .crm-workspace-theme-modal .ant-picker-suffix,
        .crm-workspace-theme-modal .ant-picker-clear,
        .crm-workspace-theme-modal .ant-input-password-icon {
          color: ${themeTokens.textSecondary} !important;
        }
        .crm-dynamic-theme-modal .ant-select-open .ant-select-selection-item,
        .crm-workspace-theme-modal .ant-select-open .ant-select-selection-item {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme-modal .ant-input-number-handler-wrap,
        .crm-workspace-theme-modal .ant-input-number-handler-wrap {
          background: ${themeTokens.cardBg} !important;
          border-inline-start: 1px solid ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-input-number-handler,
        .crm-workspace-theme-modal .ant-input-number-handler {
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-btn-default,
        .crm-dynamic-theme-modal .ant-btn-dashed,
        .crm-dynamic-theme-modal .ant-btn-text,
        .crm-workspace-theme-modal .ant-btn-default,
        .crm-workspace-theme-modal .ant-btn-dashed,
        .crm-workspace-theme-modal .ant-btn-text {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-btn-default:hover,
        .crm-dynamic-theme-modal .ant-btn-dashed:hover,
        .crm-dynamic-theme-modal .ant-btn-text:hover,
        .crm-workspace-theme-modal .ant-btn-default:hover,
        .crm-workspace-theme-modal .ant-btn-dashed:hover,
        .crm-workspace-theme-modal .ant-btn-text:hover {
          background: ${themeTokens.subtleBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.primary} !important;
        }
        .crm-dynamic-theme-modal .ant-btn-color-primary,
        .crm-workspace-theme-modal .ant-btn-color-primary {
          color: ${themeTokens.isDark ? "#0b1220" : "#ffffff"} !important;
        }
        .crm-dynamic-theme-modal .ant-btn[disabled],
        .crm-dynamic-theme-modal .ant-btn:disabled,
        .crm-workspace-theme-modal .ant-btn[disabled],
        .crm-workspace-theme-modal .ant-btn:disabled,
        .crm-dynamic-theme-modal .ant-input[disabled],
        .crm-dynamic-theme-modal .ant-input-affix-wrapper-disabled,
        .crm-dynamic-theme-modal .ant-picker.ant-picker-disabled,
        .crm-dynamic-theme-modal .ant-input-number-disabled,
        .crm-workspace-theme-modal .ant-input[disabled],
        .crm-workspace-theme-modal .ant-input-affix-wrapper-disabled,
        .crm-workspace-theme-modal .ant-picker.ant-picker-disabled,
        .crm-workspace-theme-modal .ant-input-number-disabled,
        .crm-dynamic-theme-modal .ant-select-disabled .ant-select-selector,
        .crm-workspace-theme-modal .ant-select-disabled .ant-select-selector {
          background: ${themeTokens.subtleBg} !important;
          color: ${themeTokens.textSecondary} !important;
          border-color: ${themeTokens.border} !important;
          opacity: 1 !important;
        }
        .crm-dynamic-theme-modal input:-webkit-autofill,
        .crm-dynamic-theme-modal input:-webkit-autofill:hover,
        .crm-dynamic-theme-modal input:-webkit-autofill:focus,
        .crm-workspace-theme-modal input:-webkit-autofill,
        .crm-workspace-theme-modal input:-webkit-autofill:hover,
        .crm-workspace-theme-modal input:-webkit-autofill:focus {
          -webkit-text-fill-color: ${themeTokens.text} !important;
          -webkit-box-shadow: 0 0 0 1000px ${themeTokens.cardBgMuted} inset !important;
          transition: background-color 9999s ease-in-out 0s !important;
        }
        .crm-dynamic-theme-modal .ant-select-dropdown,
        .crm-dynamic-theme-modal .ant-select-item,
        .crm-dynamic-theme-modal .ant-select-item-option-content,
        .crm-dynamic-theme-modal .ant-select-item-empty,
        .crm-dynamic-theme-modal .ant-picker-dropdown .ant-picker-panel-container,
        .crm-dynamic-theme-modal .ant-picker-panel,
        .crm-dynamic-theme-modal .ant-picker-header,
        .crm-dynamic-theme-modal .ant-picker-content th,
        .crm-dynamic-theme-modal .ant-picker-cell,
        .crm-dynamic-theme-modal .ant-picker-cell-inner,
        .crm-workspace-theme-modal .ant-select-dropdown,
        .crm-workspace-theme-modal .ant-select-item,
        .crm-workspace-theme-modal .ant-select-item-option-content,
        .crm-workspace-theme-modal .ant-select-item-empty,
        .crm-workspace-theme-modal .ant-picker-dropdown .ant-picker-panel-container,
        .crm-workspace-theme-modal .ant-picker-panel,
        .crm-workspace-theme-modal .ant-picker-header,
        .crm-workspace-theme-modal .ant-picker-content th,
        .crm-workspace-theme-modal .ant-picker-cell,
        .crm-workspace-theme-modal .ant-picker-cell-inner {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme-modal .ant-select-item-option-active:not(.ant-select-item-option-disabled),
        .crm-dynamic-theme-modal .ant-select-item-option-selected:not(.ant-select-item-option-disabled),
        .crm-workspace-theme-modal .ant-select-item-option-active:not(.ant-select-item-option-disabled),
        .crm-workspace-theme-modal .ant-select-item-option-selected:not(.ant-select-item-option-disabled),
        .crm-dynamic-theme-modal .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner,
        .crm-workspace-theme-modal .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner {
          background: ${themeTokens.subtleBg} !important;
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme .ant-input,
        .crm-dynamic-theme .ant-input-affix-wrapper,
        .crm-dynamic-theme .ant-input-outlined,
        .crm-dynamic-theme .ant-input-password,
        .crm-dynamic-theme .ant-input-textarea,
        .crm-dynamic-theme textarea,
        .crm-dynamic-theme input,
        .crm-dynamic-theme select {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-input::placeholder,
        .crm-dynamic-theme textarea::placeholder,
        .crm-dynamic-theme input::placeholder {
          color: ${themeTokens.textTertiary} !important;
        }
        .crm-dynamic-theme .ant-select .ant-select-selector,
        .crm-dynamic-theme .ant-select-single:not(.ant-select-customize-input) .ant-select-selector {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-select .ant-select-selection-placeholder {
          color: ${themeTokens.textTertiary} !important;
        }
        .crm-dynamic-theme .ant-btn-default,
        .crm-dynamic-theme .ant-btn-dashed,
        .crm-dynamic-theme .ant-btn-text {
          background: ${themeTokens.cardBgMuted} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-theme .ant-btn-default:hover,
        .crm-dynamic-theme .ant-btn-dashed:hover,
        .crm-dynamic-theme .ant-btn-text:hover {
          background: ${themeTokens.subtleBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.primary} !important;
        }
        .crm-dynamic-theme .ant-checkbox-wrapper,
        .crm-dynamic-theme .ant-radio-wrapper,
        .crm-dynamic-theme .ant-tag {
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-theme pre,
        .crm-dynamic-theme code {
          background: ${themeTokens.cardBgMuted};
          color: ${themeTokens.text};
          border: 1px solid ${themeTokens.border};
          border-radius: 8px;
        }
        .crm-dynamic-popup,
        .crm-dynamic-popup .ant-select-dropdown,
        .crm-dynamic-popup .ant-select-item,
        .crm-dynamic-popup .ant-select-item-option-content,
        .crm-dynamic-popup .ant-select-item-empty,
        .crm-dynamic-popover,
        .crm-dynamic-popover .ant-popover-inner,
        .crm-dynamic-popover .ant-popover-title,
        .crm-dynamic-popover .ant-popover-inner-content {
          background: ${themeTokens.cardBg} !important;
          color: ${themeTokens.text} !important;
          border-color: ${themeTokens.border} !important;
        }
        .crm-dynamic-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled),
        .crm-dynamic-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
          background: ${themeTokens.subtleBg} !important;
          color: ${themeTokens.text} !important;
        }
        .crm-dynamic-popover .ant-popover-arrow::before {
          background: ${themeTokens.cardBg} !important;
          border-color: ${themeTokens.border} !important;
        }
      `;
    }, [themeTokens]);

    const metricCard = (label, value, color) => React.createElement("div", {
      style: {
        border: `1px solid ${themeTokens.border}`,
        borderRadius: 12,
        padding: 10,
        background: themeTokens.cardBgMuted,
        minHeight: 76,
      },
      key: label,
    }, [
      React.createElement("div", { key: `${label}_k`, style: { fontSize: 11, color: themeTokens.textSecondary, marginBottom: 4 } }, label),
      React.createElement("div", { key: `${label}_v`, style: { fontSize: 18, fontWeight: 700, color: color || themeTokens.text } }, value),
    ]);

    const shellNode = React.createElement("div", {
      className: "crm-dynamic-theme",
      style: {
        display: "grid",
        gap: 12,
        color: themeTokens.text,
        background: themeTokens.bg,
        width: "100%",
        maxWidth: 1280,
        margin: "0 auto",
        padding: "4px 6px 10px",
        overflowX: "hidden",
      },
    }, [
      React.createElement("style", { key: "crm-theme-style" }, runtimeThemeCss),
      Tabs ? React.createElement(Tabs, {
        key: "hub-nav-tabs",
        activeKey: activeHubTab,
        onChange: setActiveHubTab,
        type: "card",
        size: "middle",
        style: { marginBottom: 0 },
        tabBarStyle: { marginBottom: 0, paddingBottom: 0 },
        items: [
          { key: "crm", label: localizedCrmConfig.title || translate("crmTitle") },
          { key: "data", label: translate("crmCrudTitle") },
          { key: "sales", label: translate("salesTodoTitle") },
          { key: "marketing", label: translate("opsTitle") },
        ],
      }) : null,
      activeHubTab === "marketing" ? React.createElement(Card, {
        key: "ops-summary",
        title: React.createElement("div", { style: { display: "grid", gap: 2 } }, [
          React.createElement("div", { key: "title", style: { fontWeight: 700, color: themeTokens.text } }, translate("opsTitle")),
          React.createElement("div", { key: "sub", style: { fontSize: 12, color: themeTokens.textSecondary } }, translate("opsSubtitle")),
        ]),
        style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
        styles: { body: { padding: 14 } },
        extra: React.createElement(Space, { size: 8 }, [
          React.createElement("span", { key: "time", style: { color: themeTokens.textSecondary, fontSize: 12 } }, `${translate("updatedAt")}: ${new Date(opsData.updatedAt).toLocaleTimeString(getLocaleCode(language))}`),
          React.createElement(Button, { key: "refresh", loading: loadingOps, onClick: loadOpsData, size: "small" }, translate("refresh")),
        ]),
      }, [
        opsData.error
          ? React.createElement("div", {
            key: "err",
            style: {
              padding: 10,
              borderRadius: 8,
              background: themeTokens.dangerBg,
              border: `1px solid ${themeTokens.dangerBorder}`,
              color: themeTokens.dangerText,
              marginBottom: 12,
            },
          }, opsData.error)
          : null,
        React.createElement("div", { key: "metrics", style: headerRowStyle }, [
          metricCard(translate("adsSpend"), formatCurrency(summary.adsSpend), uiPalette.danger),
          metricCard(translate("revenue"), formatCurrency(summary.revenue), themeTokens.primary),
          metricCard(translate("profit"), formatCurrency(summary.profit), summary.profit >= 0 ? uiPalette.success : uiPalette.danger),
          metricCard(translate("roi"), formatPercent(summary.roi), summary.roi >= 0 ? uiPalette.success : uiPalette.danger),
          metricCard(translate("leadsClosed"), `${formatNumber(summary.totalLeads)} / ${formatNumber(summary.totalClosed)}`, uiPalette.accentE),
          metricCard(translate("conversionRate"), formatPercent(summary.conversionRate), uiPalette.accentB),
          metricCard(translate("websiteTraffic"), formatNumber(summary.totalVisits), uiPalette.accentA),
          metricCard(translate("googlebot"), formatNumber(summary.googlebotVisits), uiPalette.accentE),
          metricCard(translate("indexRemaining"), formatNumber(summary.indexRemaining), uiPalette.accentC),
          metricCard(translate("indexQueue"), formatNumber(summary.queuePending), uiPalette.accentF),
        ]),
      ]) : null,

      activeHubTab === "marketing" ? React.createElement(Card, {
        key: "ad-setup",
        title: translate("adSetupTitle"),
        style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
        styles: { body: { padding: 14 } },
      }, [
        React.createElement("div", {
          key: "ad-grid",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginBottom: 10,
          },
        }, [
          Select
            ? React.createElement(Select, {
              key: "platform",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              value: adForm.platform,
              options: [
                { label: translate("platformAll"), value: "all" },
                { label: translate("platformFacebook"), value: "facebook" },
                { label: translate("platformGoogle"), value: "google" },
              ],
              size: "small",
              onChange: (value) => setAdForm((prev) => ({ ...prev, platform: value })),
            })
            : React.createElement("input", {
              key: "platform_fallback",
              value: adForm.platform,
              onChange: (event) => setAdForm((prev) => ({ ...prev, platform: event.target.value })),
            }),
          React.createElement(Input, {
            key: "campaign",
            placeholder: translate("campaignName"),
            size: "small",
            value: adForm.campaign_name,
            onChange: (event) => setAdForm((prev) => ({ ...prev, campaign_name: event.target.value })),
          }),
          React.createElement(Input, {
            key: "objective",
            placeholder: translate("objectivePlaceholder"),
            size: "small",
            value: adForm.objective,
            onChange: (event) => setAdForm((prev) => ({ ...prev, objective: event.target.value })),
          }),
          React.createElement(Input, {
            key: "budget",
            placeholder: translate("budget"),
            size: "small",
            value: adForm.budget,
            onChange: (event) => setAdForm((prev) => ({ ...prev, budget: event.target.value })),
          }),
          React.createElement(Input, {
            key: "target",
            placeholder: translate("targetUrl"),
            size: "small",
            value: adForm.target_url,
            onChange: (event) => setAdForm((prev) => ({ ...prev, target_url: event.target.value })),
          }),
          React.createElement(Input, {
            key: "headline",
            placeholder: translate("adHeadline"),
            size: "small",
            value: adForm.headline,
            onChange: (event) => setAdForm((prev) => ({ ...prev, headline: event.target.value })),
          }),
          React.createElement(Input, {
            key: "description",
            placeholder: translate("adDescription"),
            size: "small",
            value: adForm.description,
            onChange: (event) => setAdForm((prev) => ({ ...prev, description: event.target.value })),
          }),
        ]),
        React.createElement(Input.TextArea || "textarea", {
          key: "ai-brief",
          placeholder: translate("aiBrief"),
          value: adForm.ai_brief,
          autoSize: { minRows: 2, maxRows: 4 },
          onChange: (event) => setAdForm((prev) => ({ ...prev, ai_brief: event.target.value })),
          style: { marginBottom: 8 },
        }),
        React.createElement(Input.TextArea || "textarea", {
          key: "message",
          placeholder: translate("adMessage"),
          value: adForm.message,
          autoSize: { minRows: 2, maxRows: 5 },
          onChange: (event) => setAdForm((prev) => ({ ...prev, message: event.target.value })),
        }),
        React.createElement("div", {
          key: "ad-credential-grid",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginTop: 8,
          },
        }, [
          React.createElement(Input.Password || Input, {
            key: "fb_user_token",
            placeholder: translate("fbUserToken"),
            size: "small",
            value: adForm.facebook_user_token,
            onChange: (event) => setAdForm((prev) => ({ ...prev, facebook_user_token: event.target.value })),
          }),
          React.createElement(Button, {
            key: "fb_load_pages",
            size: "small",
            loading: loadingFacebookPages,
            onClick: loadFacebookPagesWithToken,
          }, translate("fbLoadPages")),
          React.createElement(Input, {
            key: "fb_page_id",
            placeholder: translate("fbPageIdField"),
            size: "small",
            value: adForm.fb_page_id,
            onChange: (event) => setAdForm((prev) => ({ ...prev, fb_page_id: event.target.value })),
          }),
          React.createElement(Input.Password || Input, {
            key: "fb_token",
            placeholder: translate("fbPageAccessTokenField"),
            size: "small",
            value: adForm.fb_page_access_token,
            onChange: (event) => setAdForm((prev) => ({ ...prev, fb_page_access_token: event.target.value })),
          }),
          React.createElement(Input, {
            key: "gg_customer_id",
            placeholder: translate("ggCustomerIdField"),
            size: "small",
            value: adForm.gg_customer_id,
            onChange: (event) => setAdForm((prev) => ({ ...prev, gg_customer_id: event.target.value })),
          }),
          React.createElement(Input.Password || Input, {
            key: "gg_access_token",
            placeholder: translate("ggAccessTokenField"),
            size: "small",
            value: adForm.gg_access_token,
            onChange: (event) => setAdForm((prev) => ({ ...prev, gg_access_token: event.target.value })),
          }),
          React.createElement(Input.Password || Input, {
            key: "gg_dev_token",
            placeholder: translate("ggDeveloperTokenField"),
            size: "small",
            value: adForm.gg_developer_token,
            onChange: (event) => setAdForm((prev) => ({ ...prev, gg_developer_token: event.target.value })),
          }),
          React.createElement(Input, {
            key: "gg_login_customer_id",
            placeholder: translate("ggLoginCustomerIdField"),
            size: "small",
            value: adForm.gg_login_customer_id,
            onChange: (event) => setAdForm((prev) => ({ ...prev, gg_login_customer_id: event.target.value })),
          }),
        ]),
        facebookPages.length
          ? React.createElement("div", { key: "fb-pages-select", style: { marginTop: 10, border: `1px solid ${themeTokens.border}`, borderRadius: 8, padding: 10, background: themeTokens.cardBgMuted } }, [
            React.createElement("div", { key: "fb-pages-header", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" } }, [
              React.createElement("div", { key: "title", style: { fontSize: 12, fontWeight: 600, color: themeTokens.textSecondary } }, translate("fbSelectPages")),
              React.createElement("div", { key: "actions", style: { display: "flex", gap: 6 } }, [
                React.createElement(Button, {
                  key: "select_all",
                  size: "small",
                  onClick: () => setSelectedFacebookPageIds(normalizeSelectedPageIds(facebookPages.map((item) => item.id))),
                }, translate("fbSelectAllPages")),
                React.createElement(Button, {
                  key: "clear_all",
                  size: "small",
                  onClick: () => setSelectedFacebookPageIds([]),
                }, translate("fbClearPages")),
              ]),
            ]),
            React.createElement("div", { key: "list", style: { display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" } }, facebookPages.map((page) => {
              const pageId = normalizePageId(page.id);
              const checked = normalizeSelectedPageIds(selectedFacebookPageIds).includes(pageId);
              return React.createElement("label", {
                key: `fb_page_${pageId}`,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  color: themeTokens.text,
                  background: checked ? themeTokens.subtleBg : "transparent",
                  borderRadius: 6,
                  padding: "4px 6px",
                },
              }, [
                Checkbox
                  ? React.createElement(Checkbox, {
                    key: `checkbox_${pageId}`,
                    checked,
                    onChange: (event) => {
                      const isChecked = typeof event?.target?.checked === "boolean"
                        ? Boolean(event.target.checked)
                        : !checked;
                      toggleSelectedFacebookPage(pageId, isChecked);
                      if (isChecked) {
                        setAdForm((prev) => ({ ...prev, fb_page_id: pageId, fb_page_access_token: page.access_token || prev.fb_page_access_token }));
                      }
                    },
                  })
                  : React.createElement("input", {
                    key: `checkbox_${pageId}`,
                    type: "checkbox",
                    checked,
                    onChange: (event) => {
                      const isChecked = Boolean(event?.target?.checked);
                      toggleSelectedFacebookPage(pageId, isChecked);
                      if (isChecked) {
                        setAdForm((prev) => ({ ...prev, fb_page_id: pageId, fb_page_access_token: page.access_token || prev.fb_page_access_token }));
                      }
                    },
                  }),
                React.createElement("span", { key: `name_${pageId}`, style: { flex: 1 } }, `${page.name} (${pageId})`),
              ]);
            })),
          ])
          : null,
        React.createElement("div", { key: "ad-checks", style: { marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" } }, [
          Checkbox
            ? React.createElement(Checkbox, {
              key: "auto_activate",
              checked: Boolean(adForm.auto_activate),
              onChange: (event) => setAdForm((prev) => ({ ...prev, auto_activate: Boolean(event?.target?.checked) })),
            }, translate("autoActivate"))
            : null,
          Checkbox
            ? React.createElement(Checkbox, {
              key: "auto_push_fb",
              checked: Boolean(adForm.auto_push_facebook),
              onChange: (event) => setAdForm((prev) => ({ ...prev, auto_push_facebook: Boolean(event?.target?.checked) })),
            }, translate("autoPushFacebook"))
            : null,
        ]),
        React.createElement("div", { key: "ad-actions", style: { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" } }, [
          React.createElement(Button, {
            key: "ai_generate",
            size: "small",
            loading: aiGenerating,
            onClick: generateAdCopyWithAI,
          }, translate("aiGenerate")),
          React.createElement(Button, {
            key: "create_ad",
            type: "primary",
            size: "small",
            loading: submittingAd,
            onClick: handleCreateAd,
          }, translate("adCreate")),
          React.createElement(Button, {
            key: "ai_create_activate",
            type: "default",
            size: "small",
            loading: submittingAd || aiGenerating,
            onClick: () => handleCreateAd({ forceGenerate: true, forceActivate: true }),
          }, translate("aiCreateAndPush")),
          React.createElement(Button, {
            key: "preset",
            size: "small",
            onClick: () => {
              setAdForm((prev) => ({
                ...prev,
                campaign_name: prev.campaign_name || `Remarketing ${new Date().toISOString().slice(0, 10)}`,
                objective: prev.objective || "OUTCOME_TRAFFIC",
              }));
            },
          }, translate("quickFill")),
        ]),
      ]) : null,

      activeHubTab === "marketing" ? React.createElement("div", {
        key: "ops-tables",
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
        },
      }, [
        React.createElement(Card, {
          key: "source-flow",
          title: translate("sourceFlowTitle"),
          style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
          styles: { body: { padding: 12 } },
        }, Table
          ? React.createElement(Table, {
            rowKey: (row) => row.source,
            columns: sourceColumns,
            dataSource: sourceStats,
            size: "small",
            pagination: false,
            scroll: { x: true },
          })
          : React.createElement("pre", null, JSON.stringify(sourceStats, null, 2))),
        React.createElement(Card, {
          key: "ads-list",
          title: translate("adsListTitle"),
          style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
          styles: { body: { padding: 12 } },
        }, Table
          ? React.createElement(Table, {
            rowKey: (row, idx) => String(row.id || row.ad_id || idx),
            columns: adsColumns,
            dataSource: opsData.adsRows,
            size: "small",
            pagination: { pageSize: 5, size: "small" },
            scroll: { x: true },
          })
          : React.createElement("pre", null, JSON.stringify(opsData.adsRows, null, 2))),
      ]) : null,

      activeHubTab === "data" ? React.createElement(Card, {
        key: "crm-crud-manager",
        title: translate("crmCrudTitle"),
        style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
        styles: { body: { padding: 12 } },
      }, [
        React.createElement("div", {
          key: "crud-controls",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginBottom: 10,
          },
        }, [
          Select
            ? React.createElement(Select, {
              key: "crud_entity",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              value: crudEntity,
              size: "small",
              options: [
                { value: "leads", label: translate("entityLeads") },
                { value: "inventory", label: translate("entityInventory") },
                { value: "activities", label: translate("entityActivities") },
                { value: "tasks", label: translate("entityTasks") },
              ],
              onChange: (value) => {
                setCrudEntity(value);
                setCrudMode("create");
                setCrudDraft({});
                setCrudModalOpen(false);
              },
            })
            : React.createElement("input", {
              key: "crud_entity_fallback",
              value: crudEntity,
              onChange: (event) => setCrudEntity(event.target.value),
            }),
          React.createElement(Button, {
            key: "crud_new",
            size: "small",
            onClick: openCreateEntity,
          }, translate("addNew")),
          !Modal && crudModalOpen
            ? React.createElement(Button, {
              key: "crud_save_inline",
              type: "primary",
              size: "small",
              loading: crudSaving,
              onClick: saveCrudDraft,
            }, translate("save"))
            : null,
          !Modal && crudModalOpen
            ? React.createElement(Button, {
              key: "crud_cancel_inline",
              size: "small",
              onClick: () => setCrudModalOpen(false),
            }, translate("cancel"))
            : null,
          React.createElement(Button, {
            key: "crud_sync",
            size: "small",
            onClick: async () => {
              if (typeof reloadDatabase === "function") await reloadDatabase();
              loadOpsData();
            },
          }, translate("reloadCrmNow")),
        ]),
        crudModalOpen ? React.createElement(Modal || "div", {
          key: "crud-editor-modal",
          open: crudModalOpen,
          title: crudMode === "create" ? translate("crudCreateTitle") : translate("crudEditTitle"),
          onCancel: () => setCrudModalOpen(false),
          onOk: saveCrudDraft,
          okText: translate("save"),
          cancelText: translate("cancel"),
          confirmLoading: crudSaving,
          destroyOnClose: true,
          className: "crm-dynamic-theme-modal",
          wrapClassName: "crm-dynamic-theme-modal",
        }, [
        React.createElement("div", {
          key: "crud-editor-grid",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginBottom: 12,
          },
        }, currentEntity.fields.map((field) => {
          const value = crudDraft[field] === undefined || crudDraft[field] === null ? "" : crudDraft[field];
          const isNumeric = ["expected_value", "price", "area_m2", "bedrooms"].includes(field);
          if (field === "project_name" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              allowClear: true,
              showSearch: true,
              placeholder: getFieldLabel(field),
              value: value || undefined,
              options: projectOptions,
              onChange: (nextValue) => setDraftField(field, nextValue || ""),
            });
          }
          if (field === "source" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || "sales_self",
              options: [
                { value: "facebook", label: translate("sourceFacebook") },
                { value: "google", label: translate("sourceGoogle") },
                { value: "website", label: translate("sourceWebsite") },
                { value: "sales_self", label: translate("sourceSalesSelf") },
                { value: "external_floor", label: translate("sourceExternalFloor") },
                { value: "other", label: translate("sourceOther") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || "sales_self"),
            });
          }
          if (field === "status" && Select) {
            let statusOptions;
            if (crudEntity === "leads") {
              statusOptions = [
                { value: "lead", label: translate("pipelineLead") },
                { value: "contacted", label: translate("pipelineContacted") },
                { value: "visit", label: translate("pipelineVisit") },
                { value: "booking", label: translate("pipelineBooking") },
                { value: "contract", label: translate("pipelineContract") },
                { value: "after_sale", label: translate("pipelineAfterSale") },
              ];
            } else if (crudEntity === "inventory") {
              statusOptions = [
                { value: "available", label: translate("inventoryAvailable") },
                { value: "booking", label: translate("inventoryBooking") },
                { value: "sold", label: translate("inventorySold") },
              ];
            } else {
              statusOptions = [
                { value: "todo", label: translate("statusTodo") },
                { value: "in_progress", label: translate("statusInProgress") },
                { value: "done", label: translate("statusDone") },
              ];
            }
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || statusOptions[0].value,
              options: statusOptions,
              onChange: (nextValue) => setDraftField(field, nextValue || statusOptions[0].value),
            });
          }
          if (field === "priority" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || "medium",
              options: [
                { value: "low", label: translate("priorityLow") },
                { value: "medium", label: translate("priorityMedium") },
                { value: "high", label: translate("priorityHigh") },
                { value: "urgent", label: translate("priorityUrgent") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || "medium"),
            });
          }
          if (field === "task_type" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || "follow_up",
              options: [
                { value: "follow_up", label: translate("taskTypeFollowUp") },
                { value: "call", label: translate("taskTypeCall") },
                { value: "meeting", label: translate("taskTypeMeeting") },
                { value: "visit", label: translate("taskTypeVisit") },
                { value: "paperwork", label: translate("taskTypePaperwork") },
                { value: "other", label: translate("taskTypeOther") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || "follow_up"),
            });
          }
          if (field === "activity_type" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || "call",
              options: [
                { value: "call", label: translate("taskTypeCall") },
                { value: "meeting", label: translate("taskTypeMeeting") },
                { value: "visit", label: translate("taskTypeVisit") },
                { value: "email", label: translate("activityTypeEmail") },
                { value: "note", label: translate("activityTypeNote") },
                { value: "other", label: translate("taskTypeOther") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || "call"),
            });
          }
          if (field === "result" && Select && crudEntity === "activities") {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: value || "pending",
              options: [
                { value: "pending", label: translate("activityResultPending") },
                { value: "done", label: translate("statusDone") },
                { value: "canceled", label: translate("activityResultCanceled") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || "pending"),
            });
          }
          if (field === "direction" && Select) {
            return React.createElement(Select, {
              key: `crud_field_${field}`,
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              allowClear: true,
              placeholder: getFieldLabel(field),
              value: value || undefined,
              options: [
                { value: "N", label: translate("directionNorth") },
                { value: "S", label: translate("directionSouth") },
                { value: "E", label: translate("directionEast") },
                { value: "W", label: translate("directionWest") },
                { value: "NE", label: translate("directionNE") },
                { value: "SE", label: translate("directionSE") },
                { value: "NW", label: translate("directionNW") },
                { value: "SW", label: translate("directionSW") },
              ],
              onChange: (nextValue) => setDraftField(field, nextValue || ""),
            });
          }
          return React.createElement(Input, {
            key: `crud_field_${field}`,
            size: "small",
            placeholder: getFieldLabel(field),
            value: String(value),
            onChange: (event) => setDraftField(field, isNumeric ? toNumber(event.target.value, 0) : event.target.value),
          });
        })),
        ]) : null,
        Table
          ? React.createElement(Table, {
            key: "crud-table",
            size: "small",
            rowKey: (row, idx) => String(row[currentEntity.pkField || "id"] || row.id || idx),
            columns: crudColumns,
            dataSource: crudRows,
            pagination: { pageSize: 6, size: "small" },
            scroll: { x: true },
          })
          : React.createElement("pre", { key: "crud-json" }, JSON.stringify(crudRows.slice(0, 20), null, 2)),
      ]) : null,

      activeHubTab === "sales" ? React.createElement(Card, {
        key: "crm-sales-todo",
        title: translate("salesTodoTitle"),
        style: { borderRadius: 16, borderColor: themeTokens.border, background: themeTokens.cardBg },
        styles: { body: { padding: 12 } },
        extra: React.createElement(Button, {
          size: "small",
          loading: loadingSalesUsers,
          onClick: loadSalesUsers,
        }, translate("loadSalesUsers")),
      }, [
        React.createElement("div", { key: "todo-desc", style: { marginBottom: 10, color: themeTokens.textSecondary, fontSize: 12 } }, translate("salesTodoDesc")),
        !salesUsers.length
          ? React.createElement("div", {
            key: "todo-warning",
            style: {
              marginBottom: 10,
              padding: 8,
              borderRadius: 8,
              background: themeTokens.dangerBg,
              border: `1px solid ${themeTokens.dangerBorder}`,
              color: themeTokens.dangerText,
            },
          }, translate("noSalesUsers"))
          : null,
        React.createElement("div", {
          key: "todo-kpi-row",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 8,
            marginBottom: 10,
          },
        }, [
          metricCard(translate("todoOverdue"), formatNumber(todoKpi.overdue), uiPalette.danger),
          metricCard(translate("todoInProgress"), formatNumber(todoKpi.inProgress), uiPalette.info),
          metricCard(translate("todoDueToday"), formatNumber(todoKpi.dueToday), uiPalette.warning),
          metricCard(translate("todoDoneToday"), formatNumber(todoKpi.doneToday), uiPalette.success),
        ]),
        React.createElement("div", {
          key: "todo-filter-grid",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginBottom: 10,
          },
        }, [
          Select
            ? React.createElement(Select, {
              key: "owner_filter",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoOwnerFilter,
              options: [{ value: "all", label: translate("allOwners") }, ...salesUserOptions],
              onChange: (value) => setTodoOwnerFilter(value || "all"),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "status_filter",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoStatusFilter,
              options: [
                { value: "all", label: translate("allStatus") },
                { value: "todo", label: translate("statusTodo") },
                { value: "in_progress", label: translate("statusInProgress") },
                { value: "done", label: translate("statusDone") },
                { value: "overdue", label: translate("overdue") },
              ],
              onChange: (value) => setTodoStatusFilter(value || "all"),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "priority_filter",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoPriorityFilter,
              options: todoPriorityOptions,
              onChange: (value) => setTodoPriorityFilter(value || "all"),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "type_filter",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoTypeFilter,
              options: todoTaskTypeOptions,
              onChange: (value) => setTodoTypeFilter(value || "all"),
            })
            : null,
          React.createElement(Button, {
            key: "todo_new",
            size: "small",
            onClick: openCreateTodo,
          }, translate("addNew")),
          !Modal && todoModalOpen
            ? React.createElement(Button, {
              key: "todo_save_inline",
              type: "primary",
              size: "small",
              loading: todoSaving,
              onClick: saveTodoTask,
            }, translate("save"))
            : null,
          !Modal && todoModalOpen
            ? React.createElement(Button, {
              key: "todo_cancel_inline",
              size: "small",
              onClick: () => setTodoModalOpen(false),
            }, translate("cancel"))
            : null,
        ]),
        todoModalOpen ? React.createElement(Modal || "div", {
          key: "todo-editor-modal",
          open: todoModalOpen,
          title: todoMode === "create" ? translate("todoCreateTitle") : translate("todoEditTitle"),
          onCancel: () => setTodoModalOpen(false),
          onOk: saveTodoTask,
          okText: translate("save"),
          cancelText: translate("cancel"),
          confirmLoading: todoSaving,
          destroyOnClose: true,
          className: "crm-dynamic-theme-modal",
          wrapClassName: "crm-dynamic-theme-modal",
        }, [
        React.createElement("div", {
          key: "todo-editor-grid",
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            marginBottom: 12,
          },
        }, [
          React.createElement(Input, {
            key: "todo_title",
            size: "small",
            placeholder: translate("taskTitleField"),
            value: String(todoDraft.title || ""),
            onChange: (event) => setTodoDraft((prev) => ({ ...prev, title: event.target.value })),
          }),
          Select
            ? React.createElement(Select, {
              key: "todo_lead",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              showSearch: true,
              allowClear: true,
              placeholder: translate("linkedLead"),
              value: todoDraft.lead_id || undefined,
              options: leadOptions,
              onChange: (value) => setTodoDraft((prev) => ({ ...prev, lead_id: value || "" })),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "todo_owner",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              showSearch: true,
              placeholder: translate("assignee"),
              value: todoDraft.owner_id || undefined,
              options: salesUserOptions,
              onChange: (value) => setTodoDraft((prev) => ({ ...prev, owner_id: value || "" })),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "todo_status",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoDraft.status || "todo",
              options: [
                { value: "todo", label: translate("statusTodo") },
                { value: "in_progress", label: translate("statusInProgress") },
                { value: "done", label: translate("statusDone") },
              ],
              onChange: (value) => setTodoDraft((prev) => ({ ...prev, status: value || "todo" })),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "todo_priority",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoDraft.priority || "medium",
              options: todoPriorityOptions.filter((item) => item.value !== "all"),
              placeholder: translate("taskPriority"),
              onChange: (value) => setTodoDraft((prev) => ({ ...prev, priority: value || "medium" })),
            })
            : null,
          Select
            ? React.createElement(Select, {
              key: "todo_type",
              getPopupContainer: resolvePopupContainer,
              popupClassName: "crm-dynamic-popup",
              dropdownClassName: "crm-dynamic-popup",
              size: "small",
              value: todoDraft.task_type || "follow_up",
              options: todoTaskTypeOptions.filter((item) => item.value !== "all"),
              placeholder: translate("taskType"),
              onChange: (value) => setTodoDraft((prev) => ({ ...prev, task_type: value || "follow_up" })),
            })
            : null,
          React.createElement(Input, {
            key: "todo_due",
            size: "small",
            placeholder: translate("dueAtField"),
            value: String(todoDraft.due_at || ""),
            onChange: (event) => setTodoDraft((prev) => ({ ...prev, due_at: toNumber(event.target.value, Date.now()) })),
          }),
          React.createElement(Input, {
            key: "todo_reminder",
            size: "small",
            placeholder: translate("reminderAtField"),
            value: String(todoDraft.reminder_at || ""),
            onChange: (event) => setTodoDraft((prev) => ({ ...prev, reminder_at: toNumber(event.target.value, 0) })),
          }),
        ]),
        ]) : null,
        Table
          ? React.createElement(Table, {
            key: "todo-table",
            size: "small",
            rowKey: (row, idx) => String(row?.id || idx),
            dataSource: filteredTodoRows,
            pagination: { pageSize: 6, size: "small" },
            columns: [
              { title: translate("idLabel"), dataIndex: "id", key: "id", width: 180 },
              { title: translate("taskTitleField"), dataIndex: "title", key: "title", ellipsis: true },
              { title: translate("linkedLead"), dataIndex: "lead_id", key: "lead_id", width: 150 },
              { title: translate("assignee"), dataIndex: "owner_id", key: "owner_id", width: 160 },
              { title: translate("status"), dataIndex: "status", key: "status", width: 120 },
              {
                title: translate("taskPriority"),
                dataIndex: "priority",
                key: "priority",
                width: 120,
                render: (value) => {
                  const key = String(value || "medium");
                  const color = key === "urgent"
                    ? uiPalette.danger
                    : key === "high"
                      ? uiPalette.warning
                      : key === "low"
                        ? uiPalette.success
                        : uiPalette.info;
                  return React.createElement("span", { style: { color, fontWeight: 600 } }, translate(`priority${key.charAt(0).toUpperCase()}${key.slice(1)}`));
                },
              },
              {
                title: translate("taskType"),
                dataIndex: "task_type",
                key: "task_type",
                width: 150,
                render: (value) => {
                  const map = {
                    follow_up: "taskTypeFollowUp",
                    call: "taskTypeCall",
                    meeting: "taskTypeMeeting",
                    visit: "taskTypeVisit",
                    paperwork: "taskTypePaperwork",
                    other: "taskTypeOther",
                  };
                  return translate(map[String(value || "follow_up")] || "taskTypeOther");
                },
              },
              {
                title: translate("dueTime"),
                dataIndex: "due_at",
                key: "due_at",
                width: 170,
                render: (value) => {
                  const ts = toNumber(value, 0);
                  const overdue = ts > 0 && ts < Date.now();
                  return React.createElement("span", { style: { color: overdue ? uiPalette.danger : themeTokens.text, fontWeight: overdue ? 600 : 400 } }, ts > 0 ? new Date(ts).toLocaleString(getLocaleCode(language)) : "");
                },
              },
              {
                title: translate("actions"),
                key: "actions",
                width: 220,
                render: (_, row) => React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, [
                  React.createElement(Button, {
                    key: `todo_edit_${row.id}`,
                    size: "small",
                    disabled: !canManageTask(row),
                    onClick: () => openEditTodo(row),
                  }, translate("edit")),
                  String(row?.status || "") !== "done"
                    ? React.createElement(Button, {
                      key: `todo_done_${row.id}`,
                      size: "small",
                      type: "primary",
                      disabled: !canManageTask(row),
                      onClick: () => completeTodoTask(row),
                    }, translate("markDone"))
                    : null,
                  React.createElement(Button, {
                    key: `todo_del_${row.id}`,
                    size: "small",
                    danger: true,
                    disabled: !canManageTask(row),
                    onClick: () => confirmDeleteTodoTask(row),
                  }, translate("delete")),
                ]),
              },
            ],
            scroll: { x: true },
          })
          : React.createElement("pre", { key: "todo-json" }, JSON.stringify(filteredTodoRows.slice(0, 20), null, 2)),
      ]) : null,

      activeHubTab === "crm" ? React.createElement(CsmCrmWorkspace, {
        key: "crm-workspace",
        appId,
        menuData: {
          id: `crm_dynamic_${appId}`,
          label: localizedCrmConfig.title,
          app_id: appId,
          type_form: 5,
          crm_config: localizedCrmConfig,
        },
        database,
        onDataChange: () => {
          if (notification?.success) {
            notification.success({
              message: translate("crmUpdated"),
              description: translate("crmUpdatedDesc"),
              duration: 1,
            });
          }
          loadOpsData();
          if (typeof reloadDatabase === "function") {
            reloadDatabase();
          }
        },
      }) : null,
    ]);

    if (ConfigProvider) {
      return React.createElement(ConfigProvider, {
        theme: configProviderTheme,
      }, shellNode);
    }

    return shellNode;
  }

  let root = null;
  let refreshTimer = null;
  let refreshCounter = 0;

  function disposeRoot() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (root && typeof root.unmount === "function") {
      root.unmount();
    }
    root = null;
  }

  function mount(database, reloadDatabase) {
    if (!root || root.__containerId !== container.id) {
      root = ReactDOM.createRoot(container);
      root.__containerId = container.id;
      window.__crmDynamicRoot = root;
    }

    root.render(React.createElement(WorkspaceShell, { database, reloadDatabase }));
  }

  async function fetchAllTables() {
    const result = {};
    await Promise.all(
      tableNames.map(async (tableName) => {
        try {
          const res = await getTableData({
            app_id: appId,
            obj_name: tableName,
            where: defaultWhere,
            take: FETCH_TAKE_LIMIT,
          });
          result[tableName] = {
            id: tableName,
            rows: normalizeRows(res),
            fieldsPK: ["id"],
          };
        } catch (error) {
          if (debug) {
            console.warn(`[CRM Dynamic] Failed to load table: ${tableName}`, error);
          }
          result[tableName] = {
            id: tableName,
            rows: [],
            fieldsPK: ["id"],
          };
        }
      })
    );
    return result;
  }

  async function bootstrapAndRender() {
    applyContainerLayout(container, container.id || containerId || "dynamic-code-root");
    await ensureRequiredTables();
    const rawMap = await fetchAllTables();
    const seededMap = await trySeedIfNeeded(rawMap);
    const normalized = buildDatabaseMap(seededMap);
    const reloadDatabase = async () => {
      const latestRawMap = await fetchAllTables();
      const latestNormalized = buildDatabaseMap(latestRawMap);
      mount(latestNormalized, reloadDatabase);
      return latestNormalized;
    };

    mount(normalized, reloadDatabase);

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      refreshCounter += 1;
      await reloadDatabase();
      if (debug && refreshCounter % 2 === 0) {
        console.log("[CRM Dynamic] Auto refresh applied", { refreshCounter, appId });
      }
    }, AUTO_REFRESH_MS);
  }

  function renderError(error) {
    const message = error?.message || String(error);
    const themeTokens = getThemeTokens();
    const fallbackRoot = ReactDOM.createRoot(container);
    fallbackRoot.render(
      React.createElement("div", {
        style: {
          padding: 16,
          color: themeTokens.dangerText,
          background: themeTokens.dangerBg,
          border: `1px solid ${themeTokens.dangerBorder}`,
          borderRadius: 8,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "pre-wrap",
        },
      }, `${translate("dynamicInitError")}\n${message}`)
    );
  }

  window.__crmDynamicDispose = disposeRoot;
  window.addEventListener("beforeunload", disposeRoot, { once: true });

  bootstrapAndRender().catch((error) => {
    console.error("[CRM Dynamic] Bootstrap error", error);
    renderError(error);
  });
})(seft);