(function autoKqxsReactAntdSelfContained() {
  var ReactRef = window.React;
  var ReactDOMRef = window.ReactDOM;
  var antdRef = window.antd || {};

  if (!ReactRef || !ReactDOMRef || typeof ReactDOMRef.createRoot !== "function") {
    throw new Error("React/ReactDOM is unavailable in dynamic runtime");
  }

  var h = ReactRef.createElement;
  var KQXS_VIEW_ONLY = window.csmKqxsViewOnly === true;

  function FallbackCard(props) {
    return h("div", { style: Object.assign({ border: "1px solid var(--kqxs-border, #d9d9d9)", borderRadius: 8, padding: 12, background: "var(--kqxs-card-bg, #fff)", color: "var(--kqxs-text, #1f1f1f)" }, props && props.style ? props.style : {}) }, [
      props && props.title ? h("div", { style: { marginBottom: 8, fontWeight: 600 } }, props.title) : null,
      props ? props.children : null
    ]);
  }

  function FallbackRow(props) {
    return h("div", { style: Object.assign({ display: "flex", flexWrap: "wrap", gap: 12 }, props && props.style ? props.style : {}) }, props ? props.children : null);
  }

  function FallbackCol(props) {
    return h("div", { style: Object.assign({ flex: "1 1 240px", minWidth: 0 }, props && props.style ? props.style : {}) }, props ? props.children : null);
  }

  function FallbackInputNumber(props) {
    return h("input", {
      type: "number",
      value: props && props.value != null ? props.value : "",
      inputMode: "numeric",
      pattern: "[0-9]*",
      style: Object.assign({
        width: "100%",
        minHeight: 32,
        boxSizing: "border-box",
        border: "1px solid var(--kqxs-border, #d9d9d9)",
        background: "var(--kqxs-input-bg, #fff)",
        color: "var(--kqxs-input-text, #1f1f1f)",
        borderRadius: 6,
        padding: "4px 8px"
      }, props && props.style ? props.style : {}),
      onKeyDown: function (e) {
        var key = e && e.key ? e.key : "";
        var allow = /[0-9]|Backspace|Delete|Tab|ArrowLeft|ArrowRight|Home|End|Enter|-/.test(key);
        if (!allow) e.preventDefault();
      },
      onChange: function (e) {
        if (props && typeof props.onChange === "function") {
          var cleaned = String(e && e.target ? e.target.value : "").replace(/[^\d-]/g, "");
          props.onChange(Number(cleaned || 0));
        }
      }
    });
  }

  function FallbackSwitch(props) {
    return h("input", {
      type: "checkbox",
      checked: !!(props && props.checked),
      onChange: function (e) {
        if (props && typeof props.onChange === "function") props.onChange(e.target.checked);
      }
    });
  }

  function FallbackProgress(props) {
    var pct = Number((props && props.percent) || 0);
    return h("progress", { value: pct, max: 100, style: { width: "100%" } }, String(pct));
  }

  function FallbackTag(props) {
    return h("span", { style: Object.assign({ display: "inline-block", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--kqxs-border, #adc6ff)", background: "rgba(22,119,255,0.14)", color: "var(--kqxs-text, #1f1f1f)" }, props && props.style ? props.style : {}) }, props ? props.children : null);
  }

  var Card = antdRef.Card || FallbackCard;
  var Row = antdRef.Row || FallbackRow;
  var Col = antdRef.Col || FallbackCol;
  var Select = antdRef.Select;
  var Input = antdRef.Input;
  var DatePicker = antdRef.DatePicker;
  var InputNumber = antdRef.InputNumber || FallbackInputNumber;
  var Button = antdRef.Button;
  var Space = antdRef.Space;
  var Table = antdRef.Table;
  var Tabs = antdRef.Tabs;
  var Progress = antdRef.Progress || FallbackProgress;
  var Tag = antdRef.Tag || FallbackTag;
  var Switch = antdRef.Switch || FallbackSwitch;

  function FallbackColorPicker(props) {
    return h("input", {
      type: "color",
      value: props && props.value ? props.value : "#f0bb41",
      style: { width: 42, height: 32, padding: 2, cursor: "pointer", borderRadius: 4, border: "1px solid #d9d9d9" },
      onChange: function (e) {
        var hex = e && e.target ? e.target.value : "#f0bb41";
        if (props && typeof props.onChangeComplete === "function")
          props.onChangeComplete({ toHex: function () { return hex.replace("#", ""); } });
      }
    });
  }

  var ColorPicker = antdRef.ColorPicker || FallbackColorPicker;
  var dayjsRef = antdRef.dayjs || window.dayjs;

  function thongbao(msg) {
    if (typeof window.thongbao === "function") return window.thongbao(msg);
    console.log(msg);
  }

  function canhbao(msg) {
    if (typeof window.canhbao === "function") return window.canhbao(msg);
    console.warn(msg);
  }

  function normalizeUILanguage(rawLang) {
    var v = String(rawLang || "").toLowerCase();
    if (v.indexOf("zh") === 0 || v.indexOf("cn") === 0) return "zh";
    if (v.indexOf("en") === 0) return "en";
    return "vi";
  }

  function detectUILanguage() {
    try {
      if (window.i18n && window.i18n.language) return normalizeUILanguage(window.i18n.language);
    } catch (e) {}
    try {
      return normalizeUILanguage(window.localStorage.getItem("i18nextLng") || window.localStorage.getItem("language") || "vi");
    } catch (e2) {
      return "vi";
    }
  }

  function detectSystemDarkMode(runtimeTheme) {
    try {
      var html = document.documentElement;
      var body = document.body;
      var hints = [
        String(runtimeTheme && runtimeTheme.theme || "").toLowerCase(),
        String(runtimeTheme && runtimeTheme.mode || "").toLowerCase(),
        String(runtimeTheme && runtimeTheme.colorMode || "").toLowerCase(),
        String(html && html.getAttribute ? html.getAttribute("data-theme") : "").toLowerCase(),
        String(html && html.getAttribute ? html.getAttribute("theme") : "").toLowerCase(),
        String(body && body.getAttribute ? body.getAttribute("data-theme") : "").toLowerCase(),
        String(window.localStorage.getItem("theme") || "").toLowerCase(),
        String(window.localStorage.getItem("theme_mode") || "").toLowerCase()
      ].filter(Boolean);

      if (runtimeTheme && runtimeTheme.isDark === true) return true;
      if (hints.some(function (item) { return item.indexOf("dark") >= 0; })) return true;
      if (html && html.classList && (html.classList.contains("dark") || html.classList.contains("theme-dark"))) return true;
      if (body && body.classList && (body.classList.contains("dark") || body.classList.contains("theme-dark"))) return true;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
    } catch (e) {}
    return false;
  }

  function readJsonObject(value) {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        var parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  function normalizeThemeOverrides(raw) {
    var source = readJsonObject(raw);
    var keys = ["isDark", "primary", "pageBg", "cardBg", "text", "muted", "border", "inputBg", "inputText"];
    var cleaned = {};
    keys.forEach(function (key) {
      var value = source[key];
      if (key === "isDark") {
        if (typeof value === "boolean") cleaned.isDark = value;
        return;
      }
      if (typeof value === "string" && value.trim()) cleaned[key] = value.trim();
    });
    return cleaned;
  }

  function getThemeOverrides() {
    var storageOverrides = {};
    try {
      storageOverrides = normalizeThemeOverrides(window.localStorage.getItem("kqxs_dynamic_theme_overrides"));
    } catch (e) {
      storageOverrides = {};
    }

    var runtimeOverrides = normalizeThemeOverrides(window.csmKqxsThemeOverrides || window.kqxsThemeOverrides);
    return Object.assign({}, storageOverrides, runtimeOverrides);
  }

  function getKqxsProxyConfig() {
    var defaults = {
      enabled: false,
      server: "",
      username: "",
      password: "",
      useIncognito: false,
      listenToConsole: false,
      onPageLoadedScript: "",
      scriptToExecute: "",
      // TMProxy fields
      tmproxyApiKey: "780007dbe6529835602395b8f16f2b8f",
      tmproxyLocationId: 0
    };

    var storageCfg = {};
    try {
      storageCfg = readJsonObject(window.localStorage.getItem("kqxs_proxy_config"));
    } catch (e) {
      storageCfg = {};
    }

    var runtimeCfg = readJsonObject(window.csmKqxsProxyConfig || window.kqxsProxyConfig);
    var merged = Object.assign({}, defaults, storageCfg, runtimeCfg);

    merged.enabled = !!merged.enabled;
    merged.server = String(merged.server || "").trim();
    merged.username = String(merged.username || "").trim();
    merged.password = String(merged.password || "").trim();
    merged.onPageLoadedScript = String(merged.onPageLoadedScript || "");
    merged.scriptToExecute = String(merged.scriptToExecute || "");
    // Hỗ trợ cả key camelCase và key kiểu PHP: api_key, id_location
    merged.tmproxyApiKey = String(merged.tmproxyApiKey || merged.api_key || "780007dbe6529835602395b8f16f2b8f").trim();
    merged.tmproxyLocationId = Number(merged.tmproxyLocationId || merged.id_location || 0);

    // Có TMProxy key thì luôn bật proxy mode để cap_nhat vào luồng lấy proxy động.
    if (merged.tmproxyApiKey) merged.enabled = true;

    // Nếu có tmproxyApiKey thì ưu tiên dùng TMProxy (server có thể để trống, sẽ lấy động)
    if (!merged.server && !merged.tmproxyApiKey) merged.enabled = false;
    return merged;
  }

  // Gọi TMProxy API (get-current-proxy hoặc get-new-proxy) và trả về {server, username, password}
  // Giống logic PHP trong CURL.php: thử get-current trước, nếu code=27 thì gọi get-new
  async function fetchTmproxyInfo(apiKey, locationId) {
    function parseTmproxyResponse(data) {
      var d = (data && data.data) || {};
      var username = String(d.username || "").trim();
      var password = String(d.password || "").trim();
      var proxyRaw = d.https || d.proxy || (typeof d === "string" ? d : "") || "";
      var host = "";
      var port = "";

      if (proxyRaw) {
        if (proxyRaw.indexOf("@") !== -1) {
          var parts = proxyRaw.split("@");
          var authPart = parts[0];
          var hostPart = parts[1];
          if (authPart.indexOf(":") !== -1) {
            var ap = authPart.split(":");
            username = ap[0];
            password = ap[1];
          }
          if (hostPart && hostPart.indexOf(":") !== -1) {
            var hp = hostPart.split(":");
            host = hp[0];
            port = hp[1];
          }
        } else if (proxyRaw.indexOf(":") !== -1) {
          var hp2 = proxyRaw.split(":");
          host = hp2[0];
          port = hp2[1];
        }
      }

      if (!host || !port) return null;
      return { server: host + ":" + port, username: username, password: password };
    }

    async function callTmproxyApi(endpoint, payload) {
      var resp = await fetch("https://tmproxy.com/api/proxy/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error("TMProxy HTTP " + resp.status);
      return await resp.json();
    }

    // Bước 1: lấy proxy hiện tại
    var data = await callTmproxyApi("get-current-proxy", { api_key: apiKey });
    // code=27: chưa có proxy, cần tạo mới
    if (data && Number(data.code) === 27) {
      data = await callTmproxyApi("get-new-proxy", { api_key: apiKey, id_location: Number(locationId || 0) });
    }
    if (!data || Number(data.code || 0) !== 0) {
      throw new Error("TMProxy error: " + (data && data.message ? data.message : JSON.stringify(data)));
    }
    var info = parseTmproxyResponse(data);
    if (!info) throw new Error("TMProxy: Không parse được proxy từ response");
    return info;
  }

  function getCssVar(varName) {
    try {
      var themeRoot = document.querySelector(".ant-app") || document.querySelector("[class*='ant-app']") || document.body;
      var rootStyles = window.getComputedStyle(document.documentElement);
      var bodyStyles = window.getComputedStyle(document.body);
      var appStyles = window.getComputedStyle(themeRoot);
      return rootStyles.getPropertyValue(varName).trim()
        || bodyStyles.getPropertyValue(varName).trim()
        || appStyles.getPropertyValue(varName).trim();
    } catch (e) {
      return "";
    }
  }

  function detectThemeTokens() {
    var runtimeTheme = window.csmTheme || {};
    var overrides = getThemeOverrides();
    var isDark = detectSystemDarkMode(runtimeTheme);
    var base = {
      isDark: isDark,
      primary: getCssVar("--ant-color-primary") || runtimeTheme.themeColorPrimary || "#1677ff",
      success: getCssVar("--ant-color-success") || "#52c41a",
      warning: getCssVar("--ant-color-warning") || "#faad14",
      error: getCssVar("--ant-color-error") || "#ff4d4f",
      pageBg: getCssVar("--ant-color-bg-layout") || (isDark ? "#0f1115" : "#f5f7fb"),
      cardBg: getCssVar("--ant-color-bg-container") || (runtimeTheme.getCardBackground && runtimeTheme.getCardBackground()) || (isDark ? "#141414" : "#ffffff"),
      text: getCssVar("--ant-color-text") || (runtimeTheme.getTextColor && runtimeTheme.getTextColor()) || (isDark ? "rgba(255,255,255,0.88)" : "#1f1f1f"),
      textInverse: getCssVar("--ant-color-text-light-solid") || "#ffffff",
      muted: getCssVar("--ant-color-text-secondary") || (runtimeTheme.getSecondaryTextColor && runtimeTheme.getSecondaryTextColor()) || (isDark ? "rgba(255,255,255,0.45)" : "#666666"),
      border: getCssVar("--ant-color-border") || (runtimeTheme.getBorderColor && runtimeTheme.getBorderColor()) || (isDark ? "#303030" : "#d9d9d9"),
      inputBg: getCssVar("--ant-color-bg-container") || (isDark ? "#11161f" : "#ffffff"),
      inputText: getCssVar("--ant-color-text") || (isDark ? "rgba(255,255,255,0.88)" : "#1f1f1f")
    };
    return Object.assign({}, base, overrides, {
      isDark: typeof overrides.isDark === "boolean" ? overrides.isDark : base.isDark
    });
  }

  var UI_TEXT = {
    vi: {
      title: "Thống Kê Lô",
      fromDate: "Từ Ngày (dd/mm/yyyy)",
      toDate: "Đến Ngày (dd/mm/yyyy)",
      region: "Miền",
      weekday: "Thứ Tuần",
      color: "Màu Tô",
      sapXep: "Sắp Xếp",
      selectStation: "Chọn Đài",
      selectStationSoChu: "Chọn Đài Số Chủ",
      tkType: "Loại TK",
      searchType: "Loại Tìm",
      soKy: "Số Kỳ",
      laySoKy: "Lấy Số Kỳ",
      demLe: "Đếm <=",
      kxhMin: "KXH >=",
      demKq3Le: "Đếm KQ3 <=",
      lsBatDau: "LS Bắt Đầu",
      demGe: "Đếm >=",
      demToNhoHon: "Đếm to nhỏ <=",
      kxhTu: "KXH Từ",
      kxhDen: "KXH Đến",
      locSau: "Lọc sâu",
      soChu: "Số Chủ",
      btnUpdate: "Cập nhật kết quả",
      btnResult: "Kết Quả",
      btnStat: "Thống Kê",
      btnStatNew: "Thống Kê Mới",
      btnExportExcel: "Chụp tab",
      btnCaptureTab: "Chụp tab",
      btnExportTable: "Xuất bảng",
      btnCaptureTable: "Chụp bảng",
      btnUpdateXskt: "Cập nhật XSKT",
      tabResult: "Kết Quả",
      tabStat: "Thống Kê",
      noResult: "Chưa có dữ liệu kết quả",
      exportNoData: "Không có dữ liệu để xuất",
      exportDone: "Đã xuất dữ liệu thành công",
      captureDone: "Đã lưu ảnh bảng",
      captureNoDom: "Không tìm thấy bảng để chụp",
      captureNoLib: "Không tải được thư viện chụp ảnh",
      exportFallbackCsv: "Không có thư viện XLSX, đã xuất CSV thay thế",
      exportFallbackXls: "Không có thư viện XLSX, đã xuất Excel XML (.xls) thay thế",
      readonlyWarn: "Chế độ chỉ xem: không cho phép cập nhật dữ liệu",
      kqByChuc: "Kết quả theo hàng chục và đơn vị",
      colChuc: "Hàng Chục",
      colSo: "Số",
      colToHop: "Tổ hợp",
      colTong: "Tổng",
      colDem: "Số Lần",
      colKxh: "KXH",
      colMaxKxh: "Lâu Nhất",
      mienNam: "Miền Nam",
      mienTrung: "Miền Trung",
      mienBac: "Miền Bắc",
      tk1: "KQ 1 Đài",
      tk2: "KQ 2 Đài",
      tk3: "KQ 3 Đài",
      theoNgay: "Theo Ngày",
      theoKy: "Theo Kỳ",
      sxMoi: "Ngày mới đứng trước",
      sxCu: "Ngày cũ đứng trước"
    },
    en: {
      title: "Lo Statistics",
      fromDate: "From Date (dd/mm/yyyy)",
      toDate: "To Date (dd/mm/yyyy)",
      region: "Region",
      weekday: "Weekday",
      color: "Highlight Color",
      sapXep: "Sort",
      selectStation: "Select Stations",
      selectStationSoChu: "Select Number-Owner Stations",
      tkType: "Statistic Type",
      searchType: "Search Mode",
      soKy: "Periods",
      laySoKy: "Take Periods",
      demLe: "Count <=",
      kxhMin: "KXH >=",
      demKq3Le: "KQ3 Count <=",
      lsBatDau: "History Start",
      demGe: "Count >=",
      demToNhoHon: "Big/Small Count <=",
      kxhTu: "KXH From",
      kxhDen: "KXH To",
      locSau: "Deep Filter",
      soChu: "Number Owner",
      btnUpdate: "Update Results",
      btnResult: "Results",
      btnStat: "Statistics",
      btnStatNew: "New Statistics",
      btnExportExcel: "Capture tab",
      btnCaptureTab: "Capture tab",
      btnExportTable: "Export table",
      btnCaptureTable: "Capture table",
      btnUpdateXskt: "Update XSKT",
      tabResult: "Results",
      tabStat: "Statistics",
      noResult: "No result data",
      exportNoData: "No data to export",
      exportDone: "Export completed",
      captureDone: "Table image saved",
      captureNoDom: "Table element not found",
      captureNoLib: "Failed to load capture library",
      exportFallbackCsv: "XLSX library not found, exported CSV instead",
      exportFallbackXls: "XLSX library not found, exported Excel XML (.xls) instead",
      readonlyWarn: "View-only mode: data updates are disabled",
      kqByChuc: "Results by tens and units",
      colChuc: "Tens",
      colSo: "Number",
      colToHop: "Combination",
      colTong: "Total",
      colDem: "Count",
      colKxh: "KXH",
      colMaxKxh: "Longest",
      mienNam: "South",
      mienTrung: "Central",
      mienBac: "North",
      tk1: "1-station stats",
      tk2: "2-station stats",
      tk3: "3-station stats",
      theoNgay: "By Date",
      theoKy: "By Period",
      sxMoi: "Newest first",
      sxCu: "Oldest first"
    },
    zh: {
      title: "号码统计",
      fromDate: "开始日期 (dd/mm/yyyy)",
      toDate: "结束日期 (dd/mm/yyyy)",
      region: "地区",
      weekday: "星期",
      color: "高亮颜色",
      sapXep: "排序",
      selectStation: "选择彩台",
      selectStationSoChu: "选择号码来源彩台",
      tkType: "统计类型",
      searchType: "查询模式",
      soKy: "期数",
      laySoKy: "取期数",
      demLe: "计数 <=",
      kxhMin: "KXH >=",
      demKq3Le: "KQ3计数 <=",
      lsBatDau: "历史起点",
      demGe: "计数 >=",
      demToNhoHon: "大小计数 <=",
      kxhTu: "KXH 起",
      kxhDen: "KXH 止",
      locSau: "深度筛选",
      soChu: "号码来源",
      btnUpdate: "更新结果",
      btnResult: "开奖结果",
      btnStat: "统计",
      btnStatNew: "新统计",
      btnExportExcel: "截图当前页签",
      btnCaptureTab: "截图当前页签",
      btnExportTable: "导出表格",
      btnCaptureTable: "截图表格",
      btnUpdateXskt: "更新 XSKT",
      tabResult: "开奖结果",
      tabStat: "统计",
      noResult: "暂无结果数据",
      exportNoData: "没有可导出的数据",
      exportDone: "导出成功",
      captureDone: "表格图片已保存",
      captureNoDom: "未找到可截图的表格",
      captureNoLib: "无法加载截图库",
      exportFallbackCsv: "未找到 XLSX 库，已改为导出 CSV",
      exportFallbackXls: "未找到 XLSX 库，已改为导出 Excel XML（.xls）",
      readonlyWarn: "只读模式：不允许更新数据",
      kqByChuc: "按十位和个位显示结果",
      colChuc: "十位",
      colSo: "号码",
      colToHop: "组合",
      colTong: "总数",
      colDem: "次数",
      colKxh: "KXH",
      colMaxKxh: "最长",
      mienNam: "南部",
      mienTrung: "中部",
      mienBac: "北部",
      tk1: "单台统计",
      tk2: "双台统计",
      tk3: "三台统计",
      theoNgay: "按日期",
      theoKy: "按期",
      sxMoi: "最新在前",
      sxCu: "最旧在前"
    }
  };

  function dateFormat(dateObj, fmt) {
    var d = new Date(dateObj);
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = String(d.getFullYear());
    if (fmt === "dd/mm/yyyy") return dd + "/" + mm + "/" + yyyy;
    if (fmt === "yyyymmdd") return yyyy + mm + dd;
    if (fmt === "dd-mm-yyyy") return dd + "-" + mm + "-" + yyyy;
    if (fmt === "d-m-yyyy") return String(d.getDate()) + "-" + String(d.getMonth() + 1) + "-" + yyyy;
    return d.toISOString();
  }

  function chuyenNgay(value, format) {
    if (value instanceof Date) return value;
    var s = String(value || "").trim();
    if (!s) return new Date();
    if (format === "dd/mm/yyyy") {
      var p = s.split("/");
      return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    }
    if (format === "yyyymmdd") {
      var y = Number(s.slice(0, 4));
      var m = Number(s.slice(4, 6));
      var d = Number(s.slice(6, 8));
      return new Date(y, m - 1, d);
    }
    return new Date(s);
  }

  function CongNgay(ddmmyyyy, offsetDays, format) {
    var d = chuyenNgay(ddmmyyyy, format || "dd/mm/yyyy");
    d.setDate(d.getDate() + Number(offsetDays || 0));
    return dateFormat(d, "dd/mm/yyyy");
  }

  function TruNgayRaSoNgay(denNgay, tuNgay, format) {
    var a = chuyenNgay(denNgay, format || "dd/mm/yyyy").getTime();
    var b = chuyenNgay(tuNgay, format || "dd/mm/yyyy").getTime();
    return Math.floor((a - b) / (24 * 60 * 60 * 1000));
  }

  function ddmmyyyyToIso(value) {
    var s = String(value || "").trim();
    if (!s) return "";
    var p = s.split("/");
    if (p.length !== 3) return "";
    var dd = String(Number(p[0] || 0)).padStart(2, "0");
    var mm = String(Number(p[1] || 0)).padStart(2, "0");
    var yyyy = String(Number(p[2] || 0));
    if (yyyy.length !== 4) return "";
    return yyyy + "-" + mm + "-" + dd;
  }

  function isoToDdmmyyyy(value) {
    var s = String(value || "").trim();
    if (!s) return "";
    var p = s.split("-");
    if (p.length !== 3) return "";
    return String(Number(p[2] || 0)).padStart(2, "0") + "/" + String(Number(p[1] || 0)).padStart(2, "0") + "/" + String(Number(p[0] || 0));
  }

  function toDayjsDate(ddmmyyyy) {
    var iso = ddmmyyyyToIso(ddmmyyyy);
    if (!iso || typeof dayjsRef !== "function") return null;
    var d = dayjsRef(iso, "YYYY-MM-DD");
    if (d && typeof d.isValid === "function" && d.isValid()) return d;
    return null;
  }

  function toNumberSafe(v, defaultValue) {
    var n = Number(v);
    return Number.isFinite(n) ? n : (defaultValue == null ? 0 : defaultValue);
  }

  function setCookie(name, value, days) {
    try {
      var expires = "";
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
      }
      document.cookie = name + "=" + (value || "") + expires + "; path=/";
      return;
    } catch (e) {
      // In scoped dynamic runtime, document.cookie setter can throw Illegal invocation.
    }
    try {
      window.localStorage.setItem("cookie_fallback_" + name, String(value || ""));
    } catch (err) {
      console.warn("setCookie fallback failed", err);
    }
  }

  function getCookie(name) {
    try {
      var nameEQ = name + "=";
      var ca = document.cookie.split(";");
      for (var i = 0; i < ca.length; i += 1) {
        var c = ca[i];
        while (c.charAt(0) === " ") c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
    } catch (e) {
      // Ignore and read fallback store below.
    }
    try {
      var fb = window.localStorage.getItem("cookie_fallback_" + name);
      if (fb != null) return fb;
    } catch (err) {
      console.warn("getCookie fallback failed", err);
    }
    return null;
  }

  function getUniqueCombinations(array, size) {
    var result = [];
    function combine(arr, start, currentCombo) {
      if (currentCombo.length === size) {
        result.push(currentCombo.slice());
        return;
      }
      for (var i = start; i < arr.length; i += 1) {
        currentCombo.push(arr[i]);
        combine(arr, i + 1, currentCombo);
        currentCombo.pop();
      }
    }
    combine(array, 0, []);
    return result;
  }

  function fetchRows(params) {
    return new Promise(function (resolve) {
      try {
        seft.csm_obj_tables(params, function (rs) {
          resolve((rs && rs.rows) || []);
        });
      } catch (e) {
        console.error("fetchRows error", e);
        resolve([]);
      }
    });
  }

  function updateRows(params) {
    return new Promise(function (resolve) {
      try {
        seft.csm_obj_updates(params, function (rs) {
          resolve(rs || {});
        });
      } catch (e) {
        console.error("updateRows error", e);
        resolve({ success: false, error: e && e.message ? e.message : String(e) });
      }
    });
  }

  function parseSoChuMasked(value) {
    var numbers = String(value || "").replace(/\D/g, "").match(/\d{1,2}/g) || [];
    var seen = {};
    var out = [];
    for (var i = 0; i < numbers.length; i += 1) {
      var n = numbers[i].padStart(2, "0");
      if (!seen[n] && Number(n) <= 99) {
        seen[n] = true;
        out.push(n);
      }
    }
    return out;
  }

  function stripVietnamese(input) {
    var s = String(input || "");
    if (!s) return "";
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  }

  function normalizeStationTableName(rawName) {
    var name = String(rawName || "").trim();
    if (!name) return "";
    if (name === "TP. HCM") name = "tphcm";
    if (name === "Thừa T. Huế" || name === "Huế" || name === "Thừa Thiên Huế") name = "thuathienhue";
    if (name === "Đắc Lắc") name = "daklak";
    if (name === "Đắc Nông") name = "daknong";
    name = stripVietnamese(name).toLowerCase().replace(/\s+/g, "");
    return "kqxs_" + name;
  }

  function randomId(prefix) {
    return String(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function formatSoChuInput(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 18);
    var pairs = digits.match(/\d{1,2}/g) || [];
    return pairs.join("-");
  }

  function sanitizeSheetName(name) {
    var out = String(name || "Sheet").replace(/[\\\/?*\[\]:]/g, " ").trim();
    if (!out) out = "Sheet";
    if (out.length > 31) out = out.slice(0, 31);
    return out;
  }

  function toExcelCellValue(value) {
    if (value == null) return "";
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return String(value);
  }

  function cellDisplayLength(value) {
    var txt = String(value == null ? "" : value);
    var max = 0;
    for (var i = 0; i < txt.length; i += 1) {
      var code = txt.charCodeAt(i);
      max += code > 255 ? 2 : 1;
    }
    return max;
  }

  function buildAutoColsFromAoa(aoa) {
    var maxCols = 0;
    for (var r = 0; r < (aoa || []).length; r += 1) {
      var row = Array.isArray(aoa[r]) ? aoa[r] : [];
      if (row.length > maxCols) maxCols = row.length;
    }
    var out = [];
    for (var c = 0; c < maxCols; c += 1) {
      var maxLen = 6;
      for (var rr = 0; rr < (aoa || []).length; rr += 1) {
        var row2 = Array.isArray(aoa[rr]) ? aoa[rr] : [];
        var l = cellDisplayLength(row2[c]);
        if (l > maxLen) maxLen = l;
      }
      out.push({ wch: Math.min(48, Math.max(8, maxLen + 2)) });
    }
    return out;
  }

  function tryApplyWorksheetVisuals(ws, aoa, XLSX) {
    var cols = buildAutoColsFromAoa(aoa);
    if (cols.length) ws["!cols"] = cols;

    if ((aoa || []).length > 1 && cols.length > 0) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } })
      };
      ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    }

    // Some SheetJS builds ignore styles. We still assign them for builds that support style writing.
    var headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "D9D9D9" } },
        bottom: { style: "thin", color: { rgb: "D9D9D9" } },
        left: { style: "thin", color: { rgb: "D9D9D9" } },
        right: { style: "thin", color: { rgb: "D9D9D9" } }
      }
    };

    for (var r = 0; r < (aoa || []).length; r += 1) {
      var row = Array.isArray(aoa[r]) ? aoa[r] : [];
      for (var c = 0; c < row.length; c += 1) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr];
        if (!cell) continue;
        if (r === 0) cell.s = headerStyle;
        if (cell.t === "n") cell.z = Number.isInteger(cell.v) ? "0" : "0.00";
      }
    }
  }

  function makeWorksheetFromAoa(aoa, XLSX) {
    var ws = {};
    var maxCols = 0;
    for (var r = 0; r < aoa.length; r += 1) {
      var row = Array.isArray(aoa[r]) ? aoa[r] : [];
      if (row.length > maxCols) maxCols = row.length;
      for (var c = 0; c < row.length; c += 1) {
        var raw = toExcelCellValue(row[c]);
        var cell = { v: raw, t: typeof raw === "number" ? "n" : "s" };
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = cell;
      }
    }
    if (aoa.length === 0) {
      ws.A1 = { v: "", t: "s" };
      ws["!ref"] = "A1";
      tryApplyWorksheetVisuals(ws, aoa, XLSX);
      return ws;
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: Math.max(maxCols - 1, 0) } });
    tryApplyWorksheetVisuals(ws, aoa, XLSX);
    return ws;
  }

  function isUsableXlsx(XLSX) {
    return !!(XLSX
      && XLSX.utils
      && typeof XLSX.writeFile === "function"
      && typeof XLSX.utils.encode_cell === "function"
      && typeof XLSX.utils.encode_range === "function");
  }

  function canWriteXlsx(XLSX) {
    if (!isUsableXlsx(XLSX)) return false;
    try {
      var wb = { SheetNames: ["Sheet1"], Sheets: {} };
      wb.Sheets.Sheet1 = makeWorksheetFromAoa([["ok"]], XLSX);
      XLSX.write(wb, { bookType: "xlsx", type: "binary" });
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalizeJsZipGlobal() {
    var z = window.JSZip || window.jszip;
    if (z && typeof z !== "function") {
      if (typeof z.default === "function") z = z.default;
      else if (typeof z.JSZip === "function") z = z.JSZip;
    }
    if (typeof z === "function") {
      window.JSZip = z;
      window.jszip = z;
      return z;
    }
    return null;
  }

  function findScriptBySrc(src) {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i += 1) {
      var s = scripts[i];
      if (!s) continue;
      if (s.dataset && s.dataset.kqxsSrc === src) return s;
      var raw = s.getAttribute("src") || "";
      if (raw === src || raw.indexOf(src + "?") === 0) return s;
    }
    return null;
  }

  function loadScriptFile(src, options) {
    return new Promise(function (resolve, reject) {
      if (!src) return reject(new Error("Empty script src"));

      var opts = options || {};
      var forceReload = !!opts.forceReload;
      var checkReady = typeof opts.checkReady === "function" ? opts.checkReady : null;

      var existed = findScriptBySrc(src);
      if (existed) {
        if (!forceReload && (!checkReady || checkReady())) return resolve(true);
        if (forceReload && existed.parentNode) existed.parentNode.removeChild(existed);
      }

      if (existed && !forceReload) {
        existed.addEventListener("load", function () { resolve(window.XLSX); }, { once: true });
        existed.addEventListener("error", function () { reject(new Error("Failed to load script: " + src)); }, { once: true });
        return;
      }

      var script = document.createElement("script");
      script.src = forceReload
        ? src + (src.indexOf("?") >= 0 ? "&" : "?") + "_kqxs_reload=" + Date.now()
        : src;
      script.async = true;
      script.dataset.kqxsSrc = src;
      script.onload = function () {
        resolve(true);
      };
      script.onerror = function () {
        reject(new Error("Failed to load script: " + src));
      };
      document.head.appendChild(script);
    });
  }

  var __kqxsXlsxLoaderPromise = null;
  var __kqxsCaptureLoaderPromise = null;
  var __kqxsDomToImageLoaderPromise = null;
  var __kqxsHtmlToImageLoaderPromise = null;

  function buildAssetScriptCandidates(relPath, extraCandidates) {
    var out = [];
    var seen = {};

    function add(src) {
      var s = String(src || "").trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    }

    add("/assets/" + relPath);
    add("./assets/" + relPath);
    add("assets/" + relPath);
    add("/backend/csm_datas/public/assets/" + relPath);
    add("/csm_datas/public/assets/" + relPath);

    try {
      var pathname = String((window.location && window.location.pathname) || "/");
      var parts = pathname.split("/").filter(Boolean);
      for (var i = parts.length; i >= 0; i -= 1) {
        var base = "/" + parts.slice(0, i).join("/");
        if (base === "/") base = "";
        add(base + "/assets/" + relPath);
      }
    } catch (e) {
      // Ignore location parsing issues
    }

    (extraCandidates || []).forEach(add);
    return out;
  }

  async function ensureXlsxLibrary() {
    if (canWriteXlsx(window.XLSX)) return window.XLSX;
    if (__kqxsXlsxLoaderPromise) return __kqxsXlsxLoaderPromise;

    var jszipCandidates = buildAssetScriptCandidates("jszip/jszip.js", [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    ]);

    var candidates = buildAssetScriptCandidates("xlsx.js", [
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    ]);

    __kqxsXlsxLoaderPromise = (async function () {
      if (!normalizeJsZipGlobal()) {
        var seenJsZip = {};
        for (var j = 0; j < jszipCandidates.length; j += 1) {
          var jsSrc = String(jszipCandidates[j] || "").trim();
          if (!jsSrc || seenJsZip[jsSrc]) continue;
          seenJsZip[jsSrc] = true;
          try {
            await loadScriptFile(jsSrc, { checkReady: normalizeJsZipGlobal });
            if (normalizeJsZipGlobal()) break;
          } catch (e) {
            // Try next JSZip candidate
          }
        }
      }

      var seen = {};
      for (var i = 0; i < candidates.length; i += 1) {
        var src = String(candidates[i] || "").trim();
        if (!src || seen[src]) continue;
        seen[src] = true;
        try {
          await loadScriptFile(src, { checkReady: function () { return isUsableXlsx(window.XLSX); } });
          if (canWriteXlsx(window.XLSX)) return window.XLSX;

          // XLSX may have been loaded before JSZip was ready; force a clean reload.
          window.XLSX = undefined;
          await loadScriptFile(src, {
            forceReload: true,
            checkReady: function () { return isUsableXlsx(window.XLSX); }
          });
          if (canWriteXlsx(window.XLSX)) return window.XLSX;
        } catch (e) {
          // Try next candidate
        }
      }
      throw new Error("XLSX script unavailable");
    })();

    try {
      return await __kqxsXlsxLoaderPromise;
    } finally {
      __kqxsXlsxLoaderPromise = null;
    }
  }

  async function ensureCaptureLibrary() {
    if (typeof window.html2canvas === "function") return window.html2canvas;
    if (__kqxsCaptureLoaderPromise) return __kqxsCaptureLoaderPromise;

    var candidates = buildAssetScriptCandidates("html2canvas.min.js", [
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
    ]);

    __kqxsCaptureLoaderPromise = (async function () {
      var seen = {};
      for (var i = 0; i < candidates.length; i += 1) {
        var src = String(candidates[i] || "").trim();
        if (!src || seen[src]) continue;
        seen[src] = true;
        try {
          await loadScriptFile(src, { checkReady: function () { return typeof window.html2canvas === "function"; } });
          if (typeof window.html2canvas === "function") return window.html2canvas;
        } catch (e) {
          // try next
        }
      }
      throw new Error("html2canvas script unavailable");
    })();

    try {
      return await __kqxsCaptureLoaderPromise;
    } finally {
      __kqxsCaptureLoaderPromise = null;
    }
  }

  async function ensureDomToImageLibrary() {
    if (window.domtoimage && typeof window.domtoimage.toPng === "function") return window.domtoimage;
    if (__kqxsDomToImageLoaderPromise) return __kqxsDomToImageLoaderPromise;

    var candidates = buildAssetScriptCandidates("dom-to-image-more.min.js", [
      "https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js",
      "https://unpkg.com/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js"
    ]);

    __kqxsDomToImageLoaderPromise = (async function () {
      var seen = {};
      for (var i = 0; i < candidates.length; i += 1) {
        var src = String(candidates[i] || "").trim();
        if (!src || seen[src]) continue;
        seen[src] = true;
        try {
          await loadScriptFile(src, { checkReady: function () { return !!(window.domtoimage && typeof window.domtoimage.toPng === "function"); } });
          if (window.domtoimage && typeof window.domtoimage.toPng === "function") return window.domtoimage;
        } catch (e) {
          // try next candidate
        }
      }
      throw new Error("dom-to-image script unavailable");
    })();

    try {
      return await __kqxsDomToImageLoaderPromise;
    } finally {
      __kqxsDomToImageLoaderPromise = null;
    }
  }

  async function ensureHtmlToImageLibrary() {
    if (window.htmlToImage && typeof window.htmlToImage.toPng === "function") return window.htmlToImage;
    if (__kqxsHtmlToImageLoaderPromise) return __kqxsHtmlToImageLoaderPromise;

    var candidates = buildAssetScriptCandidates("html-to-image.min.js", [
      "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js",
      "https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.min.js"
    ]);

    __kqxsHtmlToImageLoaderPromise = (async function () {
      var seen = {};
      for (var i = 0; i < candidates.length; i += 1) {
        var src = String(candidates[i] || "").trim();
        if (!src || seen[src]) continue;
        seen[src] = true;
        try {
          await loadScriptFile(src, { checkReady: function () { return !!(window.htmlToImage && typeof window.htmlToImage.toPng === "function"); } });
          if (window.htmlToImage && typeof window.htmlToImage.toPng === "function") return window.htmlToImage;
        } catch (e) {
          // try next candidate
        }
      }
      throw new Error("html-to-image script unavailable");
    })();

    try {
      return await __kqxsHtmlToImageLoaderPromise;
    } finally {
      __kqxsHtmlToImageLoaderPromise = null;
    }
  }

  function downloadDataUrl(fileName, dataUrl) {
    var a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function getCaptureMetrics(node, fullContent) {
    if (!node) return { width: 0, height: 0 };
    var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0 };
    var width = fullContent
      ? Math.max(1, Math.ceil(Math.max(rect.width || 0, node.scrollWidth || 0, node.clientWidth || 0)))
      : Math.max(1, Math.ceil(rect.width || node.clientWidth || 0));
    var height = fullContent
      ? Math.max(1, Math.ceil(Math.max(rect.height || 0, node.scrollHeight || 0, node.clientHeight || 0)))
      : Math.max(1, Math.ceil(rect.height || node.clientHeight || 0));
    return { width: width, height: height };
  }

  function shouldIgnoreCaptureNode(node) {
    if (!node || node.nodeType !== 1) return false;
    var el = node;
    if (el.getAttribute && String(el.getAttribute("data-capture-ignore") || "").toLowerCase() === "true") return true;
    if (!el.classList) return false;
    return el.classList.contains("kqxs-capture-ignore")
      || el.classList.contains("kqxs-table-actions")
      || el.classList.contains("kqxs-top-actions");
  }

  async function waitForCaptureFonts(timeoutMs) {
    try {
      if (!document.fonts || typeof document.fonts.ready === "undefined") return;
      var timeout = Math.max(300, Number(timeoutMs || 1500));
      await Promise.race([
        document.fonts.ready,
        new Promise(function (resolve) { setTimeout(resolve, timeout); })
      ]);
    } catch (e) {
      // ignore
    }
  }

  function snapshotComputedStyles(root) {
    if (!root || !root.querySelectorAll) return function () {};
    var props = [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "box-shadow",
      "text-shadow",
      "fill",
      "stroke"
    ];

    var nodes = [root];
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i += 1) nodes.push(all[i]);

    var saved = [];
    nodes.forEach(function (el) {
      try {
        var cs = window.getComputedStyle(el);
        if (!cs) return;
        var prev = el.getAttribute("style");
        var append = "";
        props.forEach(function (p) {
          var v = String(cs.getPropertyValue(p) || "").trim();
          if (!v) return;
          append += p + ":" + v + " !important;";
        });
        if (!append) return;
        el.setAttribute("style", (prev ? prev + ";" : "") + append);
        saved.push({ el: el, prev: prev });
      } catch (e) {
        // ignore node
      }
    });

    return function restore() {
      for (var j = 0; j < saved.length; j += 1) {
        var item = saved[j];
        if (item.prev == null) item.el.removeAttribute("style");
        else item.el.setAttribute("style", item.prev);
      }
    };
  }

  function getCaptureBackground(node) {
    try {
      var cs = window.getComputedStyle(node);
      var bg = String(cs && cs.backgroundColor ? cs.backgroundColor : "").trim();
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      var root = document.querySelector(".kqxs-react-auto") || document.body;
      var rootBg = String(window.getComputedStyle(root).backgroundColor || "").trim();
      if (rootBg && rootBg !== "rgba(0, 0, 0, 0)" && rootBg !== "transparent") return rootBg;
    } catch (e) {
      // ignore
    }
    return "#ffffff";
  }

  function downloadCsvFromAoa(fileName, aoa) {
    var lines = (aoa || []).map(function (row) {
      return (row || []).map(function (cell) {
        var txt = String(cell == null ? "" : cell);
        if (/[",\n]/.test(txt)) txt = '"' + txt.replace(/"/g, '""') + '"';
        return txt;
      }).join(",");
    });
    var csv = "\uFEFF" + lines.join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeXmlText(input) {
    return String(input == null ? "" : input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function detectExcelXmlCellType(value) {
    if (typeof value === "number" && isFinite(value)) {
      return { type: "Number", value: String(value), styleId: Number.isInteger(value) ? "sNumberInt" : "sNumberDec" };
    }
    if (typeof value === "boolean") return { type: "Number", value: value ? "1" : "0", styleId: "sNumberInt" };
    var txt = String(value == null ? "" : value).trim();
    if (/^-?\d+(\.\d+)?$/.test(txt)) {
      return { type: "Number", value: txt, styleId: txt.indexOf(".") >= 0 ? "sNumberDec" : "sNumberInt" };
    }
    return { type: "String", value: escapeXmlText(value == null ? "" : value), styleId: "sBody" };
  }

  function buildExcelXmlWorkbook(sheets) {
    var header = '<?xml version="1.0" encoding="UTF-8"?>';
    var open = '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
      + ' xmlns:o="urn:schemas-microsoft-com:office:office"'
      + ' xmlns:x="urn:schemas-microsoft-com:office:excel"'
      + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"'
      + ' xmlns:html="http://www.w3.org/TR/REC-html40">';
    var styles = '<Styles>'
      + '<Style ss:ID="Default" ss:Name="Normal">'
      + '<Alignment ss:Vertical="Bottom"/>'
      + '<Borders/>'
      + '<Font ss:FontName="Calibri" ss:Size="11"/>'
      + '<Interior/>'
      + '<NumberFormat/>'
      + '<Protection/>'
      + '</Style>'
      + '<Style ss:ID="sHeader">'
      + '<Font ss:Bold="1" ss:Color="#FFFFFF"/>'
      + '<Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>'
      + '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>'
      + '<Borders>'
      + '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>'
      + '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>'
      + '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>'
      + '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>'
      + '</Borders>'
      + '</Style>'
      + '<Style ss:ID="sBody">'
      + '<Borders>'
      + '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EFEFEF"/>'
      + '</Borders>'
      + '</Style>'
      + '<Style ss:ID="sNumberInt"><NumberFormat ss:Format="0"/></Style>'
      + '<Style ss:ID="sNumberDec"><NumberFormat ss:Format="0.00"/></Style>'
      + '</Styles>';
    var body = [];

    function worksheetOptionsXml() {
      return '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">'
        + '<FreezePanes/>'
        + '<FrozenNoSplit/>'
        + '<SplitHorizontal>1</SplitHorizontal>'
        + '<TopRowBottomPane>1</TopRowBottomPane>'
        + '<ActivePane>2</ActivePane>'
        + '</WorksheetOptions>';
    }

    (sheets || []).forEach(function (sheet, idx) {
      var name = sanitizeSheetName((sheet && sheet.name) || ("Sheet" + (idx + 1)));
      var aoa = (sheet && sheet.aoa) || [[""]];
      var rows = [];
      var cols = buildAutoColsFromAoa(aoa).map(function (col) {
        var width = Math.max(40, (Number(col.wch || 8) * 6.8));
        return '<Column ss:AutoFitWidth="0" ss:Width="' + width.toFixed(2) + '"/>';
      });

      aoa.forEach(function (row, rowIdx) {
        var cells = [];
        (row || []).forEach(function (cell) {
          var cellInfo = detectExcelXmlCellType(cell);
          var sid = rowIdx === 0 ? 'sHeader' : (cellInfo.styleId || 'sBody');
          cells.push('<Cell ss:StyleID="' + sid + '"><Data ss:Type="' + cellInfo.type + '">' + cellInfo.value + '</Data></Cell>');
        });
        rows.push('<Row>' + cells.join("") + '</Row>');
      });

      body.push('<Worksheet ss:Name="' + escapeXmlText(name) + '"><Table>' + cols.join("") + rows.join("") + '</Table>' + worksheetOptionsXml() + '</Worksheet>');
    });

    return header + open + styles + body.join("") + '</Workbook>';
  }

  function downloadExcelXmlFromSheets(fileName, sheets) {
    var xml = buildExcelXmlWorkbook(sheets);
    var blob = new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function KQXSApp() {
    var useState = ReactRef.useState;
    var useEffect = ReactRef.useEffect;
    var useMemo = ReactRef.useMemo;
    var useRef = ReactRef.useRef;

    var _a = useState(false), allowUpdateActions = _a[0], setAllowUpdateActions = _a[1];
    var _b = useState("MN"), mien = _b[0], setMien = _b[1];
    var _c = useState(dateFormat(new Date(), "dd/mm/yyyy")), den_ngay = _c[0], setDenNgay = _c[1];
    var _d = useState(CongNgay(dateFormat(new Date(), "dd/mm/yyyy"), -4 * 365, "dd/mm/yyyy")), tu_ngay = _d[0], setTuNgay = _d[1];
    var _e = useState(""), thu_tuan = _e[0], setThuTuan = _e[1];

    var _f = useState([]), danh_sach_dai = _f[0], setDanhSachDai = _f[1];
    var _g = useState([]), ds_dai_chon = _g[0], setDsDaiChon = _g[1];
    var _h = useState([]), ds_dai_chon_so_chu = _h[0], setDsDaiChonSoChu = _h[1];
    var _i = useState([]), ds_dai_chon_xem_ket_qua = _i[0], setDsDaiChonXemKetQua = _i[1];

    var _j = useState(1), loai_tim = _j[0], setLoaiTim = _j[1];
    var _k = useState(2), loai_tk = _k[0], setLoaiTk = _k[1];
    var _l = useState(28), so_ky = _l[0], setSoKy = _l[1];
    var _m = useState(5), lay_so_ky = _m[0], setLaySoKy = _m[1];
    var _n = useState(5), dem_be_hon = _n[0], setDemBeHon = _n[1];
    var _o = useState(7), kxh_phai_lonhon = _o[0], setKxhPhaiLonhon = _o[1];
    var _p = useState(5), dem_nho_hon = _p[0], setDemNhoHon = _p[1];
    var _q = useState(5), dem_lon_hon = _q[0], setDemLonHon = _q[1];
    var _r = useState(0), dem_to_nho_hon = _r[0], setDemToNhoHon = _r[1];
    var _s = useState(5), ls_bat_dau = _s[0], setLsBatDau = _s[1];
    var _t = useState(2), kxh_tu = _t[0], setKxhTu = _t[1];
    var _u = useState(4), kxh_den = _u[0], setKxhDen = _u[1];
    var _v = useState(true), kxh_locsau = _v[0], setKxhLocSau = _v[1];
    var _w = useState(1), sap_xep = _w[0], setSapXep = _w[1];

    var _x = useState(getCookie("chon_mau") || "#f0bb41"), chon_mau = _x[0], setChonMau = _x[1];
    var _y = useState(""), so_chu_input = _y[0], setSoChuInput = _y[1];
    var _z = useState([]), so_chu = _z[0], setSoChu = _z[1];

    var _aa = useState(0), progress = _aa[0], setProgress = _aa[1];
    var _ab = useState(false), loading = _ab[0], setLoading = _ab[1];
    var _ac = useState(true), isXemthuong = _ac[0], setIsXemthuong = _ac[1];
    var _ad = useState([]), thongkeRows = _ad[0], setThongkeRows = _ad[1];
    var _ae = useState([]), xu_ly_ket_qua = _ae[0], setXuLyKetQua = _ae[1];
    var _af = useState({}), du_lieu_dai_mien = _af[0], setDuLieuDaiMien = _af[1];
    var _ag = useState(detectUILanguage()), uiLang = _ag[0], setUiLang = _ag[1];
    var _ah = useState(detectThemeTokens()), theme = _ah[0], setTheme = _ah[1];
    var _ai = useState([]), lichSuSoChuRows = _ai[0], setLichSuSoChuRows = _ai[1];
    var _aj = useState("ketqua"), subTab = _aj[0], setSubTab = _aj[1];
    var _ak = useState("kq"), activeAction = _ak[0], setActiveAction = _ak[1];
    var _al = useState([]), thongkeTabItems = _al[0], setThongkeTabItems = _al[1];
    var _am = useState({
      so_ky: so_ky,
      lay_so_ky: lay_so_ky,
      dem_be_hon: dem_be_hon,
      kxh_phai_lonhon: kxh_phai_lonhon,
      dem_nho_hon: dem_nho_hon,
      dem_lon_hon: dem_lon_hon,
      dem_to_nho_hon: dem_to_nho_hon,
      sap_xep: sap_xep,
      thu_tuan: thu_tuan,
      den_ngay: den_ngay,
      so_chu: so_chu.slice(),
      hasSoChuSource: ds_dai_chon_so_chu.length > 0
    }), appliedThongKe = _am[0], setAppliedThongKe = _am[1];
    var taiDuLieuReqRef = useRef(0);
    var filterResetReadyRef = useRef(false);
    var autoDailyUpdatingRef = useRef(false);

    function snapshotThongKeInputs() {
      return {
        so_ky: Number(so_ky || 0),
        lay_so_ky: Number(lay_so_ky || 0),
        dem_be_hon: Number(dem_be_hon || 0),
        kxh_phai_lonhon: Number(kxh_phai_lonhon || 0),
        dem_nho_hon: Number(dem_nho_hon || 0),
        dem_lon_hon: Number(dem_lon_hon || 0),
        dem_to_nho_hon: Number(dem_to_nho_hon || 0),
        sap_xep: Number(sap_xep || 0),
        thu_tuan: String(thu_tuan || ""),
        den_ngay: String(den_ngay || ""),
        so_chu: (so_chu || []).slice(),
        hasSoChuSource: (ds_dai_chon_so_chu || []).length > 0
      };
    }

    var tt = useMemo(function () {
      return UI_TEXT[uiLang] || UI_TEXT.vi;
    }, [uiLang]);

    var ds_thu = useMemo(function () {
      var labels = {
        vi: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"],
        en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      };
      var langLbl = labels[uiLang] || labels.vi;
      return [
        { ma: "T2", ten: langLbl[0] },
        { ma: "T3", ten: langLbl[1] },
        { ma: "T4", ten: langLbl[2] },
        { ma: "T5", ten: langLbl[3] },
        { ma: "T6", ten: langLbl[4] },
        { ma: "T7", ten: langLbl[5] },
        { ma: "CN", ten: langLbl[6] }
      ];
    }, [uiLang]);

    var days = useMemo(function () {
      return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    }, []);

    var dsDaiMienThu = useMemo(function () {
      return danh_sach_dai.filter(function (d) {
        return d.mien === mien && d.thu === thu_tuan;
      }).sort(function (a, b) { return Number(a.stt || 0) - Number(b.stt || 0); });
    }, [danh_sach_dai, mien, thu_tuan]);

    var dsDaiCanTai = useMemo(function () {
      var dsMien = danh_sach_dai.filter(function (d) { return d.mien === mien; })
        .sort(function (a, b) {
          var ka = String(a.thu || "") + "_" + String(a.stt || "");
          var kb = String(b.thu || "") + "_" + String(b.stt || "");
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
      if (loai_tim === 1) {
        return dsMien.filter(function (d) { return d.thu === thu_tuan; });
      }
      return dsMien;
    }, [danh_sach_dai, mien, thu_tuan, loai_tim]);

    var dsDaiThu = useMemo(function () {
      return dsDaiMienThu.map(function (d) {
        var n = Object.assign({}, d);
        n.label = loai_tim === 0 ? (mien + n.stt + " - " + n.ten_dai) : n.ten_dai;
        return n;
      });
    }, [dsDaiMienThu, mien, loai_tim]);

    useEffect(function () {
      setAllowUpdateActions(!KQXS_VIEW_ONLY);
      setThuTuan(days[chuyenNgay(den_ngay, "dd/mm/yyyy").getDay()]);

      fetchRows({
        app_id: "kqxs",
        obj_name: "kqxs_lichxoso",
        e_where: { field: "id", type: "like", value: "" }
      }).then(function (rows) {
        rows.sort(function (a, b) {
          var ka = String(a.mien || "") + "_" + String(a.thu || "") + "_" + String(a.stt || "");
          var kb = String(b.mien || "") + "_" + String(b.thu || "") + "_" + String(b.stt || "");
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
        setDanhSachDai(rows);
      });
    }, []);

    useEffect(function () {
      setThuTuan(days[chuyenNgay(den_ngay, "dd/mm/yyyy").getDay()]);
    }, [den_ngay]);

    useEffect(function () {
      if (!filterResetReadyRef.current) {
        filterResetReadyRef.current = true;
        return;
      }

      // Mirror Vue lay_ds_dai(): đổi miền/loại tìm/đến ngày thì phải chọn lại đài.
      setDuLieuDaiMien({});
      setDsDaiChon([]);
      setDsDaiChonSoChu([]);
      setDsDaiChonXemKetQua([]);
      setXuLyKetQua([]);
    }, [mien, loai_tim, den_ngay]);

    useEffect(function () {
      setCookie("chon_mau", chon_mau, 365);
    }, [chon_mau]);

    useEffect(function () {
      var parsed = parseSoChuMasked(so_chu_input);
      setSoChu(parsed);
    }, [so_chu_input]);

    useEffect(function () {
      function onLocaleChanged(e) {
        var nextLang = normalizeUILanguage(e && e.detail && e.detail.language ? e.detail.language : detectUILanguage());
        setUiLang(nextLang);
      }
      function onThemeChanged() {
        setTheme(detectThemeTokens());
      }
      window.addEventListener("csm:locale-change", onLocaleChanged);
      window.addEventListener("csm:theme-change", onThemeChanged);
      return function () {
        window.removeEventListener("csm:locale-change", onLocaleChanged);
        window.removeEventListener("csm:theme-change", onThemeChanged);
      };
    }, []);

    useEffect(function () {
      if (!allowUpdateActions) return;

      var autoCfg = readJsonObject(window.csmKqxsAutoDailyUpdate || window.kqxsAutoDailyUpdate);
      var autoEnabled = (typeof autoCfg.enabled === "boolean") ? autoCfg.enabled : true;
      if (!autoEnabled) return;

      function parseHmToMinutes(hmText, fallbackMinutes) {
        var s = String(hmText || "").trim();
        var m = s.match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return fallbackMinutes;
        var hh = Number(m[1]);
        var mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallbackMinutes;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallbackMinutes;
        return hh * 60 + mm;
      }

      function isNowInFreeWindow() {
        var now = new Date();
        var nowMins = now.getHours() * 60 + now.getMinutes();
        var startMins = parseHmToMinutes(autoCfg.freeUpdateStart, 16 * 60 + 30);
        var endMins = parseHmToMinutes(autoCfg.freeUpdateEnd, 19 * 60);
        if (endMins >= startMins) {
          return nowMins >= startMins && nowMins <= endMins;
        }
        return nowMins >= startMins || nowMins <= endMins;
      }

      var nowYmd = dateFormat(new Date(), "yyyymmdd");
      var lsKey = String(autoCfg.storageKey || "kqxs_auto_daily_last_ymd");
      var inFreeWindow = isNowInFreeWindow();

      try {
        if (window.localStorage.getItem(lsKey) === nowYmd) return;
      } catch (e) {
        // Ignore localStorage errors and continue with in-memory guard.
      }

      if (autoDailyUpdatingRef.current) return;
      autoDailyUpdatingRef.current = true;

      var delayMs = Math.max(0, Number(autoCfg.delayMs || 1800));
      var timer = setTimeout(async function () {
        // Nếu autoCfg có tmproxyApiKey: tự lấy proxy TMProxy trước khi gọi cap_nhat
        var autoTmproxyApiKey = String(autoCfg.tmproxyApiKey || autoCfg.api_key || "").trim();
        var autoTmproxyLocationId = Number(autoCfg.tmproxyLocationId || autoCfg.id_location || 0);
        if (autoTmproxyApiKey) {
          try {
            var tmInfo = await fetchTmproxyInfo(
              autoTmproxyApiKey,
              autoTmproxyLocationId
            );
            // Ghi vào window.csmKqxsProxyConfig để cap_nhat dùng đúng proxy
            window.csmKqxsProxyConfig = Object.assign(
              readJsonObject(window.csmKqxsProxyConfig),
              { enabled: true, server: tmInfo.server, username: tmInfo.username, password: tmInfo.password }
            );
            console.log("[Auto TMProxy] Sử dụng proxy:", tmInfo.server);
          } catch (tmErr) {
            console.error("[Auto TMProxy] Lỗi lấy proxy:", tmErr.message);
          }
        }
        var targetDate = new Date();
        if (!inFreeWindow) {
          targetDate.setDate(targetDate.getDate() - 1);
        }

        cap_nhat(targetDate).then(function (ok) {
          if (!ok) return;
          try {
            window.localStorage.setItem(lsKey, dateFormat(new Date(), "yyyymmdd"));
          } catch (e) {
            // Ignore localStorage errors.
          }
          if (inFreeWindow) {
            thongbao("Đã tự động cập nhật kết quả ngày " + dateFormat(targetDate, "dd/mm/yyyy") + " (đúng khung giờ)");
          } else {
            thongbao("Đã tự động cập nhật bù kết quả ngày " + dateFormat(targetDate, "dd/mm/yyyy") + " (ngoài khung giờ)");
          }
        }).catch(function (err) {
          console.error("Auto daily update failed", err);
        }).finally(function () {
          autoDailyUpdatingRef.current = false;
        });
      }, delayMs);

      return function () {
        clearTimeout(timer);
        autoDailyUpdatingRef.current = false;
      };
    }, [allowUpdateActions]);

    function locVaSapXepNgay(rows) {
      var seen = {};
      var out = [];
      for (var i = 0; i < rows.length; i += 1) {
        var r = rows[i] || {};
        var ngay = String(r.field_ngay || "").trim();
        if (!ngay || seen[ngay]) continue;
        seen[ngay] = true;
        out.push(r);
      }
      out.sort(function (a, b) {
        return chuyenNgay(String(b.field_ngay || "").trim(), "yyyymmdd") - chuyenNgay(String(a.field_ngay || "").trim(), "yyyymmdd");
      });
      return out;
    }

    function layNguonDaChon(dataMienOverride) {
      var mapData = dataMienOverride || du_lieu_dai_mien;
      var dsData = (mapData[mien] && mapData[mien].data) || [];
      var out = [];
      ds_dai_chon.forEach(function (sttRaw) {
        var stt = Number(sttRaw);
        var dsTheoThu = dsData.filter(function (dm) {
          return Number(dm.stt) === stt && dm.thu === thu_tuan;
        });
        dsTheoThu.forEach(function (dlD) { out.push(dlD); });
      });
      return out;
    }

    function layNguonTheoDanhSach(sttList, dataMienOverride) {
      var mapData = dataMienOverride || du_lieu_dai_mien;
      var dsData = (mapData[mien] && mapData[mien].data) || [];
      var out = [];
      (sttList || []).forEach(function (sttRaw) {
        var stt = Number(sttRaw);
        if (loai_tim === 0) {
          dsData.filter(function (dm) { return Number(dm.stt) === stt; }).forEach(function (dlD) {
            out.push(dlD);
          });
        } else {
          var dlOne = dsData.find(function (dm) { return Number(dm.stt) === stt && dm.thu === thu_tuan; });
          if (dlOne) out.push(dlOne);
        }
      });
      return out;
    }

    function getRowTwoDigits(row) {
      var out = [];
      Object.keys(row || {}).forEach(function (f) {
        if (!/^field_(duoi|dau|so\d+)$/.test(f)) return;
        var val = String(row[f] || "").trim();
        if (!val) return;
        var so = val.slice(-2);
        if (/^\d{2}$/.test(so)) out.push(so);
      });
      return out;
    }

    function stationNameKey(name) {
      return stripVietnamese(String(name || ""))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    }

    function resolveStationObjectName(rawName, mienCode) {
      var raw = String(rawName || "").trim();
      if (!raw) return "";
      var key = stationNameKey(raw);
      if (!key) return "";

      var aliasToObject = {
        thuatthienhue: "kqxs_thuathienhue",
        thuathienhue: "kqxs_thuathienhue",
        hue: "kqxs_thuathienhue",
        binhduong: "kqxs_binhduong",
        songbe: "kqxs_binhduong",
        tphcm: "kqxs_tphcm",
        thanhphohochiminh: "kqxs_tphcm",
        hochiminh: "kqxs_tphcm"
      };
      if (aliasToObject[key]) return aliasToObject[key];

      var mienList = (danh_sach_dai || []).filter(function (d) {
        return !mienCode || String(d.mien || "") === String(mienCode || "");
      });

      for (var i = 0; i < mienList.length; i += 1) {
        var item = mienList[i] || {};
        var nameKey = stationNameKey(item.ten_dai || "");
        if (!nameKey) continue;
        if (nameKey === key || nameKey.indexOf(key) >= 0 || key.indexOf(nameKey) >= 0) {
          if (item.du_lieu_dai) return String(item.du_lieu_dai);
        }
      }

      return normalizeStationTableName(raw);
    }

    function calcThongKeMetrics(kyCounts) {
      var arr = Array.isArray(kyCounts) ? kyCounts.slice() : [];
      var tong = 0;
      var dem = 0;
      var kxh = 0;
      var maxKxh = 0;

      for (var i = 0; i < arr.length; i += 1) {
        var v = Number(arr[i] || 0);
        if (v > 0) {
          tong += v;
          dem += 1;
        }
      }

      var sawHit = false;
      var run = 0;
      for (var j = 0; j < arr.length; j += 1) {
        var vv = Number(arr[j] || 0);
        if (vv > 0) {
          sawHit = true;
          if (run > maxKxh) maxKxh = run;
          run = 0;
        } else {
          if (!sawHit) kxh += 1;
          run += 1;
        }
      }
      if (run > maxKxh) maxKxh = run;

      // Mirror Vue's "thoa_man" rule (giống chính xác thong_ke_moi trong Vue)
      var evalArr = arr.slice(); // Vue iterates k=0..mang_ky.length-1, tức là thứ tự sap_xep 0 (1->N)
      var khoi_dong = -1;
      var so_lan = 0;
      var so_lan_trung = 0;
      var xet_tiep = true;
      var kxh_ht = 0;
      var ra_tiep = 0;
      var bieu_dien = "";
      for (var k = 0; k < evalArr.length; k += 1) {
        var rv = Number(evalArr[k] || 0);
        if (rv > 0) {
          ra_tiep++;
          if (kxh_ht === 0 && khoi_dong === -1) xet_tiep = false;
          if (khoi_dong === -1) khoi_dong = kxh_ht;
          if (xet_tiep && kxh_ht > 0) {
            if (kxh_ht <= khoi_dong) {
              so_lan += 1;
              if (kxh_ht === khoi_dong) so_lan_trung += 1;
            } else {
              xet_tiep = false;
            }
            bieu_dien += (bieu_dien ? "," : "") + kxh_ht;
          }
          kxh_ht = 0;
        } else {
          if (xet_tiep) {
            for (var rt = 0; rt < ra_tiep - 1; rt++) {
              bieu_dien += (bieu_dien ? ",0" : "0");
            }
          }
          ra_tiep = 0;
          kxh_ht += 1;
        }
      }

      var thoa_man = (khoi_dong >= Number(kxh_tu || 0) && khoi_dong <= Number(kxh_den || 0) && so_lan > 1);
      if (kxh_locsau && so_lan_trung <= 1) thoa_man = false;

      return {
        tong: tong,
        dem: dem,
        kxh: kxh,
        max_kxh: maxKxh,
        khoi_dong: khoi_dong > 0 ? khoi_dong : 0,
        so_lan: so_lan,
        so_lan_trung: so_lan_trung,
        thoa_man: thoa_man,
        bieu_dien: bieu_dien
      };
    }

    function xayDungNguCanhSoChu(dataMienOverride) {
      if (!(so_chu.length && ds_dai_chon_so_chu.length)) {
        return { allowedDateSet: null, historyRows: [] };
      }

      var denDate = chuyenNgay(den_ngay, "dd/mm/yyyy");
      var sources = layNguonTheoDanhSach(ds_dai_chon_so_chu, dataMienOverride);
      var dateAnyMap = {};
      var dateHitMap = {};
      var dateHitForStatsMap = {};
      var mergedByDate = {};

      sources.forEach(function (dai) {
        var rows = (dai.data || []).slice();
        if (loai_tim === 0) {
          rows = rows.filter(function (r) { return String(r.thu || "") === String(dai.thu || ""); });
        } else {
          rows = rows.filter(function (r) { return r.thu === thu_tuan; });
        }
        rows = rows.filter(function (r) {
          var ngay = String(r.field_ngay || "").trim();
          if (!ngay) return false;
          return chuyenNgay(ngay, "yyyymmdd") < denDate;
        });

        var byDate = {};
        rows.forEach(function (r) {
          var ngay = String(r.field_ngay || "").trim();
          if (!ngay) return;
          if (!byDate[ngay]) byDate[ngay] = r;
        });

        Object.keys(byDate).forEach(function (ngay) {
          dateAnyMap[ngay] = true;
          var values = getRowTwoDigits(byDate[ngay]);
          if (!mergedByDate[ngay]) mergedByDate[ngay] = { all: [], byStt: {} };
          mergedByDate[ngay].all = mergedByDate[ngay].all.concat(values);
          var sttKey = String(dai.stt || "");
          if (!mergedByDate[ngay].byStt[sttKey]) mergedByDate[ngay].byStt[sttKey] = [];
          mergedByDate[ngay].byStt[sttKey] = mergedByDate[ngay].byStt[sttKey].concat(values);

          var hit = so_chu.some(function (so) { return values.indexOf(String(so)) >= 0; });
          if (hit) dateHitMap[ngay] = true;
        });
      });

      Object.keys(mergedByDate).forEach(function (ngay) {
        var merged = mergedByDate[ngay] || { byStt: {} };
        var hitMainStations = (ds_dai_chon || []).some(function (sttRaw) {
          var stt = String(sttRaw || "");
          var vals = merged.byStt[stt] || [];
          return so_chu.some(function (so) { return vals.indexOf(String(so)) >= 0; });
        });
        if (hitMainStations) dateHitForStatsMap[ngay] = true;
      });

      var allowedDateSet = new Set(Object.keys(dateHitForStatsMap));
      var datesDesc = Object.keys(dateAnyMap).sort(function (a, b) {
        return chuyenNgay(b, "yyyymmdd") - chuyenNgay(a, "yyyymmdd");
      });

      var ghls = 0;
      var maxLs = Number(ls_bat_dau || 0);
      var daGioiHan = false;
      var historyRows = [];

      datesDesc.forEach(function (ngay, idx) {
        if (dateHitMap[ngay]) {
          if (ghls >= maxLs) {
            if (maxLs === Number(ls_bat_dau || 0) && !daGioiHan) {
              maxLs = ghls;
              daGioiHan = true;
            }
            historyRows.push({
              id: "ls_" + idx + "_" + ngay,
              stt: historyRows.length + 1,
              ngay: dateFormat(chuyenNgay(ngay, "yyyymmdd"), "dd/mm/yyyy"),
              so_ky: ghls
            });
          }
          ghls = 0;
        } else {
          ghls += 1;
        }
      });

      historyRows.sort(function (a, b) {
        var ngayA = String(a.ngay || "").trim();
        var ngayB = String(b.ngay || "").trim();
        return chuyenNgay(ngayB, "dd/mm/yyyy") - chuyenNgay(ngayA, "dd/mm/yyyy");
      });
      historyRows.forEach(function (row, idx) {
        row.stt = idx + 1;
      });
      return { allowedDateSet: allowedDateSet, historyRows: historyRows };
    }

    function buildThongKeTabItems(dataMienOverride, sourceSttList, includeKqTabs, includeHistoryTab, comboSourceSttList) {
      var mapData = dataMienOverride || du_lieu_dai_mien;
      var dsData = (mapData[mien] && mapData[mien].data) || [];
      var sourceList = (sourceSttList || []).map(function (x) { return String(x); });
      var comboSourceList = (comboSourceSttList || sourceList).map(function (x) { return String(x); });

      var ds_dai_chon_local = [];
      var sttSeen = {};
      sourceList.forEach(function (sttRaw) {
        var stt = String(sttRaw || "").trim();
        if (!stt || sttSeen[stt]) return;
        sttSeen[stt] = true;

        if (Number(loai_tim) === 0) {
          ds_dai_chon_local.push({ stt: stt, dai: mien + stt, ten_dai: mien + stt });
          return;
        }

        var dlDT = dsData.find(function (dm) {
          return String(dm.stt) === stt && String(dm.thu || "") === String(thu_tuan || "");
        });
        if (dlDT) ds_dai_chon_local.push({ stt: stt, dai: dlDT.ten_dai, ten_dai: dlDT.ten_dai });
        else ds_dai_chon_local.push({ stt: stt, dai: mien + stt, ten_dai: mien + stt });
      });

      var ds_dai_chonN = ds_dai_chon_local.slice();
      if (includeKqTabs) {
        var mang_cac_dai = getUniqueCombinations(comboSourceList, Number(loai_tk || 1));
        mang_cac_dai.forEach(function (lstDai) {
          if (Number(loai_tim) === 0) {
            var stt = lstDai.join("&");
            var dai = mien + " " + lstDai.join("&");
            ds_dai_chonN.push({ stt: stt, dai: dai, ten_dai: dai });
          } else if (lstDai.length > 1) {
            var sttN = lstDai.join("&");
            var daiN = mien + " " + lstDai.join("&");
            var tenDaiN = "";
            lstDai.forEach(function (id) {
              var csdai = ds_dai_chon_local.find(function (d) { return String(d.stt) === String(id); });
              if (!csdai) return;
              tenDaiN += (tenDaiN ? " & " : (mien + " ")) + csdai.ten_dai;
            });
            ds_dai_chonN.push({ stt: sttN, dai: daiN, ten_dai: tenDaiN || daiN });
          }
        });
      }

      var items = [];
      if (includeHistoryTab) {
        var ten_dai = ds_dai_chon_local.map(function (d) { return d.ten_dai; }).join(" & ");
        items.push({ id: "lich_su_so_chu", text: "Lịch Sử Sổ Chủ", ketqua: false, ten_dai: ten_dai || "Lịch Sử Sổ Chủ" });
      }

      if (includeKqTabs) {
        ds_dai_chonN.forEach(function (o) {
          items.push({ id: String(o.stt), text: o.dai, ketqua: false, ten_dai: o.ten_dai });
          if (String(o.stt) !== "lich_su_so_chu") {
            items.push({ id: "kq_" + String(o.stt), text: "KQ " + o.dai, ketqua: true, ten_dai: o.ten_dai });
          }
        });
      } else {
        ds_dai_chon_local.forEach(function (o) {
          items.push({ id: String(o.stt), text: o.dai, ketqua: false, ten_dai: o.ten_dai });
        });
      }

      return items;
    }

    async function lay_ds_dai(dsDaiDaLoc) {
      var reqId = taiDuLieuReqRef.current + 1;
      taiDuLieuReqRef.current = reqId;

      var dsDai = Array.isArray(dsDaiDaLoc) ? dsDaiDaLoc.slice() : [];
      if (!dsDai.length) {
        var emptyNext = {};
        emptyNext[mien] = { data: [] };
        setDuLieuDaiMien(emptyNext);
        return emptyNext;
      }

      var theoDai = {};
      var dataMien = [];
      for (var i = 0; i < dsDai.length; i += 1) {
        if (reqId !== taiDuLieuReqRef.current) return;
        var obj = dsDai[i];
        if (!theoDai[obj.du_lieu_dai]) {
          var rows = await fetchRows({
            app_id: "kqxs",
            obj_name: obj.du_lieu_dai,
            e_where: {
              operator: "AND",
              conditions: [
                { field: "field_ngay", type: "gte", value: dateFormat(chuyenNgay(String(tu_ngay || "").trim(), "dd/mm/yyyy"), "yyyymmdd") },
                { field: "field_ngay", type: "lte", value: dateFormat(chuyenNgay(String(den_ngay || "").trim(), "dd/mm/yyyy"), "yyyymmdd") }
              ]
            }
          });

          if (reqId !== taiDuLieuReqRef.current) return;

          theoDai[obj.du_lieu_dai] = rows.filter(function (kq) {
            return Boolean(kq && kq.field_ngay);
          }).map(function (kq) {
            var n = Object.assign({}, kq);
            var ngay = String(n.field_ngay || "").trim();
            n.field_ngay = ngay;
            if (!n.thu && ngay) n.thu = days[chuyenNgay(ngay, "yyyymmdd").getDay()];
            return n;
          });
        }

        dataMien.push({
          stt: obj.stt,
          thu: obj.thu,
          ten_dai: obj.ten_dai,
          dai: obj.du_lieu_dai,
          data: theoDai[obj.du_lieu_dai]
        });
      }

      if (reqId !== taiDuLieuReqRef.current) return;
      var next = {};
      next[mien] = { data: dataMien };
      setDuLieuDaiMien(next);
      return next;
    }

    async function xem_ket_qua() {
      if (!ds_dai_chon.length) {
        canhbao("Vui lòng Chọn Đài trước");
        return;
      }

      setActiveAction("kq");
      setSubTab("ketqua");

      setIsXemthuong(true);
      setLoading(true);
      setProgress(10);

      try {
        var loadedDataMien = await lay_ds_dai(dsDaiCanTai);
        var ymd = Number(dateFormat(chuyenNgay(den_ngay, "dd/mm/yyyy"), "yyyymmdd"));
        var selected = layNguonDaChon(loadedDataMien);

        var cards = [];
        var xuLy = [];

        for (var s = 0; s < 10; s += 1) {
          xuLy.push({ id: "h_" + s, chuc: s });
        }

        for (var i = 0; i < selected.length; i += 1) {
          var dai = selected[i];
          var dataDai = (dai.data || []).slice();
          if (loai_tim === 1) {
            dataDai = dataDai.filter(function (d) { return d.thu === dai.thu; });
          }
          var obRow = dataDai.filter(function (obj) {
            return Number(String(obj.field_ngay || "").trim()) <= ymd;
          }).sort(function (a, b) {
            return Number(String(b.field_ngay || "").trim()) - Number(String(a.field_ngay || "").trim());
          });

          if (!obRow.length) continue;
          var kq = obRow[0];
          cards.push({
            stt: Number(dai.stt),
            ten_dai: dai.ten_dai,
            ngay: dateFormat(chuyenNgay(kq.field_ngay, "yyyymmdd"), "dd/mm/yyyy"),
            thu: dai.thu,
            data: kq
          });

          Object.keys(kq).forEach(function (f) {
            if (!/^field_(duoi|dau|so\d+)$/.test(f)) return;
            var val = String(kq[f] || "").trim();
            if (!val) return;
            var so = val.slice(-2);
            if (!/^\d{2}$/.test(so)) return;
            var chuc = Number(so[0]);
            var donvi = so[1];
            var key = "dai_" + String(dai.stt);
            var row = xuLy[chuc] || { chuc: chuc };
            if (!row[key]) row[key] = "";
            row[key] += (row[key] ? "," : "") + donvi;
            xuLy[chuc] = row;
          });

          setProgress(Math.min(95, 10 + Math.floor((i + 1) * 80 / selected.length)));
        }

        setDsDaiChonXemKetQua(cards);
        setXuLyKetQua(xuLy);
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    async function buildThongKeData(isThongKeMoi, allowedDateSet, sourceSttList, dataMienOverride) {
      var sourceList = Array.isArray(sourceSttList) && sourceSttList.length ? sourceSttList : ds_dai_chon;
      if (!sourceList.length) return { rows: [], mang_dai: [] };

      var tu = tu_ngay;
      var den = den_ngay;
      var daysRange = TruNgayRaSoNgay(den, tu, "dd/mm/yyyy");
      if (daysRange < 0) return { rows: [], mang_dai: [] };

      var selected = layNguonTheoDanhSach(sourceList, dataMienOverride);
      var mang_dl_dai = {};
      var maxSoKy = Math.max(1, Number(so_ky || 1));

      // Bước 1: Gom tất cả các batch (theo thu) của từng đài vào rawByStation TRƯỚC khi slice.
      // Giống Vue: mang_dl_dai[STT] chứa toàn bộ dữ liệu các thu ghép lại, sau đó mới sort+dedup+
      // đếm kỳ theo thứ tự ngày. Nếu slice sớm theo từng batch, các batch thứ 2, 3... sẽ bị
      // đẩy ra ngoài giới hạn idx < maxSoKy và bị bỏ qua hoàn toàn trong vòng lặp combo.
      var rawByStation = {};
      for (var i = 0; i < selected.length; i += 1) {
        var dai = selected[i];
        var rows = (dai.data || []).slice();
        if (loai_tim === 0) {
          rows = rows.filter(function (d) { return String(d.thu || "") === String(dai.thu || ""); });
        } else {
          rows = rows.filter(function (d) { return d.thu === thu_tuan; });
        }
        if (allowedDateSet && allowedDateSet.size) {
          rows = rows.filter(function (obj) {
            var ngay = String(obj.field_ngay || "").trim();
            return allowedDateSet.has(ngay);
          });
        } else {
          rows = rows.filter(function (obj) {
            return chuyenNgay(String(obj.field_ngay || "").trim(), "yyyymmdd") >= chuyenNgay(tu, "dd/mm/yyyy")
              && chuyenNgay(String(obj.field_ngay || "").trim(), "yyyymmdd") < chuyenNgay(den, "dd/mm/yyyy");
          });
        }
        if (!rawByStation[dai.stt]) rawByStation[dai.stt] = [];
        rawByStation[dai.stt] = rawByStation[dai.stt].concat(rows);
      }
      // Bước 2: Hợp nhất toàn bộ batch của từng đài: dedup theo ngày, sort giảm dần, rồi mới
      // slice đến maxSoKy. Đảm bảo đúng với Vue — các ngày T2, T4, T7... của cùng một đài
      // được xếp theo thứ tự thời gian trước khi đếm kỳ 1, kỳ 2, kỳ 3...
      Object.keys(rawByStation).forEach(function (stt) {
        mang_dl_dai[stt] = locVaSapXepNgay(rawByStation[stt]).slice(0, maxSoKy);
      });

      var mang_dai = Object.keys(mang_dl_dai);
      var mang_cac_dai = [];
      // Vue luôn có tab đơn cho từng đài đã chọn
      mang_dai.forEach(function (stt) {
        mang_cac_dai.push([stt]);
      });
      // Tab tổ hợp theo loai_tk (tránh lặp khi loai_tk = 1)
      getUniqueCombinations(mang_dai, Number(loai_tk)).forEach(function (combo) {
        if (combo.length > 1) mang_cac_dai.push(combo);
      });

      function createEmptySoMap(prefix) {
        var out = {};
        for (var s = 0; s < 100; s += 1) {
          var soStr = String(s).padStart(2, "0");
          var kyInit = [];
          for (var q = 0; q < maxSoKy; q += 1) kyInit.push(0);
          out[soStr] = {
            id: String(prefix || "") + "_" + soStr,
            so: soStr,
            to_hop: "",
            ky: kyInit,
            tong: 0,
            dem: 0,
            kxh: 0,
            max_kxh: 0,
            thoa_man: false
          };
        }
        return out;
      }

      // Tính thống kê theo từng đài một lần, sau đó tab tổ hợp chỉ cộng lại từ kết quả này.
      // Cách này giúp KQ 1&2 luôn khớp với logic của từng tab đơn 1, 2 như Vue kỳ vọng.
      var stationSoStats = {};
      mang_dai.forEach(function (stt) {
        var soMap = createEmptySoMap("s_" + String(stt));
        var rows = mang_dl_dai[stt] || [];
        rows.forEach(function (r, idx) {
          if (idx >= maxSoKy) return;
          var soArr = getRowTwoDigits(r);
          soArr.forEach(function (so) {
            if (!soMap[so]) return;
            soMap[so].ky[idx] = Number(soMap[so].ky[idx] || 0) + 1;
          });
        });
        stationSoStats[stt] = soMap;
      });

      var outRows = [];

      for (var c = 0; c < mang_cac_dai.length; c += 1) {
        var combo = mang_cac_dai[c];
        var comboKey = combo.join("_");
        var mapSo = createEmptySoMap(comboKey);

        combo.forEach(function (stt) {
          var stationMap = stationSoStats[stt] || {};
          Object.keys(mapSo).forEach(function (soKey) {
            var src = stationMap[soKey];
            if (!src || !src.ky) return;
            for (var k = 0; k < maxSoKy; k += 1) {
              mapSo[soKey].ky[k] = Number(mapSo[soKey].ky[k] || 0) + Number(src.ky[k] || 0);
            }
          });
        });

        Object.keys(mapSo).forEach(function (k) {
          var row = mapSo[k];
          row.to_hop = combo.join(",");
          row.id = comboKey + "_" + row.so;
          var m = calcThongKeMetrics(row.ky || []);
          var kSoKy = Number((row.ky && row.ky[Math.max(0, maxSoKy - 1)]) || 0);
          row.tong = m.tong;
          row.dem = m.dem;
          row.kxh = m.kxh;
          row.max_kxh = m.max_kxh;
          row.lich_su = m.max_kxh;
          row.thoa_man = m.thoa_man;
          row.bieu_dien = m.bieu_dien || "";
          row.khoi_dong = m.khoi_dong;
          row.so_lan = m.so_lan;
          row.so_lan_trung = m.so_lan_trung;
          row.k_so_ky = kSoKy;
          row.has_ky_chot = kSoKy > 0;
          // Luôn push tất cả rows (kể cả thong_ke_moi) — giống Vue dsThongKe đủ 100 số
          // Việc lọc thoa_man cho tab KQ được xử lý ở phần render (giống Vue's hien_kq branch)
          outRows.push(row);
        });
      }

      // Bảng chính luôn hiện đủ tất cả (no pre-filter).
      // Việc lọc cho từng sub-card (lay_so_ky, kxh, dem_nho_hon, matrix) được xử lý
      // bởi thongkeGroups useMemo, giống đúng với thiết kế Vue.
      outRows.sort(function (a, b) {
        // Cả hai nút đều sort theo số tự nhiên 00-99 (giống Vue dsThongKe)
        return Number(a.so || 0) - Number(b.so || 0);
      });

      return { rows: outRows, mang_dai: mang_dai.map(function (x) { return String(x); }) };
    }

    async function chay_thong_ke() {
      if (ds_dai_chon.length === 0) return canhbao("Vui lòng Chọn Đài trước");
      if (TruNgayRaSoNgay(den_ngay, tu_ngay, "dd/mm/yyyy") < 28) return canhbao("Vui lòng lại thời gian dài hơn 28 ngày");
      if (ds_dai_chon.length < loai_tk) return canhbao("Vui lòng chọn thêm đài cần xem cho Chọn Đài");

      setActiveAction("tk");
      setSubTab("");
      setIsXemthuong(false);
      setLoading(true);
      setProgress(15);

      try {
        var appliedSnapshot = snapshotThongKeInputs();
        var loadedDataMien = await lay_ds_dai(dsDaiCanTai);
        // Vue chỉ chạy luồng số chủ khi có cả dãy số chủ và danh sách đài số chủ.
        var useSoChuSource = so_chu.length > 0 && ds_dai_chon_so_chu.length > 0;
        var soChuCtx = useSoChuSource ? xayDungNguCanhSoChu(loadedDataMien) : { allowedDateSet: null, historyRows: [] };
        var thongKeSource = useSoChuSource ? ds_dai_chon_so_chu : ds_dai_chon;
        var includeKqTabs = (Number(lay_so_ky || 0) + Number(dem_be_hon || 0) + Number(kxh_phai_lonhon || 0) + Number(dem_nho_hon || 0) + Number(dem_lon_hon || 0) > 0);
        var thongKeResult = await buildThongKeData(false, soChuCtx.allowedDateSet, thongKeSource, loadedDataMien);
        var rows = (thongKeResult && Array.isArray(thongKeResult.rows)) ? thongKeResult.rows : [];
        var mangDaiTabs = (thongKeResult && Array.isArray(thongKeResult.mang_dai)) ? thongKeResult.mang_dai : thongKeSource;
        var tabItems = buildThongKeTabItems(loadedDataMien, thongKeSource, includeKqTabs, useSoChuSource, mangDaiTabs);
        setThongkeTabItems(tabItems);
        setLichSuSoChuRows(soChuCtx.historyRows || []);
        setThongkeRows(rows);
        setAppliedThongKe(appliedSnapshot);
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    async function thong_ke_moi() {
      if (ds_dai_chon.length === 0) return canhbao("Vui lòng Chọn Đài trước");
      if (TruNgayRaSoNgay(den_ngay, tu_ngay, "dd/mm/yyyy") < 28) return canhbao("Vui lòng lại thời gian dài hơn 28 ngày");
      if (ds_dai_chon.length < loai_tk) return canhbao("Vui lòng chọn thêm đài cần xem cho Chọn Đài");

      setActiveAction("tkm");
      setSubTab("");
      setIsXemthuong(false);
      setLoading(true);
      setProgress(15);

      try {
        var appliedSnapshot = snapshotThongKeInputs();
        var loadedDataMien = await lay_ds_dai(dsDaiCanTai);
        var thongKeResult = await buildThongKeData(true, null, null, loadedDataMien);
        var rows = (thongKeResult && Array.isArray(thongKeResult.rows)) ? thongKeResult.rows : [];
        var mangDaiTabs = (thongKeResult && Array.isArray(thongKeResult.mang_dai)) ? thongKeResult.mang_dai : ds_dai_chon;
        var tabItems = buildThongKeTabItems(loadedDataMien, ds_dai_chon, true, false, mangDaiTabs);
        setThongkeTabItems(tabItems);
        setLichSuSoChuRows([]);
        setThongkeRows(rows);
        setAppliedThongKe(appliedSnapshot);
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    function sleepMs(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, Math.max(0, Number(ms) || 0));
      });
    }

    async function fetchWithBackoff(url, options, maxRetries, baseDelayMs) {
      var retries = Math.max(0, Number(maxRetries) || 0);
      var baseDelay = Math.max(200, Number(baseDelayMs) || 800);
      var lastErr = null;
      for (var attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) {
          await sleepMs(baseDelay * attempt);
        }
        try {
          var resp = await fetch(url, options || {});
          if (resp && (resp.status === 429 || resp.status === 503 || resp.status === 502 || resp.status === 403)) {
            lastErr = new Error("HTTP " + resp.status + " from " + url);
            if (attempt < retries) continue;
          }
          return resp;
        } catch (err) {
          lastErr = err;
          if (attempt >= retries) throw err;
        }
      }
      throw lastErr || new Error("Fetch failed: " + url);
    }

    async function cap_nhat(ngay_lay) {
      var ngay_cap_nhat = dateFormat(ngay_lay, "dd-mm-yyyy");
      var link = "/api/scrape-web";
      if (window.hasOwnProperty("process")) link = "";
      var requestGapMs = link ? 1500 : 900;
      var proxyCfg = getKqxsProxyConfig();

      // Nếu dùng TMProxy: lấy proxy IP động 1 lần trước khi fetch
      if (link && proxyCfg.tmproxyApiKey && !proxyCfg.server) {
        try {
          var tmInfo = await fetchTmproxyInfo(proxyCfg.tmproxyApiKey, proxyCfg.tmproxyLocationId);
          proxyCfg = Object.assign({}, proxyCfg, {
            enabled: true,
            server: tmInfo.server,
            username: tmInfo.username,
            password: tmInfo.password
          });
          console.log("[TMProxy] Sử dụng proxy:", proxyCfg.server);
        } catch (tmErr) {
          console.error("[TMProxy] Lỗi lấy proxy:", tmErr.message);
          proxyCfg = Object.assign({}, proxyCfg, { enabled: false });
        }
      }

      var updatedRegions = 0;

      function txt(node) {
        return String((node && (node.innerText || node.textContent)) || "").trim();
      }

      async function fetchHtml(url) {
        await sleepMs(requestGapMs);
        if (!link) {
          var raw = await fetchWithBackoff(url, { cache: "no-store" }, 2, requestGapMs);
          return await raw.text();
        }
        var payload = { link: url };
        if (proxyCfg.enabled && proxyCfg.server) {
          payload.proxyServer = proxyCfg.server;
          if (proxyCfg.username) payload.proxyUsername = proxyCfg.username;
          if (proxyCfg.password) payload.proxyPassword = proxyCfg.password;
          payload.useIncognito = !!proxyCfg.useIncognito;
          payload.listenToConsole = !!proxyCfg.listenToConsole;
          if (proxyCfg.onPageLoadedScript) payload.onPageLoadedScript = proxyCfg.onPageLoadedScript;
          if (proxyCfg.scriptToExecute) payload.scriptToExecute = proxyCfg.scriptToExecute;
        }
        var csmToken = (function () {
          try {
            var raw = localStorage.getItem("access-token");
            if (!raw) return "";
            var parsed = JSON.parse(raw);
            return String((parsed && parsed.state && parsed.state.token) || "");
          } catch (e) { return ""; }
        })();
        var reqHeaders = { "Content-Type": "application/json", "Accept": "application/json" };
        if (csmToken) reqHeaders["csm-token"] = csmToken;
        var resp = await fetchWithBackoff(link, {
          method: "POST",
          credentials: "include",
          headers: reqHeaders,
          cache: "no-store",
          body: JSON.stringify(payload)
        }, 2, requestGapMs);
        try {
          var payload = await resp.json();
          return String((payload && payload.data) || "");
        } catch (_e) {
          return await resp.text();
        }
      }

      async function saveRecord(tableName, objKQ) {
        if (!tableName || !objKQ || !objKQ.field_ngay) return;
        var data = Object.assign({}, objKQ);
        data.id = tableName + "_" + String(data.field_ngay || "").trim();
        data.thu = days[chuyenNgay(String(data.field_ngay || ""), "yyyymmdd").getDay()];
        var whereByNgay = { field: "field_ngay", type: "eq", value: data.field_ngay };
        var updateRs = await updateRows({
          app_id: "kqxs",
          obj_name: tableName,
          command: "update",
          obj_update: data,
          pk_fields: ["field_ngay"],
          e_where: whereByNgay
        });
        var notFound = !updateRs
          || updateRs.success === false
          || updateRs.error === true
          || Number(updateRs.code || 0) === 400;
        var notFoundMessage = String((updateRs && (updateRs.message || updateRs.error)) || "");
        if (notFound && /khong tim thay ban ghi de cap nhat|không tìm thấy bản ghi để cập nhật/i.test(notFoundMessage)) {
          await updateRows({
            app_id: "kqxs",
            obj_name: tableName,
            command: "create",
            obj_update: data,
            pk_fields: ["field_ngay"],
            e_where: whereByNgay
          });
        }
      }

      async function parseMienNamTrung(html, isMienTrung) {
        var docP = new DOMParser().parseFromString(String(html || ""), "text/html");
        var bangketqua = docP.querySelector(".box_kqxs");
        if (!bangketqua) return;
        var ngayNode = bangketqua.querySelector(".ngay");
        var ngay = txt(ngayNode);
        if (!ngay) return;

        var mienCode = isMienTrung ? "MT" : "MN";

        var tables = bangketqua.querySelectorAll("table.rightcl");
        for (var ti = 0; ti < tables.length; ti += 1) {
          var kq = tables[ti];
          var tinh = txt(kq.querySelector(".tinh"));
          var tableName = resolveStationObjectName(tinh, mienCode);
          if (isMienTrung && (tinh === "Thừa T. Huế" || tinh === "Huế")) {
            tableName = "kqxs_thuathienhue";
          }
          if (!tableName) continue;

          var objKQ = { field_ngay: dateFormat(chuyenNgay(ngay, "dd/mm/yyyy"), "yyyymmdd") };
          var idx = 0;
          var rows = kq.querySelectorAll("tr");
          for (var ri = 0; ri < rows.length; ri += 1) {
            var cols = rows[ri].querySelectorAll("td");
            for (var ci = 0; ci < cols.length; ci += 1) {
              var gs = cols[ci].querySelectorAll("div");
              for (var gi = 0; gi < gs.length; gi += 1) {
                var val = txt(gs[gi]);
                if (!val) continue;
                idx += 1;
                if (idx === 1) objKQ.field_dau = val;
                else if (idx === 18) objKQ.field_duoi = val;
                else objKQ["field_so" + idx] = val;
              }
            }
          }
          await saveRecord(tableName, objKQ);
        }
      }

      async function parseMienBac(html) {
        var docP = new DOMParser().parseFromString(String(html || ""), "text/html");
        var bangketqua = docP.querySelector(".box_kqxs");
        if (!bangketqua) return;
        var ngayNode = bangketqua.querySelector("table.bkqtinhmienbac .tngay a");
        var ngay = txt(ngayNode);
        if (!ngay) return;

        var tables = bangketqua.querySelectorAll("table.bkqtinhmienbac");
        for (var ti = 0; ti < tables.length; ti += 1) {
          var kq = tables[ti];
          var objKQ = { field_ngay: dateFormat(chuyenNgay(ngay, "dd/mm/yyyy"), "yyyymmdd") };
          var idx = 28;
          var rows = kq.querySelectorAll("tr:not(:first-child)");
          for (var ri = 0; ri < rows.length; ri += 1) {
            var cols = rows[ri].querySelectorAll("td");
            for (var ci = 0; ci < cols.length; ci += 1) {
              var gs = cols[ci].querySelectorAll("div");
              for (var gi = 0; gi < gs.length; gi += 1) {
                var val = txt(gs[gi]);
                if (!val) continue;
                idx -= 1;
                if (idx === 27) objKQ.field_duoi = val;
                else if (idx === 1) objKQ.field_dau = val;
                else objKQ["field_so" + idx] = val;
              }
            }
          }
          await saveRecord("kqxs_mienbac", objKQ);
        }
      }

      var regions = [
        { mien: "MN", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam/" + ngay_cap_nhat + ".html" },
        { mien: "MT", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-trung/" + ngay_cap_nhat + ".html" },
        { mien: "MB", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/" + ngay_cap_nhat + ".html" }
      ];

      for (var i = 0; i < regions.length; i += 1) {
        var r = regions[i];
        try {
          var html = await fetchHtml(r.url);
          if (!html) continue;
          if (r.mien === "MN") await parseMienNamTrung(html, false);
          else if (r.mien === "MT") await parseMienNamTrung(html, true);
          else await parseMienBac(html);
          updatedRegions += 1;
          thongbao("Đã cập nhật kết quả " + r.mien + " ngày " + dateFormat(ngay_lay, "dd/mm/yyyy"));
        } catch (err) {
          console.log("Failed to fetch page:", err);
        }
      }

      return updatedRegions > 0;
    }

    async function cap_nhat_xskt(ngay_lay) {
      if (KQXS_VIEW_ONLY) {
        canhbao(tt.readonlyWarn || "View-only mode");
        return;
      }
      var ngay_cap_nhat = dateFormat(ngay_lay, "d-m-yyyy");
      var link = "api.shtml?link=";
      if (window.hasOwnProperty("process")) link = "";

      var urls = [
        "https://xskt.com.vn/xsmn/ngay-" + ngay_cap_nhat,
        "https://xskt.com.vn/xsmt/ngay-" + ngay_cap_nhat,
        "https://xskt.com.vn/xsmb/ngay-" + ngay_cap_nhat
      ];

      setLoading(true);
      setProgress(5);

      for (var i = 0; i < urls.length; i += 1) {
        try {
          var resp = await fetch(link + urls[i], { cache: "no-store" });
          await resp.text();
          var pct = 5 + Math.round(((i + 1) / urls.length) * 95);
          setProgress(Math.min(100, pct));
        } catch (err) {
          console.log("Failed to fetch page:", err);
        }
      }

      thongbao("Đã cập nhật dữ liệu XSKT ngày " + dateFormat(ngay_lay, "dd/mm/yyyy"));
      setTimeout(function () { setProgress(0); }, 600);
      setLoading(false);
    }

    async function chay_cap_nhat() {
      if (KQXS_VIEW_ONLY) {
        canhbao(tt.readonlyWarn || "View-only mode");
        return;
      }
      var soNgay = TruNgayRaSoNgay(den_ngay, tu_ngay, "dd/mm/yyyy");
      if (soNgay < 0) return;

      setLoading(true);
      try {
        var totalSteps = Math.max(soNgay + 1, 1);
        for (var cur = soNgay; cur >= 0; cur -= 1) {
          var ngay_xo = CongNgay(tu_ngay, cur, "dd/mm/yyyy");
          await cap_nhat(chuyenNgay(ngay_xo, "dd/mm/yyyy"));
          await sleepMs(1200);
          var done = totalSteps - cur;
          var pct = Math.round((done / totalSteps) * 100);
          setProgress(Math.max(0, Math.min(100, pct)));
        }
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 800);
      }
    }

    function buildKyColumns(totalKyInput, sapXepInput) {
      var cols = [];
      var totalKy = Math.max(1, Number(totalKyInput || 1));
      if (Number(sapXepInput) === 0) {
        for (var i = 1; i <= totalKy; i += 1) {
          (function (kyNo) {
            cols.push({
              title: String(kyNo),
              dataIndex: "k_" + kyNo,
              key: "k_" + kyNo,
              width: 50,
              render: function (_v, rec) {
                return Number((rec && rec.ky && rec.ky[kyNo - 1]) || 0);
              }
            });
          })(i);
        }
      } else {
        for (var j = totalKy; j >= 1; j -= 1) {
          (function (kyNo) {
            cols.push({
              title: String(kyNo),
              dataIndex: "k_" + kyNo,
              key: "k_" + kyNo,
              width: 50,
              render: function (_v, rec) {
                return Number((rec && rec.ky && rec.ky[kyNo - 1]) || 0);
              }
            });
          })(j);
        }
      }
      return cols;
    }

    var thongkeColumns = [
      { title: tt.colTong, dataIndex: "tong", key: "tong", width: 90 },
      { title: tt.colDem, dataIndex: "dem", key: "dem", width: 90 },
      { title: tt.colKxh, dataIndex: "kxh", key: "kxh", width: 90 },
      { title: tt.colMaxKxh, dataIndex: "lich_su", key: "lich_su", width: 110 },
      { title: tt.colSo, dataIndex: "so", key: "so", width: 80 }
    ].concat(buildKyColumns(appliedThongKe.so_ky, appliedThongKe.sap_xep));

    var lichSuSoChuColumns = [
      { title: "STT", dataIndex: "stt", key: "stt", width: 80 },
      { title: "Ngày", dataIndex: "ngay", key: "ngay", width: 140 },
      { title: "Số kỳ", dataIndex: "so_ky", key: "so_ky", width: 100 }
    ];

    var ketquaColumns = [{ title: tt.colChuc, dataIndex: "chuc", key: "chuc", width: 100 }]
      .concat(ds_dai_chon_xem_ket_qua.map(function (d) {
        return {
          title: d.ten_dai,
          dataIndex: "dai_" + d.stt,
          key: "dai_" + d.stt,
          render: function (vals) {
            var txt = String(vals || "");
            if (!txt) return null;
            return h(Tag, { color: theme.primary }, txt);
          }
        };
      }));

    function getComboLabel(combo) {
      var dsData = (du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || [];
      var lookup = {};
      dsData.forEach(function (d) {
        lookup[String(d.stt)] = d.ten_dai || String(d.stt);
      });
      return String(combo || "").split(",").map(function (stt) {
        var key = String(stt || "").trim();
        return lookup[key] || key;
      }).join(" & ");
    }

    function buildPairRows(list, valueKey, idPrefix) {
      var rows = Array.isArray(list) ? list.slice() : [];
      var half = Math.ceil(rows.length / 2);
      var out = [];
      for (var i = 0; i < half; i += 1) {
        var left = rows[i] || null;
        var right = rows[i + half] || null;
        out.push({
          id: idPrefix + "_" + i,
          so1: left ? left.so : "",
          vach1: "",
          val1: left ? left[valueKey] : "",
          vach: "",
          so2: right ? right.so : "",
          vach2: "",
          val2: right ? right[valueKey] : ""
        });
      }
      return out;
    }

    function buildLaySoKyPairRows(list, idPrefix) {
      var rows = Array.isArray(list) ? list.slice() : [];
      var half = Math.ceil(rows.length / 2);
      var out = [];
      var maxCot = Math.max(1, Number(appliedThongKe.lay_so_ky || 1));

      function pickKyVals(src) {
        var vals = [];
        var kyArr = (src && src.ky) || [];
        // Theo Vue: khi sap_xep=0 lấy từ kỳ 1 -> kỳ N; khi sap_xep=1 lấy từ kỳ N -> kỳ 1.
        // Điều này ảnh hưởng trực tiếp bảng con lay_so_ky ở tab KQ (ví dụ tiêu đề 28-1-3).
        var idxList = [];
        if (Number(appliedThongKe.sap_xep) === 0) {
          for (var i = 0; i < kyArr.length; i += 1) idxList.push(i);
        } else {
          for (var j = kyArr.length - 1; j >= 0; j -= 1) idxList.push(j);
        }

        for (var p = 0; p < idxList.length; p += 1) {
          var v = Number(kyArr[idxList[p]] || 0);
          if (v > 0) vals.push(v);
          if (vals.length >= maxCot) break;
        }
        while (vals.length < maxCot) vals.push("");
        return vals;
      }

      function mapOne(src) {
        if (!src) return { so: "", kyVals: new Array(maxCot).fill(""), ket_qua: "", to_mau: false };
        var demVal = Number(src.dem || 0);
        var toMau = Number(appliedThongKe.dem_be_hon) > 0 && demVal <= Number(appliedThongKe.dem_be_hon);
        // Vue: ket_qua mặc định là '*', chỉ thay bằng dem khi thỏa mãn dem_be_hon
        return {
          so: src.so,
          kyVals: pickKyVals(src),
          ket_qua: toMau ? String(demVal) : "*",
          to_mau: toMau
        };
      }

      for (var r = 0; r < half; r += 1) {
        var left = mapOne(rows[r] || null);
        var right = mapOne(rows[r + half] || null);
        var rec = {
          id: idPrefix + "_" + r,
          so1: left.so,
          kq1: left.ket_qua,
          to_mau1: left.to_mau,
          so2: right.so,
          kq2: right.ket_qua,
          to_mau2: right.to_mau,
          vach: ""
        };
        for (var c = 0; c < maxCot; c += 1) {
          rec["c_" + (c + 1)] = left.kyVals[c];
          rec["c_" + (maxCot + c + 1)] = right.kyVals[c];
        }
        out.push(rec);
      }
      return out;
    }

    function buildMatrixRows(rows) {
      var source = Array.isArray(rows) ? rows.slice() : [];
      var sorted = source.sort(function (a, b) { return Number(a.so || 0) - Number(b.so || 0); });
      var matrixRows = [];
      var groupCount = 0;
      var soChuList = (appliedThongKe.so_chu || []).map(function (s) {
        return String(s || "").trim();
      }).filter(Boolean);
      var soChuSet = {};
      soChuList.forEach(function (s) {
        soChuSet[s] = true;
      });
      sorted.forEach(function (obj, idx) {
        var group = Math.floor(idx / 20) + 1;
        var rowIdx = idx % 20;
        if (group > groupCount) groupCount = group;
        if (!matrixRows[rowIdx]) matrixRows[rowIdx] = { id: "mx_" + rowIdx };
        var rec = matrixRows[rowIdx];
        rec["so" + group] = obj.so;
        rec["tong" + group] = obj.tong;
        rec["dem" + group] = obj.dem;
        rec["kxh" + group] = obj.kxh;
        var soKey = String(obj && obj.so != null ? obj.so : "").padStart(2, "0");
        var matchSoChu = soChuList.length ? !!soChuSet[soKey] : true;
        if (activeAction === "tk" && Number(appliedThongKe.dem_lon_hon) > 0) {
          var demVal = Number(obj.dem || 0);
          var tongVal = Number(obj.tong || 0);
          var kxhVal = Number(obj.kxh || 0);
          var passNguong = demVal >= Number(appliedThongKe.dem_lon_hon || 0);
          rec["hl" + group] = matchSoChu && passNguong;
        } else if (Number(appliedThongKe.dem_to_nho_hon) > 0) {
          rec["hl" + group] = Number(obj.dem || 0) <= Number(appliedThongKe.dem_to_nho_hon || 0);
        } else {
          rec["hl" + group] = false;
        }
      });
      return { rows: matrixRows, groupCount: groupCount };
    }

    var thongkeGroups = useMemo(function () {
      var grouped = {};
      var comboOrder = [];
      (thongkeRows || []).forEach(function (r) {
        var key = String(r.to_hop || "");
        if (!grouped[key]) {
          grouped[key] = [];
          comboOrder.push(key);
        }
        grouped[key].push(r);
      });

      return comboOrder.map(function (combo) {
        var rows = grouped[combo].slice().sort(function (a, b) {
          return Number(a.so || 0) - Number(b.so || 0);
        });

        var laySoKyRows = [];
        if (Number(appliedThongKe.lay_so_ky) > 0) {
          laySoKyRows = rows.filter(function (r) { return !!r.has_ky_chot; });
        }

        var kxhRows = Number(appliedThongKe.kxh_phai_lonhon) > 0
          ? rows.filter(function (r) { return Number(r.kxh) >= Number(appliedThongKe.kxh_phai_lonhon); })
          : [];

        var demNhoRows = Number(appliedThongKe.dem_nho_hon) > 0
          ? rows.filter(function (r) { return Number(r.k_so_ky || 0) === 0 && Number(r.dem) <= Number(appliedThongKe.dem_nho_hon); })
          : [];

        if (Number(appliedThongKe.dem_nho_hon) > 0 && demNhoRows.length === 0) {
          demNhoRows = [{ so: "0", dem: 0 }];
        }

        var matrix = buildMatrixRows(rows);

        return {
          combo: combo,
          rows: rows,
          laySoKyRows: buildLaySoKyPairRows(laySoKyRows, "lsk_" + combo),
          kxhPairRows: buildPairRows(kxhRows, "kxh", "kxh_" + combo),
          demNhoPairRows: buildPairRows(demNhoRows, "dem", "dnh_" + combo),
          matrixRows: matrix.rows,
          matrixGroupCount: matrix.groupCount
        };
      });
    }, [thongkeRows, appliedThongKe, activeAction]);

    function buildLaySoKyColumns() {
      var maxCot = Math.max(1, Number(appliedThongKe.lay_so_ky || 1));
      var cols = [
        {
          title: "",
          dataIndex: "so1",
          key: "so1",
          width: 40,
          onCell: function (rec) {
            return rec && rec.to_mau1 ? { className: "to_mau_zone" } : {};
          }
        }
      ];
      for (var i = 1; i <= maxCot; i += 1) {
        (function (colIdx) {
        cols.push({
          title: "",
          dataIndex: "c_" + colIdx,
          key: "c_" + colIdx,
          width: 40,
          onCell: function (rec) {
            return rec && rec.to_mau1 ? { className: "to_mau_zone" } : {};
          }
        });
        })(i);
      }
      cols.push({
        title: "",
        dataIndex: "kq1",
        key: "kq1",
        width: 40,
        onCell: function (rec) {
          return rec && rec.to_mau1 ? { className: "to_mau_zone" } : {};
        }
      });
      cols.push({ title: "", dataIndex: "vach", key: "vach", width: 50, className: "kqxs-vach-col" });
      cols.push({
        title: "",
        dataIndex: "so2",
        key: "so2",
        width: 40,
        onCell: function (rec) {
          return rec && rec.to_mau2 ? { className: "to_mau_zone" } : {};
        }
      });
      for (var j = 1; j <= maxCot; j += 1) {
        (function (colIdx) {
        cols.push({
          title: "",
          dataIndex: "c_" + colIdx,
          key: "c_" + colIdx,
          width: 40,
          onCell: function (rec) {
            return rec && rec.to_mau2 ? { className: "to_mau_zone" } : {};
          }
        });
        })(maxCot + j);
      }
      cols.push({
        title: "",
        dataIndex: "kq2",
        key: "kq2",
        width: 40,
        onCell: function (rec) {
          return rec && rec.to_mau2 ? { className: "to_mau_zone" } : {};
        }
      });
      return cols;
    }

    var pairColumns = [
      { title: "", dataIndex: "so1", key: "so1", width: 40, className: "kqxs-side-so-col" },
      { title: "", dataIndex: "vach1", key: "vach1", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "val1", key: "val1", width: 40 },
      { title: "", dataIndex: "vach", key: "vach", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "so2", key: "so2", width: 40, className: "kqxs-side-so-col" },
      { title: "", dataIndex: "vach2", key: "vach2", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "val2", key: "val2", width: 40 }
    ];

    var thongkeComboColumns = [
      { title: tt.colTong, dataIndex: "tong", key: "tong", width: 90 },
      { title: tt.colDem, dataIndex: "dem", key: "dem", width: 90 },
      { title: tt.colKxh, dataIndex: "kxh", key: "kxh", width: 90 },
      { title: tt.colMaxKxh, dataIndex: "lich_su", key: "lich_su", width: 110 },
      { title: tt.colSo, dataIndex: "so", key: "so", width: 80 }
    ].concat(buildKyColumns(appliedThongKe.so_ky, appliedThongKe.sap_xep));

    function buildMatrixColumns(groupCount, middleTitle, rightTitle) {
      function makeSepCol(key) {
        return {
          title: "",
          dataIndex: key,
          key: key,
          width: 20,
          className: "kqxs-vach-col matrix_group_start",
          render: function () { return ""; }
        };
      }

      function makeLeaf(groupIndex, field, title, width, isBold) {
        var dataKey = field + groupIndex;
        var cls = isBold ? "kqxs-side-so-col" : "";
        return {
          title: title,
          dataIndex: dataKey,
          key: dataKey,
          width: width,
          className: cls,
          onCell: function (rec) {
            var c = cls;
            if (rec && rec["hl" + groupIndex]) c = (c ? c + " " : "") + "to_mau_zone";
            return c ? { className: c } : {};
          },
          render: function (v) {
            if (field === "so") return v ? String(v) : "";
            return v;
          }
        };
      }

      function makeGroupChildren(groupIndex, sepKey, showTitles) {
        var out = [];
        if (sepKey) out.push(makeSepCol(sepKey));
        var st = showTitles ? "STT" : "";
        var tg = showTitles ? "Tổng" : "";
        var dm = showTitles ? "SL" : "";
        var kx = showTitles ? "KXH" : "";
        out.push(makeLeaf(groupIndex, "so", st, 55, true));
        out.push(makeLeaf(groupIndex, "tong", tg, 55, false));
        out.push(makeLeaf(groupIndex, "dem", dm, 55, false));
        out.push(makeLeaf(groupIndex, "kxh", kx, 55, false));
        return out;
      }

      var total = Math.max(1, Number(groupCount || 5));
      var cols = [
        makeLeaf(1, "so", "STT", 60, true),
        makeLeaf(1, "tong", "Tổng", 60, false),
        makeLeaf(1, "dem", "SL", 60, false),
        makeLeaf(1, "kxh", "KXH", 60, false)
      ];

      if (total === 1) return cols;

      if (total >= 2) {
        cols.push({ title: "", key: "matrix_block_2", children: makeGroupChildren(2, "vach_a", false) });
      }

      if (total >= 3) {
        var middleChildren = [];
        for (var g = 3; g <= Math.max(3, total - 1); g += 1) {
          if (g >= total) break;
          var sepKey = g === 3 ? "vach_b" : ("vach_m_" + g);
          middleChildren = middleChildren.concat(makeGroupChildren(g, sepKey, false));
        }
        if (middleChildren.length) {
          cols.push({ title: String(middleTitle || ""), key: "matrix_middle_block", children: middleChildren });
        }
      }

      if (total >= 3) {
        cols.push({
          title: String(rightTitle || ""),
          key: "matrix_right_block",
          children: makeGroupChildren(total, "vach_d", false)
        });
      }

      return cols;
    }

    function gridAoaFromColumns(columns, rows) {
      var cols = Array.isArray(columns) ? columns : [];
      var srcRows = Array.isArray(rows) ? rows : [];
      var header = cols.map(function (c) {
        if (!c) return "";
        if (typeof c.title === "string") return c.title;
        return "";
      });
      var aoa = [header];
      srcRows.forEach(function (r) {
        var line = cols.map(function (c) {
          var key = c && c.dataIndex ? c.dataIndex : "";
          return key ? (r && r[key] != null ? r[key] : "") : "";
        });
        aoa.push(line);
      });
      return aoa;
    }

    function normalizeKqTitleLabel(comboLabel) {
      return String(comboLabel || "").replace(/^KQ\s+/i, "").trim();
    }

    function buildLaySoKyTitle(comboLabel) {
      var base = normalizeKqTitleLabel(comboLabel);
      var range = Number(appliedThongKe.sap_xep) === 0
        ? ("1-" + String(appliedThongKe.so_ky) + "-" + String(appliedThongKe.lay_so_ky))
        : (String(appliedThongKe.so_ky) + "-1-" + String(appliedThongKe.lay_so_ky));
      return base + " " + range + " " + String(appliedThongKe.thu_tuan || "") + " " + String(appliedThongKe.den_ngay || "");
    }

    function buildKxhTitle(comboLabel) {
      var base = normalizeKqTitleLabel(comboLabel);
      var range = Number(appliedThongKe.sap_xep) === 0
        ? ("1-" + String(appliedThongKe.so_ky) + "-" + String(appliedThongKe.kxh_phai_lonhon))
        : (String(appliedThongKe.so_ky) + "-1-" + String(appliedThongKe.kxh_phai_lonhon));
      return base + " " + range;
    }

    function buildDemNhoHonTitle(comboLabel) {
      var base = normalizeKqTitleLabel(comboLabel);
      var range = Number(appliedThongKe.sap_xep) === 0
        ? ("1-" + String(appliedThongKe.so_ky) + "-" + String(appliedThongKe.dem_nho_hon))
        : (String(appliedThongKe.so_ky) + "-1-" + String(appliedThongKe.dem_nho_hon));
      return base + " " + range;
    }

    function buildMatrixTitle(comboLabel) {
      var base = normalizeKqTitleLabel(comboLabel);
      var threshold = Number(appliedThongKe.dem_lon_hon || 0);
      if (Number(appliedThongKe.so_ky) > 0) {
        if (Number(appliedThongKe.sap_xep) === 0) {
          var format = base + " 1-" + String(appliedThongKe.so_ky);
          return threshold > 0 ? format + "-" + String(threshold) : format;
        }
        var format1 = base + " " + String(appliedThongKe.so_ky) + "-1";
        return threshold > 0 ? format1 + "-" + String(threshold) : format1;
      }
      return base;
    }

    function buildMainThongKeTitle(comboLabel) {
      if (Number(appliedThongKe.dem_lon_hon) > 0 && (appliedThongKe.so_chu || []).length > 0) {
        return comboLabel + "(" + (appliedThongKe.so_chu || []).join("-") + ")";
      }
      return comboLabel;
    }

    function buildLichSuSoChuTitle(comboLabel) {
      var base = normalizeKqTitleLabel(comboLabel);
      if (Number(appliedThongKe.dem_lon_hon) > 0 && (appliedThongKe.so_chu || []).length > 0) {
        return base + "(" + (appliedThongKe.so_chu || []).join("-") + ")";
      }
      return base;
    }

    function buildThongKeMoiKqTitle(comboLabel) {
      var appliedDate = String(appliedThongKe.den_ngay || den_ngay || "");
      var thuFromDate = days[chuyenNgay(appliedDate, "dd/mm/yyyy").getDay()];
      var daiLabel = normalizeKqTitleLabel(comboLabel);
      return String(thuFromDate || "") + " " + String(appliedDate || "") + " " + String(daiLabel || "");
    }

    function buildComboDisplay(comboKey) {
      var ids = String(comboKey || "").split(",").map(function (x) { return String(x || "").trim(); }).filter(Boolean);
      var dsData = (du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || [];
      var byStt = {};
      dsData.forEach(function (d) {
        byStt[String(d.stt)] = d.ten_dai || (mien + String(d.stt));
      });

      if (ids.length <= 1) {
        var idOne = ids[0] || "";
        if (Number(loai_tim) === 0) {
          var oneCode = mien + idOne;
          return { text: oneCode, ten_dai: oneCode };
        }
        var oneName = byStt[idOne] || (mien + idOne);
        return { text: oneName, ten_dai: oneName };
      }

      var text = mien + " " + ids.join("&");
      var tenDai = mien + " " + ids.map(function (id) { return byStt[id] || id; }).join(" & ");
      return { text: text, ten_dai: tenDai };
    }

    var thongkeMoiKqCols = [
      { title: tt.colTong, dataIndex: "tong", key: "tong", width: 90 },
      { title: tt.colDem, dataIndex: "dem", key: "dem", width: 90 },
      { title: tt.colKxh, dataIndex: "kxh", key: "kxh", width: 90 },
      { title: tt.colMaxKxh, dataIndex: "lich_su", key: "lich_su", width: 110 },
      { title: tt.colSo, dataIndex: "so", key: "so", width: 80 },
      { title: "Kết quả", dataIndex: "bieu_dien", key: "bieu_dien", width: 200 }
    ];

    var thongkeTabs = (function () {
      var items = [];
      var groupMap = {};
      (thongkeGroups || []).forEach(function (g) {
        groupMap[String(g.combo || "")] = g;
      });

      (thongkeTabItems || []).forEach(function (tabDef) {
        var tabId = String(tabDef && tabDef.id || "");
        if (!tabId) return;

        if (tabId === "lich_su_so_chu") {
          if (activeAction !== "tk" || !lichSuSoChuRows.length) return;
          var lichSuTitle = buildLichSuSoChuTitle(String((tabDef && tabDef.ten_dai) || tabDef.text || "Lịch Sử Sổ Chủ"));
          items.push({
            key: "lich_su_so_chu",
            label: String(tabDef.text || "Lịch Sử Số Chủ"),
            children: h(Card, {
              className: "kqxs-thongke-combo",
              size: "small",
              style: { background: theme.cardBg, color: theme.text, borderColor: theme.border }
            }, h("div", { className: "kqxs-thongke-main" }, h(Table, {
              rowKey: "id",
              className: "kqxs-history-table",
              columns: lichSuSoChuColumns,
              dataSource: lichSuSoChuRows,
              pagination: false,
              size: "small",
              scroll: { x: 400 },
              title: function () {
                return renderTableTitleWithExport(lichSuTitle, function (evt) {
                  captureTableFromActionEvent(evt, "kqxs_lich_su_so_chu");
                });
              }
            })))
          });
          return;
        }

        var isKqTab = tabId.indexOf("kq_") === 0;
        var comboId = isKqTab ? tabId.slice(3) : tabId;
        var comboKey = String(comboId || "").replace(/&/g, ",");
        var grp = groupMap[comboKey];
        if (!grp) return;

        var comboDisplay = buildComboDisplay(comboKey);
        var comboTenDai = String((tabDef && tabDef.ten_dai) || comboDisplay.ten_dai || comboDisplay.text || "");
        var mainTitle = buildMainThongKeTitle(comboTenDai);
        var kqTitle = buildThongKeMoiKqTitle(comboTenDai);

        if (!isKqTab) {
          items.push({
            key: tabId,
            label: String(tabDef && tabDef.text || comboDisplay.text || tabId),
            children: h(Card, {
              className: "kqxs-thongke-combo",
              size: "small",
              title: mainTitle,
              style: { background: theme.cardBg, color: theme.text, borderColor: theme.border }
            }, h("div", { className: "kqxs-thongke-main" },
              h(Table, {
                rowKey: "id",
                columns: thongkeComboColumns,
                dataSource: grp.rows,
                size: "small",
                pagination: false,
                scroll: { x: 1200 },
                rowClassName: function (rec) {
                  if (activeAction === "tkm" && rec && rec.thoa_man) return "to_mau";
                  if (activeAction === "tk" && Number(appliedThongKe.dem_lon_hon) > 0 && (appliedThongKe.so_chu || []).length > 0 && (appliedThongKe.so_chu || []).indexOf(String(rec && rec.so || "")) >= 0) return "to_mau";
                  return "";
                }
              })
            ))
          });
          return;
        }

        var kqChildren;
        if (activeAction === "tkm") {
          var kqRows = (grp.rows || []).filter(function (r) { return !!(r && r.thoa_man); });
          kqChildren = h("div", { className: "kqxs-kq-pane" }, h(Table, {
            rowKey: "id",
            columns: thongkeMoiKqCols,
            dataSource: kqRows,
            size: "small",
            pagination: false,
            scroll: { x: 900 },
            title: function () {
              return renderTableTitleWithExport(kqTitle, function (evt) {
                captureTableFromActionEvent(evt, "kqxs_kq_moi_" + String(grp.combo || ""));
              });
            }
          }));
        } else {
          if (Number(appliedThongKe.dem_lon_hon) > 0 && Number(appliedThongKe.sap_xep) === 0) {
            var matrixTitle = buildMatrixTitle(comboTenDai);
            var matrixDateTitle = (String(appliedThongKe.thu_tuan || "") + " " + String(appliedThongKe.den_ngay || "")).trim();
            kqChildren = h("div", { className: "kqxs-kq-pane" }, h(Table, {
              rowKey: "id",
              columns: buildMatrixColumns(grp.matrixGroupCount || 5, matrixTitle, matrixDateTitle),
              dataSource: grp.matrixRows || [],
              size: "small",
              pagination: false,
              bordered: true,
              scroll: { x: 1400 },
              title: function () {
                return renderTableTitleWithExport(matrixTitle, function (evt) {
                  captureTableFromActionEvent(evt, "kqxs_kq_matrix_" + String(grp.combo || ""));
                });
              }
            }));
          } else {
            kqChildren = h("div", { className: "kqxs-kq-row" }, [
                  Number(appliedThongKe.lay_so_ky) > 0 && grp.laySoKyRows.length
                    ? h("div", { key: "lsk_" + grp.combo, className: "kqxs-kq-col kqxs-kq-col-main kqxs-kq-zone" }, h(Table, {
                        rowKey: "id",
                        columns: buildLaySoKyColumns(),
                        dataSource: grp.laySoKyRows,
                        size: "small",
                        pagination: false,
                        bordered: true,
                        scroll: { x: "max-content" },
                        title: function () {
                          var titleText = buildLaySoKyTitle(comboTenDai);
                          return renderTableTitleWithExport(titleText, function (evt) {
                            captureTableFromActionEvent(evt, "kqxs_lay_so_ky_" + String(grp.combo || ""));
                          });
                        }
                      }))
                    : null,
                  Number(appliedThongKe.kxh_phai_lonhon) > 0
                    ? h("div", { key: "kxh_" + grp.combo, className: "kqxs-kq-col kqxs-kq-col-side kqxs-kq-zone" }, h(Table, {
                        rowKey: "id",
                        columns: pairColumns,
                        dataSource: grp.kxhPairRows,
                        size: "small",
                        pagination: false,
                        bordered: true,
                        scroll: { x: "max-content" },
                        title: function () {
                          var titleText = buildKxhTitle(comboTenDai);
                          return renderTableTitleWithExport(titleText, function (evt) {
                            captureTableFromActionEvent(evt, "kqxs_kq_kxh_" + String(grp.combo || ""));
                          });
                        }
                      }))
                    : null,
                  Number(appliedThongKe.dem_nho_hon) > 0
                    ? h("div", { key: "dnh_" + grp.combo, className: "kqxs-kq-col kqxs-kq-col-side kqxs-kq-zone" }, h(Table, {
                        rowKey: "id",
                        columns: pairColumns,
                        dataSource: grp.demNhoPairRows,
                        size: "small",
                        pagination: false,
                        bordered: true,
                        scroll: { x: "max-content" },
                        title: function () {
                          var titleText = buildDemNhoHonTitle(comboTenDai);
                          return renderTableTitleWithExport(titleText, function (evt) {
                            captureTableFromActionEvent(evt, "kqxs_kq_dem_" + String(grp.combo || ""));
                          });
                        }
                      }))
                    : null
                ]);
          }
        }

        items.push({
          key: tabId,
          label: String(tabDef && tabDef.text || ("KQ " + comboDisplay.text)),
          children: kqChildren
        });
      });

      return items;
    })();

    var firstTabKey = thongkeTabs.length ? thongkeTabs[0].key : "";
    var activeTabKey = (subTab && thongkeTabs.some(function (it) { return it.key === subTab; })) ? subTab : firstTabKey;

    function getKyHeaders() {
      var out = [];
      var totalKy = Math.max(1, Number(appliedThongKe.so_ky || 1));
      if (Number(appliedThongKe.sap_xep) === 0) {
        for (var i = 1; i <= totalKy; i += 1) out.push(String(i));
      } else {
        for (var j = totalKy; j >= 1; j -= 1) out.push(String(j));
      }
      return out;
    }

    function getPrizeRowsForCard(dai) {
      function getV(f) { return String((dai && dai.data && dai.data[f]) || "-"); }
      var mienMb = mien === "MB";
      var rows = [
        { label: "Giải ĐB", vals: [getV("field_duoi")] },
        { label: "Giải nhất", vals: [mienMb ? getV("field_so26") : getV("field_so17")] },
        { label: "Giải nhì", vals: mienMb ? [getV("field_so24"), getV("field_so25")] : [getV("field_so16")] },
        { label: "Giải ba", vals: mienMb ? [getV("field_so18"), getV("field_so19"), getV("field_so20"), getV("field_so21"), getV("field_so22"), getV("field_so23")] : [getV("field_so15"), getV("field_so14")] },
        { label: "Giải tư", vals: mienMb ? [getV("field_so14"), getV("field_so15"), getV("field_so16"), getV("field_so17")] : [getV("field_so13"), getV("field_so12"), getV("field_so11"), getV("field_so10"), getV("field_so9"), getV("field_so8"), getV("field_so7")] },
        { label: "Giải năm", vals: mienMb ? [getV("field_so8"), getV("field_so9"), getV("field_so10"), getV("field_so11"), getV("field_so12"), getV("field_so13")] : [getV("field_so6")] },
        { label: "Giải sáu", vals: mienMb ? [getV("field_so5"), getV("field_so6"), getV("field_so7")] : [getV("field_so5"), getV("field_so4"), getV("field_so3")] },
        { label: "Giải bảy", vals: mienMb ? [getV("field_dau"), getV("field_so2"), getV("field_so3"), getV("field_so4")] : [getV("field_so2")] }
      ];
      if (!mienMb) rows.push({ label: "Giải 8", vals: [getV("field_dau")] });
      return rows;
    }

    function flattenLaySoKyExportRows(pairRows) {
      var out = [];
      var maxCot = Math.max(1, Number(lay_so_ky || 1));
      (pairRows || []).forEach(function (r) {
        if (r && r.so1) {
          var left = { so: r.so1, ket_qua: r.kq1, to_mau: r.to_mau1 ? 1 : 0 };
          for (var i = 1; i <= maxCot; i += 1) left["c_" + i] = r["c_" + i];
          out.push(left);
        }
        if (r && r.so2) {
          var right = { so: r.so2, ket_qua: r.kq2, to_mau: r.to_mau2 ? 1 : 0 };
          for (var j = 1; j <= maxCot; j += 1) right["c_" + j] = r["c_" + (maxCot + j)];
          out.push(right);
        }
      });
      return out;
    }

    function flattenPairExportRows(pairRows, valueField) {
      var out = [];
      (pairRows || []).forEach(function (r) {
        if (r && r.so1) out.push({ so: r.so1, value: r[valueField + "1"] });
        if (r && r.so2) out.push({ so: r.so2, value: r[valueField + "2"] });
      });
      return out;
    }

    function buildExportPayload() {
      var ymd = dateFormat(new Date(), "yyyymmdd");
      var payload = { fileName: "kqxs_" + ymd, sheets: [] };

      if (activeAction === "kq") {
        var aoaPrize = [["Đài", "Ngày", "Giải", "Kết quả"]];
        (ds_dai_chon_xem_ket_qua || []).forEach(function (dai) {
          var rows = getPrizeRowsForCard(dai);
          rows.forEach(function (r) {
            aoaPrize.push([dai.ten_dai || "", dai.ngay || "", r.label, (r.vals || []).join(" | ")]);
          });
        });
        if (aoaPrize.length > 1) {
          payload.sheets.push({ name: "Ket qua", aoa: aoaPrize });
        }

        if ((xu_ly_ket_qua || []).length) {
          var headers = [tt.colChuc].concat((ds_dai_chon_xem_ket_qua || []).map(function (d) { return d.ten_dai; }));
          var aoaKq = [headers];
          (xu_ly_ket_qua || []).forEach(function (r) {
            var line = [r.chuc];
            (ds_dai_chon_xem_ket_qua || []).forEach(function (d) {
              line.push(r["dai_" + d.stt] || "");
            });
            aoaKq.push(line);
          });
          payload.sheets.push({ name: "Theo chuc", aoa: aoaKq });
        }

        payload.fileName = "kqxs_ket_qua_" + ymd;
        return payload;
      }

      if (!activeTabKey) return payload;

      if (activeTabKey === "lich_su_so_chu") {
        var aoaLichSu = [["STT", "Ngày", "Số kỳ"]];
        (lichSuSoChuRows || []).forEach(function (r) {
          aoaLichSu.push([r.stt, r.ngay, r.so_ky]);
        });
        if (aoaLichSu.length > 1) payload.sheets.push({ name: "Lich su so chu", aoa: aoaLichSu });
        payload.fileName = "kqxs_lich_su_so_chu_" + ymd;
        return payload;
      }

      var combo = "";
      var isKqExportTab = activeTabKey.indexOf("kq_") === 0;
      combo = isKqExportTab ? activeTabKey.slice(3) : activeTabKey;
      var comboKey = String(combo || "").replace(/&/g, ",");
      var grp = thongkeGroups.find(function (g) { return String(g.combo || "") === comboKey; });
      if (!grp) return payload;

      if (!isKqExportTab) {
        var kyHeaders = getKyHeaders();
        var aoaMain = [[tt.colTong, tt.colDem, tt.colKxh, tt.colMaxKxh, tt.colSo].concat(kyHeaders)];
        (grp.rows || []).forEach(function (r) {
          var line = [r.tong, r.dem, r.kxh, r.lich_su, r.so];
          kyHeaders.forEach(function (kyLabel) {
            var idx = Number(kyLabel) - 1;
            line.push(Number((r.ky && r.ky[idx]) || 0));
          });
          aoaMain.push(line);
        });
        payload.sheets.push({ name: "Thong ke", aoa: aoaMain });
        payload.fileName = "kqxs_thong_ke_" + combo.replace(/,/g, "-") + "_" + ymd;
        return payload;
      }

      if (isKqExportTab) {
        if (activeAction === "tkm") {
          var aoaTkm = [[tt.colTong, tt.colDem, tt.colKxh, tt.colMaxKxh, tt.colSo, "Kết quả"]];
          (grp.rows || []).filter(function (r) { return !!(r && r.thoa_man); }).forEach(function (r) {
            aoaTkm.push([r.tong, r.dem, r.kxh, r.lich_su, r.so, r.bieu_dien || ""]);
          });
          if (aoaTkm.length > 1) payload.sheets.push({ name: "KQ moi", aoa: aoaTkm });
        } else {
          if (Number(lay_so_ky) > 0 && (grp.laySoKyRows || []).length) {
            var layCols = buildLaySoKyColumns();
            var aoaLaySoKy = gridAoaFromColumns(layCols, grp.laySoKyRows || []);
            if (aoaLaySoKy.length > 1) payload.sheets.push({ name: "Lay so ky", aoa: aoaLaySoKy });
          }

          if (Number(kxh_phai_lonhon) > 0) {
            var aoaKxh = gridAoaFromColumns(pairColumns, grp.kxhPairRows || []);
            payload.sheets.push({ name: "KQ KXH", aoa: aoaKxh });
          }

          if (Number(dem_nho_hon) > 0) {
            var aoaDem = gridAoaFromColumns(pairColumns, grp.demNhoPairRows || []);
            payload.sheets.push({ name: "KQ dem", aoa: aoaDem });
          }
        }

        payload.fileName = "kqxs_kq_" + combo.replace(/,/g, "-") + "_" + ymd;
      }

      return payload;
    }

    async function exportPayloadToFile(payload) {
      if (!payload || !payload.sheets || payload.sheets.length === 0) {
        canhbao(tt.exportNoData);
        return;
      }

      var baseName = payload.fileName || ("kqxs_" + dateFormat(new Date(), "yyyymmdd"));
      var XLSX = window.XLSX;

      if (!isUsableXlsx(XLSX)) {
        try {
          XLSX = await ensureXlsxLibrary();
        } catch (err) {
          XLSX = null;
        }
      }

      if (isUsableXlsx(XLSX)) {
        var wb = { SheetNames: [], Sheets: {} };
        payload.sheets.forEach(function (sheet, idx) {
          var sheetName = sanitizeSheetName(sheet && sheet.name ? sheet.name : ("Sheet" + (idx + 1)));
          var ws = makeWorksheetFromAoa((sheet && sheet.aoa) || [[""]], XLSX);
          wb.SheetNames.push(sheetName);
          wb.Sheets[sheetName] = ws;
        });
        try {
          XLSX.writeFile(wb, baseName + ".xlsx");
          thongbao(tt.exportDone);
          return;
        } catch (e) {
          // Try one forced reload cycle for environments where XLSX bound JSZip too early.
          try {
            XLSX = await ensureXlsxLibrary();
            XLSX.writeFile(wb, baseName + ".xlsx");
            thongbao(tt.exportDone);
            return;
          } catch (e2) {
            // Fall through to CSV fallback
          }
        }
      }

      try {
        downloadExcelXmlFromSheets(baseName + ".xls", payload.sheets);
        canhbao(tt.exportFallbackXls || tt.exportFallbackCsv);
        return;
      } catch (xlsErr) {
        downloadCsvFromAoa(baseName + ".csv", payload.sheets[0].aoa || [[""]]);
        canhbao(tt.exportFallbackCsv);
      }
    }

    function buildSubtableExportPayload(combo, sheetName, columns, rows) {
      var ymd = dateFormat(new Date(), "yyyymmdd");
      var comboToken = String(combo || "").replace(/,/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
      var aoa = gridAoaFromColumns(columns || [], rows || []);
      return {
        fileName: "kqxs_" + sanitizeSheetName(String(sheetName || "sheet")).replace(/\s+/g, "_") + "_" + comboToken + "_" + ymd,
        sheets: [{ name: String(sheetName || "Sheet"), aoa: aoa }]
      };
    }

    async function captureNodeToPng(wrapper, fileNameBase, hideSelector, options) {
      if (!wrapper) {
        canhbao(tt.captureNoDom || "Table not found");
        return;
      }
      var captureOptions = options || {};
      var metrics = getCaptureMetrics(wrapper, !!captureOptions.fullContent);
      var bgColor = getCaptureBackground(wrapper);
      var userScale = Number(window.csmKqxsCaptureScale || 0);
      var defaultScale = ((window.innerWidth || 0) <= 768) ? 3 : 4;
      var pxRatio = userScale > 0
        ? Math.max(2, Math.min(6, userScale))
        : Math.max(2, Math.min(6, defaultScale));

      var selectors = Array.isArray(hideSelector) ? hideSelector : [hideSelector || ".kqxs-table-actions"];
      var actions = [];
      selectors.forEach(function (sel) {
        if (!sel) return;
        var list = wrapper.querySelectorAll(sel);
        for (var i = 0; i < list.length; i += 1) actions.push(list[i]);
      });
      var oldDisplay = [];
      for (var j = 0; j < actions.length; j += 1) {
        oldDisplay.push(actions[j].style.display || "");
        actions[j].style.display = "none";
      }

      var restoreStyles = snapshotComputedStyles(wrapper);

      var oldWrapperStyle = {
        width: wrapper.style.width || "",
        height: wrapper.style.height || "",
        maxWidth: wrapper.style.maxWidth || "",
        maxHeight: wrapper.style.maxHeight || "",
        overflow: wrapper.style.overflow || ""
      };

      if (captureOptions.fullContent) {
        // Optional full-content mode if caller needs full scroll area.
        wrapper.style.width = metrics.width + "px";
        wrapper.style.height = metrics.height + "px";
        wrapper.style.maxWidth = "none";
        wrapper.style.maxHeight = "none";
        wrapper.style.overflow = "visible";
      }

      try {
        await waitForCaptureFonts(2000);
        var selectedEngine = String(window.csmKqxsCaptureEngine || "auto").toLowerCase();

        if (selectedEngine === "auto" || selectedEngine === "html-to-image" || selectedEngine === "htmltoimage") {
          try {
            var htmlToImage = await ensureHtmlToImageLibrary();
            var dataUrlHtml = await htmlToImage.toPng(wrapper, {
              cacheBust: true,
              backgroundColor: bgColor,
              width: metrics.width,
              height: metrics.height,
              canvasWidth: Math.round(metrics.width * pxRatio),
              canvasHeight: Math.round(metrics.height * pxRatio),
              pixelRatio: pxRatio,
              filter: function (node) {
                return !shouldIgnoreCaptureNode(node);
              },
              style: {
                transform: "none",
                transformOrigin: "top left"
              }
            });
            var ymdhmsHtml = dateFormat(new Date(), "yyyymmdd") + "_" + dateFormat(new Date(), "hhMMss");
            var fileNameHtml = String(fileNameBase || "kqxs_table") + "_" + ymdhmsHtml + ".png";
            downloadDataUrl(fileNameHtml, dataUrlHtml);
            thongbao(tt.captureDone || "Captured");
            return;
          } catch (htmlErr) {
            if (selectedEngine === "html-to-image" || selectedEngine === "htmltoimage") throw htmlErr;
          }
        }

        if (selectedEngine === "auto" || selectedEngine === "dom-to-image" || selectedEngine === "domtoimage") {
          try {
            var domtoimage = await ensureDomToImageLibrary();
            var dataUrl = await domtoimage.toPng(wrapper, {
              bgcolor: bgColor,
              cacheBust: true,
              quality: 1,
              width: metrics.width,
              height: metrics.height,
              pixelRatio: pxRatio,
              filter: function (node) {
                return !shouldIgnoreCaptureNode(node);
              },
              style: {
                transform: "none",
                transformOrigin: "top left"
              }
            });
            var ymdhmsDom = dateFormat(new Date(), "yyyymmdd") + "_" + dateFormat(new Date(), "hhMMss");
            var fileNameDom = String(fileNameBase || "kqxs_table") + "_" + ymdhmsDom + ".png";
            downloadDataUrl(fileNameDom, dataUrl);
            thongbao(tt.captureDone || "Captured");
            return;
          } catch (domErr) {
            if (selectedEngine === "dom-to-image" || selectedEngine === "domtoimage") throw domErr;
          }
        }

        var html2canvas = await ensureCaptureLibrary();
        var canvas = await html2canvas(wrapper, {
          backgroundColor: bgColor,
          scale: pxRatio,
          width: metrics.width,
          height: metrics.height,
          windowWidth: Math.max(metrics.width, window.innerWidth || 0),
          windowHeight: Math.max(metrics.height, window.innerHeight || 0),
          useCORS: true,
          logging: false,
          foreignObjectRendering: true,
          scrollX: 0,
          scrollY: 0
        });
        var ymdhms = dateFormat(new Date(), "yyyymmdd") + "_" + dateFormat(new Date(), "hhMMss");
        var fileName = String(fileNameBase || "kqxs_table") + "_" + ymdhms + ".png";
        downloadDataUrl(fileName, canvas.toDataURL("image/png"));
        thongbao(tt.captureDone || "Captured");
      } catch (err) {
        canhbao((tt.captureNoLib || "Capture failed") + ": " + String((err && err.message) || err || ""));
      } finally {
        restoreStyles();
        wrapper.style.width = oldWrapperStyle.width;
        wrapper.style.height = oldWrapperStyle.height;
        wrapper.style.maxWidth = oldWrapperStyle.maxWidth;
        wrapper.style.maxHeight = oldWrapperStyle.maxHeight;
        wrapper.style.overflow = oldWrapperStyle.overflow;
        for (var k = 0; k < actions.length; k += 1) {
          actions[k].style.display = oldDisplay[k] || "";
        }
      }
    }

    async function captureTableFromActionEvent(evt, fileNameBase) {
      var trigger = evt && evt.currentTarget;
      var wrapper = trigger && trigger.closest ? trigger.closest(".ant-table-wrapper") : null;
      await captureNodeToPng(wrapper, fileNameBase, ".kqxs-table-actions", { fullContent: false });
    }

    async function captureActiveTabContent() {
      var root = document.querySelector(".kqxs-react-auto .kqxs-tab-capture-root");
      var base = "kqxs_tab_" + String(activeAction || "") + "_" + String(activeTabKey || "").replace(/[^a-zA-Z0-9_-]/g, "-");
      await captureNodeToPng(root, base, [".kqxs-top-actions", ".kqxs-table-actions"], { fullContent: false });
    }

    function renderCaptureIcon() {
      return h("svg", {
        viewBox: "0 0 24 24",
        width: 14,
        height: 14,
        "aria-hidden": "true",
        focusable: "false",
        style: { display: "block" }
      }, [
        h("path", {
          key: "p1",
          d: "M9 4h6l1.2 2H19a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h2.8L9 4zm3 4.5A4.5 4.5 0 1 0 12 17.5 4.5 4.5 0 0 0 12 8.5zm0 2A2.5 2.5 0 1 1 9.5 13 2.5 2.5 0 0 1 12 10.5z",
          fill: "currentColor"
        })
      ]);
    }

    function renderTableTitleWithExport(titleText, onCaptureClick) {
      return h("div", { className: "kqxs-table-title-wrap", style: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 24, whiteSpace: "nowrap" } }, [
        h("b", { key: "txt", className: "kqxs-table-title-text", style: { display: "inline-block", whiteSpace: "nowrap", overflow: "visible", textOverflow: "clip", textAlign: "center" } }, String(titleText || "")),
        h("div", { key: "actions", className: "kqxs-table-actions kqxs-capture-ignore", "data-capture-ignore": "true", style: { display: "inline-flex", justifyContent: "center" } }, [
          h(Button, {
            key: "btn_capture",
            size: "small",
            className: "kqxs-action-btn kqxs-capture-ignore",
            "data-capture-ignore": "true",
            title: tt.btnCaptureTable || "Capture table",
            "aria-label": tt.btnCaptureTable || "Capture table",
            icon: renderCaptureIcon(),
            onClick: function (e) {
              if (e && typeof e.stopPropagation === "function") e.stopPropagation();
              if (typeof onCaptureClick === "function") onCaptureClick(e);
            }
          })
        ])
      ]);
    }

    async function xuatExcel() {
      await captureActiveTabContent();
    }

    function themedSelectProps(extra) {
      var base = {
        style: { width: "100%" },
        popupClassName: "kqxs-react-auto-popup",
        dropdownClassName: "kqxs-react-auto-popup",
        getPopupContainer: function (triggerNode) {
          return (triggerNode && triggerNode.parentNode) ? triggerNode.parentNode : document.body;
        }
      };
      return Object.assign({}, base, extra || {}, {
        style: Object.assign({}, base.style, extra && extra.style ? extra.style : {})
      });
    }

    function themedNumberProps(extra) {
      var base = {
        style: { width: "100%" },
        controls: false,
        parser: function (v) {
          return String(v == null ? "" : v).replace(/[^\d-]/g, "");
        },
        onKeyDown: function (e) {
          var key = e && e.key ? e.key : "";
          var allow = /[0-9]|Backspace|Delete|Tab|ArrowLeft|ArrowRight|Home|End|Enter|-/.test(key);
          if (!allow) e.preventDefault();
        },
        inputMode: "numeric"
      };
      return Object.assign({}, base, extra || {}, {
        style: Object.assign({}, base.style, extra && extra.style ? extra.style : {})
      });
    }

    function renderDateField(value, onChangeCb, opt) {
      var cfg = opt || {};
      var minDate = cfg.minDate ? toDayjsDate(cfg.minDate) : null;
      var maxDate = cfg.maxDate ? toDayjsDate(cfg.maxDate) : null;
      if (DatePicker && typeof dayjsRef === "function") {
        return h(DatePicker, {
          value: toDayjsDate(value),
          format: "DD/MM/YYYY",
          inputReadOnly: true,
          style: { width: "100%" },
          popupClassName: "kqxs-react-auto-date-popup",
          getPopupContainer: function (triggerNode) {
            return (triggerNode && triggerNode.parentNode) ? triggerNode.parentNode : document.body;
          },
          disabledDate: function (current) {
            if (!current) return false;
            if (minDate && current.isBefore(minDate, "day")) return true;
            if (maxDate && current.isAfter(maxDate, "day")) return true;
            return false;
          },
          onChange: function (_date, dateStr) {
            var next = String(dateStr || "").trim();
            if (!next) return;
            onChangeCb(next);
          }
        });
      }
      return h(Input, {
        type: "date",
        readOnly: true,
        value: ddmmyyyyToIso(value),
        min: cfg.minDate ? ddmmyyyyToIso(cfg.minDate) : undefined,
        max: cfg.maxDate ? ddmmyyyyToIso(cfg.maxDate) : undefined,
        onKeyDown: function (e) { e.preventDefault(); },
        onChange: function (e) {
          var next = isoToDdmmyyyy(e && e.target ? e.target.value : "");
          if (!next) return;
          onChangeCb(next);
        }
      });
    }

    var runtimeCss = ""
      + ".kqxs-react-auto { background: var(--kqxs-page-bg, #f5f7fb) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-card, .kqxs-react-auto .ant-card-head, .kqxs-react-auto .ant-card-body { background: var(--kqxs-card-bg, #fff) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-card-head { border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-card-head-title, .kqxs-react-auto .ant-typography, .kqxs-react-auto .ant-tabs-tab-btn, .kqxs-react-auto .ant-table, .kqxs-react-auto .ant-table-cell { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-tabs, .kqxs-react-auto .ant-tabs-nav, .kqxs-react-auto .ant-tabs-nav-wrap, .kqxs-react-auto .ant-tabs-content-holder, .kqxs-react-auto .ant-tabs-content, .kqxs-react-auto .ant-tabs-tabpane { background: transparent !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-tabs-nav::before { border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-tabs-tab { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto .ant-tabs-ink-bar { background: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn { color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tabs-tab:hover .ant-tabs-tab-btn { color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tabs-content-holder, .kqxs-react-auto .ant-tabs-tabpane { border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-tabs-nav-more, .kqxs-react-auto .ant-tabs-nav-more .anticon { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto .ant-tabs-nav-more:hover, .kqxs-react-auto .ant-tabs-nav-more:focus { color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-nav { margin-bottom: 8px !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab { margin-right: 6px !important; padding: 0 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab .ant-tabs-tab-btn { font-size: 10pt !important; font-weight: 700 !important; line-height: 1.2 !important; padding: 6px 10px !important; border: 1px solid transparent !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn { color: var(--kqxs-header-active-text, var(--kqxs-text, #1f1f1f)) !important; background: var(--kqxs-header-active-bg, color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, var(--kqxs-card-bg, #fff))) !important; border-color: var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; border-radius: 2px !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-ink-bar { display: none !important; }"
      + ".kqxs-react-auto .ant-input, .kqxs-react-auto .ant-input-number, .kqxs-react-auto .ant-input-number-input, .kqxs-react-auto .ant-select-selector, .kqxs-react-auto input, .kqxs-react-auto select, .kqxs-react-auto textarea { background: var(--kqxs-input-bg, #fff) !important; color: var(--kqxs-input-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-input, .kqxs-react-auto .ant-input-number, .kqxs-react-auto .ant-picker, .kqxs-react-auto .ant-select-single .ant-select-selector { min-height: 32px !important; height: 32px !important; border-radius: 6px !important; }"
      + ".kqxs-react-auto .ant-select-single .ant-select-selector .ant-select-selection-item, .kqxs-react-auto .ant-select-single .ant-select-selector .ant-select-selection-placeholder { line-height: 30px !important; }"
      + ".kqxs-react-auto .ant-input-number { overflow: hidden !important; }"
      + ".kqxs-react-auto .ant-input-number .ant-input-number-handler-wrap { display: none !important; }"
      + ".kqxs-react-auto .ant-input-number-input-wrap { padding-left: 10px !important; padding-right: 10px !important; }"
      + ".kqxs-react-auto .ant-input-number-input { height: 30px !important; line-height: 30px !important; padding: 0 !important; }"
      + ".kqxs-react-auto .ant-picker { width: 100% !important; background: var(--kqxs-input-bg, #fff) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-picker-input > input, .kqxs-react-auto .ant-picker .ant-picker-suffix, .kqxs-react-auto .ant-picker .ant-picker-clear { color: var(--kqxs-input-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-picker:hover, .kqxs-react-auto .ant-picker-focused { border-color: var(--kqxs-primary, #1677ff) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--kqxs-primary, #1677ff) 25%, transparent) !important; }"
      + ".kqxs-react-auto .ant-picker-disabled { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 80%, var(--kqxs-page-bg, #f5f7fb)) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-input-number-input-wrap { background: var(--kqxs-input-bg, #fff) !important; }"
      + ".kqxs-react-auto .ant-input-number-handler-wrap, .kqxs-react-auto .ant-input-number-handler { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 90%, var(--kqxs-page-bg, #f5f7fb)) !important; border-color: var(--kqxs-border, #d9d9d9) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-input-number-handler-up-inner, .kqxs-react-auto .ant-input-number-handler-down-inner { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-input:hover, .kqxs-react-auto .ant-input-number:hover, .kqxs-react-auto .ant-select:not(.ant-select-disabled):hover .ant-select-selector { border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-input:focus, .kqxs-react-auto .ant-input-focused, .kqxs-react-auto .ant-input-number-focused, .kqxs-react-auto .ant-select-focused .ant-select-selector { border-color: var(--kqxs-primary, #1677ff) !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--kqxs-primary, #1677ff) 25%, transparent) !important; }"
      + ".kqxs-react-auto input[type='date'] { color-scheme: var(--kqxs-color-scheme, light); }"
      + ".kqxs-react-auto input[type='date']::-webkit-calendar-picker-indicator { filter: var(--kqxs-date-icon-filter, none); cursor: pointer; }"
      + ".kqxs-react-auto .ant-select-selection-placeholder, .kqxs-react-auto .ant-input::placeholder { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto .ant-select-arrow, .kqxs-react-auto .ant-select-clear { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto .ant-select-multiple .ant-select-selection-item { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 18%, transparent) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: color-mix(in srgb, var(--kqxs-primary, #1677ff) 35%, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .ant-input[disabled], .kqxs-react-auto .ant-input-number-disabled, .kqxs-react-auto .ant-select-disabled .ant-select-selector { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 80%, var(--kqxs-page-bg, #f5f7fb)) !important; color: var(--kqxs-muted, #666) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn { background: var(--kqxs-btn-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-btn-border, var(--kqxs-border, #d9d9d9)) !important; font-weight: 600 !important; }"
      + ".kqxs-react-auto .kqxs-action-btn:hover, .kqxs-react-auto .kqxs-action-btn:focus { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 12%, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn.ant-btn-primary { background: var(--kqxs-btn-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-btn-border, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn.ant-btn-primary:hover, .kqxs-react-auto .kqxs-action-btn.ant-btn-primary:focus { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 12%, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn-active { background: var(--kqxs-btn-active-bg, color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, var(--kqxs-card-bg, #fff))) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn-active:hover, .kqxs-react-auto .kqxs-action-btn-active:focus { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 22%, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-btn-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-action-btn.ant-btn-loading { opacity: 0.9; }"
      + ".kqxs-react-auto .ant-btn[disabled], .kqxs-react-auto .ant-btn[disabled]:hover { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 80%, var(--kqxs-page-bg, #f5f7fb)) !important; color: var(--kqxs-muted, #666) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-table-thead > tr > th { background: var(--kqxs-input-bg, #fff) !important; color: var(--kqxs-text, #1f1f1f) !important; border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-table-tbody > tr > td { background: var(--kqxs-card-bg, #fff) !important; color: var(--kqxs-text, #1f1f1f) !important; border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-table-tbody > tr:hover > td { background: color-mix(in srgb, var(--kqxs-card-bg, #fff) 88%, var(--kqxs-primary, #1677ff)) !important; }"
      + ".kqxs-react-auto .ant-pagination-item, .kqxs-react-auto .ant-pagination-prev .ant-pagination-item-link, .kqxs-react-auto .ant-pagination-next .ant-pagination-item-link { background: var(--kqxs-input-bg, #fff) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-pagination-item a, .kqxs-react-auto .ant-pagination-prev .ant-pagination-item-link, .kqxs-react-auto .ant-pagination-next .ant-pagination-item-link { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-pagination-item-active { border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-pagination-item-active a { color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-switch { background: color-mix(in srgb, var(--kqxs-muted, #666) 35%, transparent) !important; }"
      + ".kqxs-react-auto .ant-switch.ant-switch-checked { background: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tag { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 14%, transparent) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: color-mix(in srgb, var(--kqxs-primary, #1677ff) 35%, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .ant-progress-text, .kqxs-react-auto .ant-progress-outer { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-empty-description { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto-popup.ant-select-dropdown { background: var(--kqxs-card-bg, #fff) !important; border: 1px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled) { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 10%, transparent) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, transparent) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-panel-container { background: var(--kqxs-card-bg, #fff) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-content th, .kqxs-react-auto-date-popup .ant-picker-content td, .kqxs-react-auto-date-popup .ant-picker-header, .kqxs-react-auto-date-popup .ant-picker-cell-inner, .kqxs-react-auto-date-popup .ant-picker-header button { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner { background: var(--kqxs-primary, #1677ff) !important; color: #fff !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner::before { border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-combo { border: 1px solid var(--kqxs-border, #d9d9d9) !important; box-shadow: none !important; }"
      + ".kqxs-react-auto .kqxs-thongke-combo > .ant-card-head { background: color-mix(in srgb, var(--kqxs-card-bg, #fff) 92%, var(--kqxs-page-bg, #f5f7fb)) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main { padding: 4px 0 2px 0; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-thead > tr > th { font-weight: 700 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-subcard { margin-top: 12px; border-left: 4px solid color-mix(in srgb, var(--kqxs-primary, #1677ff) 52%, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-subcard > .ant-card-head { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 5%, var(--kqxs-card-bg, #fff)) !important; }"
      + ".kqxs-react-auto .kqxs-vach-col { background: var(--kqxs-vach-bg, color-mix(in srgb, var(--kqxs-warning, #faad14) 60%, var(--kqxs-card-bg, #fff))) !important; padding: 0 !important; }"
      + ".kqxs-react-auto .kqxs-kq-pane { padding-top: 2px; }"
      + ".kqxs-react-auto .kqxs-kq-row { display: flex; flex-wrap: nowrap; gap: 12px; align-items: flex-start; overflow-x: auto; padding-bottom: 2px; }"
      + ".kqxs-react-auto .kqxs-kq-col { flex: 0 0 auto; min-width: max-content; }"
      + ".kqxs-react-auto .kqxs-kq-col-main { flex: 0 0 auto; min-width: 602px; }"
      + ".kqxs-react-auto .kqxs-kq-col-side { flex: 0 0 auto; min-width: 230px; width: max-content; }"
      + ".kqxs-react-auto .kqxs-kq-zone { border: 1px solid var(--kqxs-border, #d9d9d9); border-radius: 0; padding: 0; background: color-mix(in srgb, var(--kqxs-card-bg, #fff) 95%, var(--kqxs-page-bg, #f5f7fb)); }"
      + ".kqxs-react-auto .kqxs-kq-zone + .kqxs-kq-zone { box-shadow: none; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table { border: 1px solid var(--kqxs-border, #d9d9d9) !important; background: transparent !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-container { border-inline-start: 0 !important; border-top: 0 !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-thead > tr > th { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 92%, var(--kqxs-primary, #1677ff)) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; font-size: 10pt !important; font-weight: 700 !important; padding: 2px 4px !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-tbody > tr > td { background: color-mix(in srgb, var(--kqxs-card-bg, #fff) 96%, var(--kqxs-page-bg, #f5f7fb)) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-cell { text-align: center !important; padding: 2px 4px !important; font-family: 'Times New Roman', Times, serif !important; font-size: 16px !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-cell.kqxs-side-so-col { font-weight: 700 !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-title { text-align: center !important; font-size: 12pt !important; text-transform: none !important; color: var(--kqxs-text, #1f1f1f) !important; background: transparent !important; padding: 4px 8px !important; }"
      + ".kqxs-react-auto .ant-table-tbody > tr > td.to_mau_zone { background: " + (chon_mau || "#cc9108") + " !important; }"
      + ".kqxs-react-auto .ant-table-thead > tr > th.matrix_group_start, .kqxs-react-auto .ant-table-tbody > tr > td.matrix_group_start { border-left: 3px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-result-row { align-items: stretch; }"
      + ".kqxs-react-auto .kqxs-result-row > .ant-col { display: flex; }"
      + ".kqxs-react-auto .kqxs-result-col .ant-card { height: 100%; }"
      + ".kqxs-react-auto .kqxs-result-card { border: 1px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-result-card .ant-card-head { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 5%, var(--kqxs-card-bg, #fff)) !important; border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-result-card .ant-card-body { padding: 8px 0 !important; }"
      + ".kqxs-react-auto .kqxs-result-card .ant-card-head-title { font-weight: 700; text-align: center; font-size: 28px; }"
      + ".kqxs-react-auto .kqxs-kqline { display: grid; grid-template-columns: 105px 1fr; align-items: center; min-height: 46px; padding: 0 12px; }"
      + ".kqxs-react-auto .kqxs-kqline:nth-child(even) { background: color-mix(in srgb, var(--kqxs-input-bg, #fff) 60%, var(--kqxs-page-bg, #f5f7fb)); }"
      + ".kqxs-react-auto .kqxs-kqlabel { font-size: 13px; color: var(--kqxs-muted, #666); font-weight: 700; text-align: left; }"
      + ".kqxs-react-auto .kqxs-kqvals { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; padding: 4px 0; }"
      + ".kqxs-react-auto .kqxs-kqvals-many { gap: 4px 10px; }"
      + ".kqxs-react-auto .kqxs-kqval { font-weight: 800; letter-spacing: 0.5px; color: var(--kqxs-text, #1f1f1f); line-height: 1.05; font-size: 38px; text-align: center; min-width: 64px; }"
      + ".kqxs-react-auto .kqxs-kqval-small { font-size: 24px; min-width: 56px; }"
      + ".kqxs-react-auto .kqxs-kqval-db { color: var(--kqxs-error, #ff4d4f); font-size: 50px; }"
      + ".kqxs-react-auto .kqxs-kqval-g8 { color: var(--kqxs-warning, #faad14); font-size: 38px; }"
      + ".kqxs-react-auto .kqxs-kq-pane .ant-table-title { text-align: center; text-transform: none; }"
      + ".kqxs-react-auto .kqxs-kq-pane .ant-table-wrapper { border: 1px solid var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .kqxs-kq-pane .ant-table-title { border-bottom: 1px solid var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; padding: 6px 8px !important; }"
      + ".kqxs-react-auto .kqxs-kq-pane .ant-table-thead > tr > th { background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; font-size: 10pt !important; font-weight: 700 !important; padding: 5px 6px !important; }"
      // Tô màu hàng thỏa mãn — giống Vue's to_mau class (màu vàng #cc9108)
      + ".kqxs-react-auto .ant-table-tbody > tr.to_mau > td { background: " + (chon_mau || "#cc9108") + " !important; }"
      + ".kqxs-react-auto .ant-table-tbody > tr.to_mau:hover > td { background: " + (chon_mau || "#cc9108") + " !important; }"
      // Tiêu đề nội tuyến của table trong Tổng Hợp
      + ".kqxs-react-auto .ant-table-title { padding: 4px 8px !important; font-weight: 700 !important; background: transparent !important; }"
      // Final precise overrides for Thong Ke KQ tabs + data headers
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-nav-list { gap: 2px !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab { margin: 0 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab .ant-tabs-tab-btn { padding: 6px 11px !important; border: 1px solid var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; border-radius: 0 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn { background: var(--kqxs-header-active-bg, color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, var(--kqxs-card-bg, #fff))) !important; border-color: var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; color: var(--kqxs-header-active-text, var(--kqxs-text, #1f1f1f)) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-tabs .ant-tabs-tab + .ant-tabs-tab { margin-left: 0 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-wrapper { border: 1px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-title { border-bottom: 1px solid var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; text-align: center !important; padding: 6px 8px !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-thead > tr > th { background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; font-size: 10pt !important; font-weight: 700 !important; padding: 5px 6px !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-tbody > tr > td { border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone { border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-title { border-bottom: 1px solid var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; }"
      + ".kqxs-react-auto .kqxs-kq-zone .ant-table-thead > tr > th { background: var(--kqxs-header-bg, var(--kqxs-card-bg, #fff)) !important; color: var(--kqxs-header-text, var(--kqxs-text, #1f1f1f)) !important; border-color: var(--kqxs-header-border, var(--kqxs-border, #d9d9d9)) !important; padding: 4px 6px !important; }"
      + ".kqxs-react-auto .ant-table-wrapper { position: relative; }"
      + ".kqxs-react-auto .kqxs-table-title-wrap { display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; width: max-content !important; max-width: none !important; margin: 0 auto !important; white-space: nowrap !important; }"
      + ".kqxs-react-auto .kqxs-table-title-text { text-align: center !important; white-space: nowrap !important; overflow: visible !important; text-overflow: clip !important; }"
      + ".kqxs-react-auto .kqxs-table-actions .ant-btn { min-width: 22px !important; width: 22px !important; height: 22px !important; line-height: 20px !important; padding: 0 !important; font-size: 10px !important; border-radius: 2px !important; }"
      + ".kqxs-react-auto .kqxs-capture-icon-btn { min-width: 24px !important; width: 24px !important; height: 24px !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }"
      + ".kqxs-react-auto .kqxs-capture-icon-btn .ant-btn-icon { margin-inline-end: 0 !important; }"
      + ".kqxs-react-auto .kqxs-capture-toolbar { position: absolute; right: 8px; top: 8px; z-index: 10; }"
      + ".kqxs-react-auto .kqxs-capture-toolbar .ant-btn { box-shadow: 0 1px 4px rgba(0,0,0,0.28); }"
      + ".kqxs-react-auto .kqxs-vach-col { background: var(--kqxs-vach-bg, color-mix(in srgb, var(--kqxs-warning, #faad14) 60%, var(--kqxs-card-bg, #fff))) !important; }"
      + "@media (max-width: 1200px) {"
      + ".kqxs-react-auto .kqxs-kq-col-main, .kqxs-react-auto .kqxs-kq-col-side { flex: 1 1 100%; max-width: 100%; min-width: 0; }"
      + ".kqxs-react-auto .kqxs-capture-toolbar { position: static; margin-bottom: 6px; display: flex; justify-content: flex-end; }"
      + "}";

    return h("div", {
      className: "kqxs-react-auto",
      style: {
        padding: 12,
        background: theme.pageBg,
        color: theme.text,
        borderRadius: 10,
        "--kqxs-page-bg": theme.pageBg,
        "--kqxs-card-bg": theme.cardBg,
        "--kqxs-border": theme.border,
        "--kqxs-text": theme.text,
        "--kqxs-muted": theme.muted,
        "--kqxs-primary": theme.primary,
        "--kqxs-success": theme.success,
        "--kqxs-warning": theme.warning,
        "--kqxs-error": theme.error,
        "--kqxs-input-bg": theme.inputBg,
        "--kqxs-input-text": theme.inputText,
        "--kqxs-header-bg": theme.cardBg,
        "--kqxs-header-text": theme.text,
        "--kqxs-header-border": theme.border,
        "--kqxs-header-active-bg": "color-mix(in srgb, " + theme.primary + " 16%, " + theme.cardBg + ")",
        "--kqxs-header-active-text": theme.text,
        "--kqxs-btn-bg": theme.cardBg,
        "--kqxs-btn-text": theme.text,
        "--kqxs-btn-border": theme.border,
        "--kqxs-btn-active-bg": "color-mix(in srgb, " + theme.primary + " 16%, " + theme.cardBg + ")",
        "--kqxs-vach-bg": theme.warning,
        "--kqxs-color-scheme": theme.isDark ? "dark" : "light",
        "--kqxs-date-icon-filter": theme.isDark ? "invert(0.9)" : "none"
      }
    }, [
      h("style", { key: "kqxs-theme-style" }, runtimeCss),
      h(Card, { key: "cfg", size: "small", title: tt.title, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
        h(Row, { gutter: 12 }, [
          h(Col, { xs: 24, md: 6, key: "c1" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.fromDate),
            renderDateField(tu_ngay, function (next) {
              setTuNgay(next);
            }, { maxDate: den_ngay })
          ]),
          h(Col, { xs: 24, md: 6, key: "c2" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
            renderDateField(den_ngay, function (next) {
              setDenNgay(next);
            }, { minDate: tu_ngay })
          ]),
          h(Col, { xs: 24, md: 4, key: "c3" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.region),
            h(Select, themedSelectProps({
              value: mien,
              options: [
                { value: "MN", label: tt.mienNam },
                { value: "MT", label: tt.mienTrung },
                { value: "MB", label: tt.mienBac }
              ],
              onChange: function (v) { setMien(v); }
            }))
          ]),
          h(Col, { xs: 24, md: 4, key: "c4" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.weekday),
            h(Select, themedSelectProps({
              value: thu_tuan,
              disabled: true,
              options: ds_thu.map(function (x) { return { value: x.ma, label: x.ten }; })
            }))
          ]),
          h(Col, { xs: 24, md: 4, key: "c5" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.color),
            h(ColorPicker, {
              value: chon_mau,
              presets: [{ label: "Gợi ý", colors: ["#f0bb41", "#cc9108", "#ff4d4f", "#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#08979c", "#eb2f96"] }],
              onChangeComplete: function (color) {
                setChonMau("#" + color.toHex());
              }
            })
          ])
        ]),

        h(Row, { gutter: 12, style: { marginTop: 10 } }, [
          h(Col, { xs: 24, md: 12, key: "d1" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.selectStation),
            h(Select, themedSelectProps({
              mode: "multiple",
              value: ds_dai_chon,
              options: dsDaiThu.map(function (d) { return { value: String(d.stt), label: d.label || d.ten_dai }; }),
              onChange: function (vals) { setDsDaiChon(vals || []); }
            }))
          ]),
          h(Col, { xs: 24, md: 12, key: "d2" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.selectStationSoChu),
            h(Select, themedSelectProps({
              mode: "multiple",
              value: ds_dai_chon_so_chu,
              options: dsDaiThu.map(function (d) { return { value: String(d.stt), label: d.label || d.ten_dai }; }),
              onChange: function (vals) { setDsDaiChonSoChu(vals || []); }
            }))
          ])
        ]),

        h(Row, { gutter: 12, style: { marginTop: 10 } }, [
          h(Col, { xs: 12, md: 3, key: "n1" }, [h("div", { style: { marginBottom: 6 } }, tt.tkType), h(Select, themedSelectProps({ value: loai_tk, options: [{ value: 1, label: tt.tk1 }, { value: 2, label: tt.tk2 }, { value: 3, label: tt.tk3 }], onChange: setLoaiTk }))]),
          h(Col, { xs: 12, md: 3, key: "n2" }, [h("div", { style: { marginBottom: 6 } }, tt.searchType), h(Select, themedSelectProps({ value: loai_tim, options: [{ value: 0, label: tt.theoNgay }, { value: 1, label: tt.theoKy }], onChange: setLoaiTim }))]),
          h(Col, { xs: 12, md: 3, key: "n3" }, [h("div", { style: { marginBottom: 6 } }, tt.soKy), h(InputNumber, themedNumberProps({ value: so_ky, onChange: function (v) { setSoKy(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "n4" }, [h("div", { style: { marginBottom: 6 } }, tt.laySoKy), h(InputNumber, themedNumberProps({ value: lay_so_ky, onChange: function (v) { setLaySoKy(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "n5" }, [h("div", { style: { marginBottom: 6 } }, tt.demLe), h(InputNumber, themedNumberProps({ value: dem_be_hon, onChange: function (v) { setDemBeHon(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "n6" }, [h("div", { style: { marginBottom: 6 } }, tt.kxhMin), h(InputNumber, themedNumberProps({ value: kxh_phai_lonhon, onChange: function (v) { setKxhPhaiLonhon(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "n7" }, [h("div", { style: { marginBottom: 6 } }, tt.demKq3Le), h(InputNumber, themedNumberProps({ value: dem_nho_hon, onChange: function (v) { setDemNhoHon(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "n8" }, [h("div", { style: { marginBottom: 6 } }, tt.lsBatDau), h(InputNumber, themedNumberProps({ value: ls_bat_dau, onChange: function (v) { setLsBatDau(toNumberSafe(v, 0)); } }))])
        ]),

        h(Row, { gutter: 12, style: { marginTop: 10 } }, [
          h(Col, { xs: 12, md: 3, key: "m1" }, [h("div", { style: { marginBottom: 6 } }, tt.demGe), h(InputNumber, themedNumberProps({ value: dem_lon_hon, onChange: function (v) { setDemLonHon(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "m2" }, [h("div", { style: { marginBottom: 6 } }, tt.demToNhoHon), h(InputNumber, themedNumberProps({ value: dem_to_nho_hon, onChange: function (v) { setDemToNhoHon(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "m3" }, [h("div", { style: { marginBottom: 6 } }, tt.kxhTu), h(InputNumber, themedNumberProps({ value: kxh_tu, onChange: function (v) { setKxhTu(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "m4" }, [h("div", { style: { marginBottom: 6 } }, tt.kxhDen), h(InputNumber, themedNumberProps({ value: kxh_den, onChange: function (v) { setKxhDen(toNumberSafe(v, 0)); } }))]),
          h(Col, { xs: 12, md: 3, key: "m5" }, [h("div", { style: { marginBottom: 6 } }, tt.sapXep), h(Select, themedSelectProps({ value: sap_xep, options: [{ value: 0, label: tt.sxMoi }, { value: 1, label: tt.sxCu }], onChange: setSapXep }))]),
          h(Col, { xs: 12, md: 3, key: "m6" }, [h("div", { style: { marginBottom: 6 } }, tt.locSau), h(Switch, { checked: !!kxh_locsau, onChange: setKxhLocSau })]),
          h(Col, { xs: 24, md: 6, key: "m7" }, [
            h("div", { style: { marginBottom: 6 } }, tt.soChu),
            h(Input, {
              value: so_chu_input,
              inputMode: "numeric",
              maxLength: 26,
              onKeyDown: function (e) {
                var key = e && e.key ? e.key : "";
                var allow = /[0-9]|Backspace|Delete|Tab|ArrowLeft|ArrowRight|Home|End|Enter|-/.test(key);
                if (!allow) e.preventDefault();
              },
              onChange: function (e) {
                var raw = e && e.target ? e.target.value : "";
                setSoChuInput(formatSoChuInput(raw));
              },
              placeholder: "99-99-99-99-99-99-99-99-99"
            })
          ])
        ]),

        h(Space, { wrap: true, style: { marginTop: 12 } }, [
          allowUpdateActions ? h(Button, { key: "up", className: "kqxs-action-btn", onClick: chay_cap_nhat, loading: loading }, tt.btnUpdate) : null,
          h(Button, {
            key: "kq",
            className: "kqxs-action-btn" + (activeAction === "kq" ? " kqxs-action-btn-active" : ""),
            onClick: xem_ket_qua,
            loading: loading
          }, tt.btnResult),
          h(Button, {
            key: "tk",
            className: "kqxs-action-btn" + (activeAction === "tk" ? " kqxs-action-btn-active" : ""),
            onClick: chay_thong_ke,
            loading: loading
          }, tt.btnStat),
          h(Button, {
            key: "tkm",
            className: "kqxs-action-btn" + (activeAction === "tkm" ? " kqxs-action-btn-active" : ""),
            onClick: thong_ke_moi,
            loading: loading
          }, tt.btnStatNew),
          allowUpdateActions ? h(Button, {
            key: "xsk",
            className: "kqxs-action-btn",
            onClick: function () { return cap_nhat_xskt(chuyenNgay(den_ngay, "dd/mm/yyyy")); },
            loading: loading
          }, tt.btnUpdateXskt) : null
        ]),

        h("div", { style: { marginTop: 8 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
      ]),

      h(Card, { key: "tabs", size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
        h("div", { className: "kqxs-tab-shell", style: { position: "relative" } }, [
          h("div", { className: "kqxs-tab-capture-root" },
        activeAction === "kq"
          ? h("div", null, [
              ds_dai_chon_xem_ket_qua.length
                ? h(Row, { gutter: 12, className: "kqxs-result-row" }, ds_dai_chon_xem_ket_qua.map(function (dai) {
                    var prizeRows = getPrizeRowsForCard(dai);

                    var colSpan = 24;
                    var daiCount = Math.max(1, ds_dai_chon_xem_ket_qua.length);
                    if (daiCount >= 2) colSpan = 12;

                    return h(Col, { xs: 24, md: colSpan, className: "kqxs-result-col", key: String(dai.stt) },
                      h(Card, { className: "kqxs-result-card", size: "small", title: (dai.ten_dai || "") + " - " + (dai.ngay || "") },
                        prizeRows.map(function (row) {
                          var vals = (row.vals || []).filter(function (v) { return String(v || "").trim() !== ""; });
                          var many = vals.length >= 5;
                          return h("div", { key: row.label, className: "kqxs-kqline" }, [
                            h("div", { className: "kqxs-kqlabel" }, row.label),
                            h("div", { className: "kqxs-kqvals" + (many ? " kqxs-kqvals-many" : "") }, vals.map(function (v, idx) {
                              var small = vals.length >= 5;
                              var valueClass = "kqxs-kqval"
                                + (small ? " kqxs-kqval-small" : "")
                                + (row.label === "Giải ĐB" ? " kqxs-kqval-db" : "")
                                + (row.label === "Giải 8" ? " kqxs-kqval-g8" : "");
                              return h("span", { className: valueClass, key: row.label + "_" + idx }, v);
                            }))
                          ]);
                        })
                      )
                    );
                  }))
                : h("div", null, tt.noResult),
              xu_ly_ket_qua.length
                ? h(Card, { size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border }, title: tt.kqByChuc },
                    h(Table, { rowKey: "id", columns: ketquaColumns, dataSource: xu_ly_ket_qua, pagination: false, size: "small", scroll: { x: 900 } }))
                : null
            ])
          : thongkeTabs.length
            ? h(Tabs, {
              className: "kqxs-thongke-tabs",
                activeKey: activeTabKey,
                onChange: function (k) { setSubTab(k); },
                size: "small",
                tabPosition: "top",
                items: thongkeTabs
              })
            : h("div", { style: { padding: 24, textAlign: "center", color: theme.muted } }, tt.noResult)
          )
        ])
      ])
    ]);
  }

  var containerId = window.csmDynamicCodeContainerId || "dynamic-code-root";
  var container = document.getElementById(containerId) || document.getElementById("dynamic-code-root") || document.getElementById("context-auto");
  if (!container) throw new Error("Dynamic container not found");

  container.innerHTML = "";
  var mountNode = document.createElement("div");
  mountNode.id = "auto-kqxs-react-root";
  container.appendChild(mountNode);

  var root = ReactDOMRef.createRoot(mountNode);
  root.render(h(KQXSApp));

  window.__dynamicCodeDispose = function () {
    try { root.unmount(); } catch (e) { console.warn("[auto-kqxs] dispose failed", e); }
    if (mountNode && mountNode.parentNode) mountNode.parentNode.removeChild(mountNode);
  };
})();