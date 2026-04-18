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

  function FallbackCheckbox(props) {
    return h("label", { style: Object.assign({ display: "inline-flex", alignItems: "center", gap: 6 }, props && props.style ? props.style : {}) }, [
      h("input", {
        type: "checkbox",
        checked: !!(props && props.checked),
        disabled: !!(props && props.disabled),
        onChange: function (e) {
          if (props && typeof props.onChange === "function") props.onChange(e);
        }
      }),
      props ? props.children : null
    ]);
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
  var Checkbox = antdRef.Checkbox || FallbackCheckbox;
  
  function FallbackTree(props) {
    return h("div", { style: { border: "1px solid var(--kqxs-border, #d9d9d9)", borderRadius: 6, padding: 12 } }, 
      "Tree component not available"
    );
  }
  var Tree = antdRef.Tree || FallbackTree;

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

  function toSinhThreshold(value, fallbackValue) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed) || isNaN(parsed) || parsed <= 0) parsed = parseInt(fallbackValue, 10);
    if (!isFinite(parsed) || isNaN(parsed) || parsed <= 0) parsed = 1;
    var mod = ((parsed % 4) + 4) % 4;
    if (mod === 1) return parsed;
    if (mod === 0) return parsed + 1;
    if (mod === 2) return parsed + 3;
    return parsed + 2;
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
      if (runtimeTheme && typeof runtimeTheme.isDark === "boolean") return runtimeTheme.isDark;

      var hints = [
        String(runtimeTheme && runtimeTheme.theme || "").toLowerCase(),
        String(runtimeTheme && runtimeTheme.mode || "").toLowerCase(),
        String(runtimeTheme && runtimeTheme.colorMode || "").toLowerCase(),
        String(html && html.getAttribute ? html.getAttribute("data-theme") : "").toLowerCase(),
        String(html && html.getAttribute ? html.getAttribute("theme") : "").toLowerCase(),
        String(body && body.getAttribute ? body.getAttribute("data-theme") : "").toLowerCase()
      ].filter(Boolean);

      function hasClass(el, cls) {
        return !!(el && el.classList && el.classList.contains(cls));
      }

      var hasDarkHint = hints.some(function (item) {
        return item.indexOf("dark") >= 0 || item === "night";
      }) || hasClass(html, "dark") || hasClass(html, "theme-dark") || hasClass(body, "dark") || hasClass(body, "theme-dark");

      var hasLightHint = hints.some(function (item) {
        return item.indexOf("light") >= 0 || item === "day";
      }) || hasClass(html, "light") || hasClass(html, "theme-light") || hasClass(body, "light") || hasClass(body, "theme-light");

      // Ưu tiên cờ light/dark hiện tại trên DOM/runtime, tránh kẹt theo giá trị lưu cũ.
      if (hasLightHint && !hasDarkHint) return false;
      if (hasDarkHint && !hasLightHint) return true;

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
    function parseColorToRgb(color) {
      var c = String(color || "").trim();
      if (!c) return null;
      var m;
      if ((m = c.match(/^#([0-9a-f]{3})$/i))) {
        var h = m[1];
        return {
          r: parseInt(h.charAt(0) + h.charAt(0), 16),
          g: parseInt(h.charAt(1) + h.charAt(1), 16),
          b: parseInt(h.charAt(2) + h.charAt(2), 16)
        };
      }
      if ((m = c.match(/^#([0-9a-f]{6})$/i))) {
        var hh = m[1];
        return {
          r: parseInt(hh.slice(0, 2), 16),
          g: parseInt(hh.slice(2, 4), 16),
          b: parseInt(hh.slice(4, 6), 16)
        };
      }
      if ((m = c.match(/^rgba?\(([^)]+)\)$/i))) {
        var parts = m[1].split(",").map(function (s) { return Number(String(s || "").trim()); });
        if (parts.length >= 3 && isFinite(parts[0]) && isFinite(parts[1]) && isFinite(parts[2])) {
          return { r: parts[0], g: parts[1], b: parts[2] };
        }
      }
      return null;
    }
    function luminance01(color) {
      var rgb = parseColorToRgb(color);
      if (!rgb) return null;
      return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    }
    function preferBg(color, darkFallback, lightFallback) {
      var raw = String(color || "").trim();
      if (!raw) return isDark ? darkFallback : lightFallback;
      var l = luminance01(raw);
      if (l == null) return raw;
      if (isDark && l > 0.75) return darkFallback;
      if (!isDark && l < 0.20) return lightFallback;
      return raw;
    }
    function preferText(color, darkFallback, lightFallback) {
      var raw = String(color || "").trim();
      if (!raw) return isDark ? darkFallback : lightFallback;
      var l = luminance01(raw);
      if (l == null) return raw;
      if (isDark && l < 0.30) return darkFallback;
      if (!isDark && l > 0.85) return lightFallback;
      return raw;
    }
    var cssPrimary = getCssVar("--ant-color-primary");
    var cssPageBg = getCssVar("--ant-color-bg-layout");
    var cssCardBg = getCssVar("--ant-color-bg-container");
    var cssText = getCssVar("--ant-color-text");
    var cssMuted = getCssVar("--ant-color-text-secondary");
    var cssBorder = getCssVar("--ant-color-border");
    var cssInputBg = getCssVar("--ant-color-bg-container");
    var cssInputText = getCssVar("--ant-color-text");
    var base = {
      isDark: isDark,
      primary: cssPrimary || runtimeTheme.themeColorPrimary || "#1677ff",
      success: getCssVar("--ant-color-success") || "#52c41a",
      warning: getCssVar("--ant-color-warning") || "#faad14",
      error: getCssVar("--ant-color-error") || "#ff4d4f",
      pageBg: preferBg(cssPageBg || (runtimeTheme.getLayoutBackground && runtimeTheme.getLayoutBackground()), "#0f1115", "#f5f7fb"),
      cardBg: preferBg(cssCardBg || (runtimeTheme.getCardBackground && runtimeTheme.getCardBackground()), "#141414", "#ffffff"),
      text: preferText(cssText || (runtimeTheme.getTextColor && runtimeTheme.getTextColor()), "rgba(255,255,255,0.88)", "#1f1f1f"),
      textInverse: getCssVar("--ant-color-text-light-solid") || "#ffffff",
      muted: preferText(cssMuted || (runtimeTheme.getSecondaryTextColor && runtimeTheme.getSecondaryTextColor()), "rgba(255,255,255,0.45)", "#666666"),
      border: cssBorder || (runtimeTheme.getBorderColor && runtimeTheme.getBorderColor()) || (isDark ? "#303030" : "#d9d9d9"),
      inputBg: preferBg(cssInputBg, "#11161f", "#ffffff"),
      inputText: preferText(cssInputText, "rgba(255,255,255,0.88)", "#1f1f1f")
    };
    return Object.assign({}, base, overrides, {
      isDark: typeof overrides.isDark === "boolean" ? overrides.isDark : base.isDark
    });
  }

  var UI_TEXT = {
    vi: {
      title: "Thống Kê Lô",
      fromDate: "Từ Ngày",
      toDate: "Đến Ngày",
      region: "Miền",
      weekday: "Thứ Tuần",
      color: "Màu Tô",
      sapXep: "Sắp Xếp",
      selectStation: "Chọn Đài",
      selectStationSoChu: "Lịch Sử Sổ Chủ",
      tkType: "Loại Thống Kê",
      searchType: "Loại Tìm",
      soKy: "Chu Kỳ",
      laySoKy: "Lấy Số Kỳ",
      demLe: "Đếm KQ1 <=",
      kxhMin: "KXH KQ2 >=",
      demKq3Le: "Đếm KQ3 <=",
      lsBatDau: "Max LSBD >=",
      demGe: "Đếm Sổ Chủ >=",
      demToNhoHon: "Đếm Số Lần <=",
      kxhTu: "KXH Từ >=",
      kxhDen: "KXH Đến <=",
      locSau: "Lọc Sâu KXH",
      soChu: "Tìm Sổ Chủ",
      btnUpdate: "Cập nhật kết quả",
      btnResult: "Kết Quả",
      btnStat: "Thống Kê",
      btnStatNew: "Thống Kê Mới",
      btnExportExcel: "Xuất Excel",
      btnCaptureTab: "Chụp Tab",
      btnExportTable: "Xuất Bảng",
      btnCaptureTable: "Chụp Bảng",
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
      colDem: "Số Lần Ra",
      colKxh: "Kỳ Không Hiện",
      colMaxKxh: "KXH Lâu Nhất",
      mienNam: "Miền Nam",
      mienTrung: "Miền Trung",
      mienBac: "Miền Bắc",
      tk1: "Thống Kê 1 Đài",
      tk2: "Thống Kê 2 Đài",
      tk3: "Thống Kê 3 Đài",
      theoNgay: "Theo Ngày",
      theoKy: "Theo Kỳ",
      sxMoi: "Ngày mới đứng trước",
      sxCu: "Ngày cũ đứng trước",
      lgHeThong: "Hệ Số Bắc (2 hoặc 3)",
      lgCdMode: "Kiểu Xét Kết Quả",
      lgCdAll: "Tất Cả (Đầu + Đuôi)",
      lgCdC: "Chính (Đầu)",
      lgCdD: "Đảo (Đuôi)",
      lgCdPair: "Số Cặp (Đầu-Đuôi)",
      lgGhTu: "Lấy Từ Vị Trí (1–60)",
      lgGhDen: "Lấy Đến Vị Trí (1–60)",
      lgNgayChay: "Số Ngày Xét (0 = Tất Cả)",
      lgSlrOptions: "Tùy Chọn Thêm",
      lgTheoKy: "Theo Kỳ (Số ngày × 7)",
      lgTheoThu: "Chỉ Cùng Thứ Trong Tuần",
      lgChkHieu: "Cả Hiệu=0",
      lgKttFields: "Ô Hiển Thị (KTT)",
      lgBtnRun: "Chạy Phân Tích",
      lgBtnCfgOpen: "Cấu Hình Nâng Cao ▼",
      lgBtnCfgClose: "Đóng Cấu Hình ▲",
      lgToolKtt: "① Kiểm Tra Tổng Hợp",
      lgToolSlr: "② Số Lâu Ra Nam-Bắc",
      lgToolNb: "③ Thống Kê Nam-Bắc",
      lgKttLegendD: "D – Đài Chính",
      lgKttLegendP: "P – Đài Phụ",
      lgKttLegendT: "T – Đài Nam 3",
      lgKttLegendB: "B – Đài Bắc",
      lgKttLegendMatch: "▲ Trùng Số Dự Đoán",
      lgKttFieldDdau: "D đầu (Đài Chính)",
      lgKttFieldDduoi: "D đuôi (Đài Chính)",
      lgKttFieldPdau: "P đầu (Đài Phụ)",
      lgKttFieldPduoi: "P đuôi (Đài Phụ)",
      lgKttFieldTdau: "T đầu (Đài Nam 3)",
      lgKttFieldTduoi: "T đuôi (Đài Nam 3)",
      lgKttFieldBdau: "B đầu (Đài Bắc)",
      lgKttFieldBduoi: "B đuôi (Đài Bắc)",
      lgSlrColSo: "Số",
      lgSlrColGap: "Lâu Ra (ngày / kỳ / thứ)",
      lgSlrColFirst: "Vị Trí Trúng Đầu Tiên",
      lgToolTh: "④ Thống Kê",
      lgToolThTab: "Tổng Hợp",
      lgSubTabTh: "① Tổng Hợp",
      lgSubTabSlr: "② Số Lâu Ra Nam-Bắc",
      lgSubTabKtt: "③ Kiểm Tra Tổng Hợp",
      lgSubTabNb: "④ Thống Kê Nam-Bắc",
      lgNbGroupSize: "Nhóm số",
      lgSlrWeek: "Tuần",
      lgSlrHit: "Trúng",
      lgNbColSo: "Bộ số",
      lgNbColDauCp: "Đầu chính phụ (D+P)",
      lgNbColDauC: "Đầu chính (D)",
      lgNbColDauP: "Đầu phụ (P)",
      lgNbColDauT: "Đầu Nam 3 (T)",
      lgNbColDauB: "Đầu Bắc (B)",
      lgNbColDuoiCp: "Đuôi chính phụ (D+P)",
      lgNbColDuoiC: "Đuôi chính (D)",
      lgNbColDuoiP: "Đuôi phụ (P)",
      lgNbColDuoiT: "Đuôi Nam 3 (T)",
      lgNbColDuoiB: "Đuôi Bắc (B)",
      lgNbColDauCDuoiP: "Đầu chính - Đuôi phụ (D-P)",
      lgNbColDauPDuoiC: "Đầu phụ - Đuôi chính (P-D)",
      lgNbColDd4Nhom: "Đầu đuôi Nam-Bắc đủ 4 nhóm (D+P+T+B)",
      lgNbColDd3NamBdau: "Đầu đuôi 3 nhóm Nam + Đầu B (D+P+T+B_dau)",
      lgNbColDd3Nam: "Đầu đuôi 3 đài Nam (D+P+T)",
      lgNbColDd3Nb: "Đầu đuôi 3 nhóm Nam-Bắc (D+P+B)",
      lgNbColDd2NamBdau: "Đầu đuôi 2 đài Nam + Đầu B (D+P+B_dau)",
      lgNbColDd2Nam: "Đầu đuôi 2 đài Nam (D+P)",
      lgNbColDdC: "Đầu đuôi chính (D)",
      lgNbColDdP: "Đầu đuôi phụ (P)",
      lgNbColDdT: "Đầu đuôi Nam 3 (T)",
      lgNbColDdB: "Đầu đuôi Bắc (B)",
      lgNbColBl4Nhom: "Bao lô Nam-Bắc đủ 4 nhóm (D+P+T+B)",
      lgNbColBl3Nam: "Bao lô 3 đài Nam (D+P+T)",
      lgNbColBl3Nb: "Bao lô 3 nhóm Nam-Bắc (D+P+B)",
      lgNbColBl2Nam: "Bao lô 2 đài Nam (D+P)",
      lgNbColBlC: "Bao lô chính (D)",
      lgNbColBlP: "Bao lô phụ (P)",
      lgNbColBlT: "Bao lô Nam 3 (T)",
      lgNbColBlB: "Bao lô Bắc (B)",
      lgThBoSo: "Các Số",
      lgThNgayCX: "Ngày CX",
      lgThKyCX: "Kỳ CX",
      lgThLauNgay: "Lâu Ngày",
      lgThLauKy: "Lâu Kỳ",
      lgThNgayCxNb: "Ngày CX NB",
      lgThNgayCx3nb: "Ngày CX 3NB",
      lgThNgayCx2d: "Ngày CX 2Đ",
      lgThNgayCx3d: "Ngày CX 3Đ",
      lgThNgayCxD3: "Ngày CX Đ3",
      lgThNgayCxMb: "Ngày CX MB",
      lgThNgayCxDc: "Ngày CX ĐC",
      lgThNgayCxDp: "Ngày CX ĐP",
      lgThLauNnb: "Lâu N. NB",
      lgThLauN3nb: "Lâu N. 3NB",
      lgThLauN2d: "Lâu N. 2Đ",
      lgThLauN3d: "Lâu N. 3Đ",
      lgThLauNd3: "Lâu N. Đ3",
      lgThLauNmb: "Lâu N. MB",
      lgThLauNdc: "Lâu N. ĐC",
      lgThLauNdp: "Lâu N. ĐP",
      lgThTong28n: "Tổng 28N",
      lgThTuan1: "Tuần 1",
      lgThTuan12: "Tuần 1+2",
      lgTh8t2dai: "8T 2đài",
      lgTh8tD3: "8T Đ3",
      lgThCountBoSo: "bộ số",
      lgThIntersectTitle: "Thứ Tự Trùng",
      lgThAutoSource: "Nguồn Auto Loại Tìm x Nhóm",
      lgThAutoLoad: "Tải Loại Tìm / Nhóm",
      lgThAutoApiSource: "Dùng API get-table-data",
      lgThAutoRunFull: "Chạy Auto Loại Tìm x Nhóm",
      lgThAutoQueryTypes: "Loại Tìm",
      lgThAutoGroups: "Nhóm Số",
      lgThAutoExpandGroups: "Mở rộng nhóm",
      lgThAutoCollapseGroups: "Thu nhóm",
      lgThAutoCheckWholeGroup: "Chọn toàn nhóm",
      lgThAutoSourceMode: "Nguồn Nhóm/Cách",
      lgThAutoSingle: "Lẻ 1 số",
      lgThAutoDao: "Đảo/Thuận",
      lgThAutoBand: "Dải số",
      lgThAutoCustom: "Tự nhập",
      lgThAutoCustomGroups: "Danh sách cách tự nhập",
      lgThAutoSelectAll: "Chọn hết",
      lgThAutoClearAll: "Bỏ hết",
      lgThAutoInvert: "Đảo chọn",
      lgThAutoStop: "Dừng",
      lgThAutoProgress: "Tiến trình Auto",
      lgThAutoTaskCount: "Số task",
      lgThAutoStopped: "Đã dừng tại task",
      lgThAutoTriet: "Nhóm Triệt",
      lgThAutoTrietDuoi: "Đuổi 6 ngày cuối",
      lgThAutoGroupsTriet: "Nhóm Số Triệt",
      lgThAutoSummary: "Tóm Tắt Auto",
      lgThKetQua: "Kết quả",
      lgThKtn: "Tuần tham chiếu (KTN)",
      lgThKtd: "Kỳ tham chiếu (KTD)",
      lgThL2c: "Ngày tham chiếu (L2C)",
      lgThTky: "Kỳ LanDai tham chiếu (TKY)",
      lgThTnd: "Ngày D+P tham chiếu (TND)",
      lgThManualSetup: "Thiết lập thủ công",
      lgThManualNote: "Bổ sung control theo HTML cũ",
      lgThManualNumber: "Số",
      lgThManualPlaceholder: "93-37-53 hoặc 93 37 53",
      lgThManualGroup: "Nhóm",
      lgThManualTriet: "Triệt",
      lgThManualShowTk: "Hiện TK",
      lgThManualFlow: "Luồng thủ công",
      lgThManualFlowNote: "Chạy theo Nhóm/Cách đã chọn hoặc theo Số nhập tay",
      lgThManualSearch: "🔍 Tìm",
      lgThManualSearchTriet: "🔍 Tìm Triệt",
      lgThManualNeedInput: "Nhập ít nhất 1 số hoặc chọn ít nhất 1 Nhóm/Cách.",
      lgThManualNeedQueryType: "Vui lòng chọn Loại Tìm.",
      lgThSourceGroup: "Nguồn: Nhóm/Cách",
      lgThSourceManual: "Nguồn: Số nhập tay",
      lgThManualInputCount: "Số nhập tay",
      lgThManualGroupCount: "Nhóm thường",
      lgThManualTrietCount: "Nhóm triệt",
      lgThManualRunCount: "Đầu vào chạy",
      lgThAutoFlow: "Luồng tự động",
      lgThAutoRunSearch: "⚙ Chạy tự động tìm",
      lgThAutoRun: "Lọc Tự Động (C1–C6)",
      lgThAutoC1Ngay: "C1 Ngày: Top N lâu nhất",
      lgThAutoC1Ky: "C1 Kỳ: Top N lâu nhất",
      lgThAutoC2NgayCX: "C2 Ngày CX (vd: 5,9,13)",
      lgThAutoC3KyCX: "C3 Kỳ CX (vd: 5,9,13)",
      lgThAutoC4NgayGap: "C4: Ngày CX > Lâu Ngày + N",
      lgThAutoC5KyGap: "C5: Kỳ CX > Lâu Kỳ + N",
      lgThAutoC6Both: "C6: Ngày CX ≥ Lâu Ngày VÀ Kỳ CX ≥ Lâu Kỳ",
      lgThAutoResult: "Kết Quả Lọc Tự Động",
      lgThResultSet: "Chọn Dòng Kết Quả",
      lgThSelect: "Chọn",
      lgThExportChecked: "Xuất Excel dòng đã chọn",
      lgThExportMainChecked: "Xuất Excel lưới chính (đã chọn)",
      lgThExportAutoChecked: "Xuất Excel lưới tự động (đã chọn)",
      lgThSelectRowsToExport: "Vui lòng chọn ít nhất 1 dòng để xuất Excel",
      lgThSeriesKqt: "Kết quả Tuần",
      lgThSeriesKqn: "Kết quả Ngày",
      lgThSeriesKtd: "Kết quả Tuần Đài",
      lgThSeriesKqd: "Kết quả Đài",
      lgThSeriesN2d: "Kết quả Tuần Đài Nam 2",
      lgThSeriesB2d: "Kết quả Tuần Đài Bắc",
      lgThSeriesT2d: "Kết quả Tuần Đài Nam 3",
      lgThSeriesN3d: "Kết quả Tuần 3 Đài Nam",
      lgThSeriesN2c: "Kết quả Ngày Nam 2",
      lgThSeriesB2c: "Kết quả Ngày Bắc",
      lgThSeriesT2c: "Kết quả Ngày Nam 3",
      lgThSeriesN3c: "Kết quả Ngày 3 Đài Nam",
      lgThSeriesB3c: "Kết quả Ngày Tổng Hợp",
      lgThSeriesL2c: "Kết quả Lô 2 Đài Nam + Bắc",
      lgThSeriesL3c: "Kết quả Lô 3 Đài Nam"
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
      soKy: "Total Periods",
      laySoKy: "Periods to Take",
      demLe: "Count KQ1 ≤ N",
      kxhMin: "No-show ≥ N",
      demKq3Le: "Count KQ3 ≤ N",
      lsBatDau: "Start from Period #",
      demGe: "Count ≥ N",
      demToNhoHon: "Count Small ≤ N",
      kxhTu: "Gap Range From",
      kxhDen: "Gap Range To",
      locSau: "Deep Gap Filter",
      soChu: "Target Numbers",
      btnUpdate: "Update Results",
      btnResult: "① View Results",
      btnStat: "② Basic Statistics",
      btnStatNew: "③ Advanced Statistics",
      btnExportExcel: "Export Excel",
      btnCaptureTab: "Capture Tab",
      btnExportTable: "Export Table",
      btnCaptureTable: "Capture Table",
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
      colDem: "Hit Count",
      colKxh: "No-show Streak",
      colMaxKxh: "Longest Gap",
      mienNam: "South",
      mienTrung: "Central",
      mienBac: "North",
      tk1: "1-Station Stats",
      tk2: "2-Station Stats",
      tk3: "3-Station Stats",
      theoNgay: "By Date",
      theoKy: "By Period",
      sxMoi: "Newest First",
      sxCu: "Oldest First",
      lgHeThong: "North System (2 or 3 digits)",
      lgCdMode: "Result Check Mode",
      lgCdAll: "All (Head + Tail)",
      lgCdC: "Main (Head)",
      lgCdD: "Reverse (Tail)",
      lgCdPair: "Pairs (Head-Tail)",
      lgGhTu: "Rank From (1–60)",
      lgGhDen: "Rank To (1–60)",
      lgNgayChay: "History Days (0 = All)",
      lgSlrOptions: "Extra Options",
      lgTheoKy: "By Period (Days × 7)",
      lgTheoThu: "Same Weekday Only",
      lgChkHieu: "Exclude Doubles (11, 22, ...)",
      lgKttFields: "Visible Fields (KTT)",
      lgBtnRun: "Run Analysis",
      lgBtnCfgOpen: "Advanced Config ▼",
      lgBtnCfgClose: "Close Config ▲",
      lgToolKtt: "① General Check (KTT)",
      lgToolSlr: "② Long-gap Numbers (SLR)",
      lgToolNb: "③ Summary Statistics (NB)",
      lgKttLegendD: "D – Main Station",
      lgKttLegendP: "P – Sub Station",
      lgKttLegendT: "T – 3rd South Station",
      lgKttLegendB: "B – North Station",
      lgKttLegendMatch: "▲ Matches Prediction",
      lgKttFieldDdau: "D Head (Main Station)",
      lgKttFieldDduoi: "D Tail (Main Station)",
      lgKttFieldPdau: "P Head (Sub Station)",
      lgKttFieldPduoi: "P Tail (Sub Station)",
      lgKttFieldTdau: "T Head (3rd South Station)",
      lgKttFieldTduoi: "T Tail (3rd South Station)",
      lgKttFieldBdau: "B Head (North Station)",
      lgKttFieldBduoi: "B Tail (North Station)",
      lgSlrColSo: "Number",
      lgSlrColGap: "Gap (days / periods / weekday)",
      lgSlrColFirst: "First Hit Position",
      lgToolTh: "④ Statistics",
      lgToolThTab: "Summary",
      lgSubTabTh: "① Summary",
      lgSubTabSlr: "② Long-gap North-South",
      lgSubTabKtt: "③ General Check",
      lgSubTabNb: "④ North-South Statistics",
      lgNbGroupSize: "Group size",
      lgSlrWeek: "Week",
      lgSlrHit: "Hits",
      lgNbColSo: "Number Set",
      lgNbColDauCp: "Main+Sub Head (D+P)",
      lgNbColDauC: "Main Head (D)",
      lgNbColDauP: "Sub Head (P)",
      lgNbColDauT: "South-3 Head (T)",
      lgNbColDauB: "North Head (B)",
      lgNbColDuoiCp: "Main+Sub Tail (D+P)",
      lgNbColDuoiC: "Main Tail (D)",
      lgNbColDuoiP: "Sub Tail (P)",
      lgNbColDuoiT: "South-3 Tail (T)",
      lgNbColDuoiB: "North Tail (B)",
      lgNbColDauCDuoiP: "Main Head - Sub Tail (D-P)",
      lgNbColDauPDuoiC: "Sub Head - Main Tail (P-D)",
      lgNbColDd4Nhom: "Head/Tail full 4 groups (D+P+T+B)",
      lgNbColDd3NamBdau: "Head/Tail 3 South + North Head (D+P+T+B_head)",
      lgNbColDd3Nam: "Head/Tail 3 South stations (D+P+T)",
      lgNbColDd3Nb: "Head/Tail 3 North-South groups (D+P+B)",
      lgNbColDd2NamBdau: "Head/Tail 2 South + North Head (D+P+B_head)",
      lgNbColDd2Nam: "Head/Tail 2 South stations (D+P)",
      lgNbColDdC: "Main head/tail (D)",
      lgNbColDdP: "Sub head/tail (P)",
      lgNbColDdT: "South-3 head/tail (T)",
      lgNbColDdB: "North head/tail (B)",
      lgNbColBl4Nhom: "Bao Lo full 4 groups (D+P+T+B)",
      lgNbColBl3Nam: "Bao Lo 3 South stations (D+P+T)",
      lgNbColBl3Nb: "Bao Lo 3 North-South groups (D+P+B)",
      lgNbColBl2Nam: "Bao Lo 2 South stations (D+P)",
      lgNbColBlC: "Bao Lo Main (D)",
      lgNbColBlP: "Bao Lo Sub (P)",
      lgNbColBlT: "Bao Lo South-3 (T)",
      lgNbColBlB: "Bao Lo North (B)",
      lgThBoSo: "Numbers",
      lgThNgayCX: "Days Gone",
      lgThKyCX: "Periods Gone",
      lgThLauNgay: "Max Day Gap",
      lgThLauKy: "Max Period Gap",
      lgThNgayCxNb: "Days Gone NB",
      lgThNgayCx3nb: "Days Gone 3NB",
      lgThNgayCx2d: "Days Gone 2S",
      lgThNgayCx3d: "Days Gone 3S",
      lgThNgayCxD3: "Days Gone S3",
      lgThNgayCxMb: "Days Gone North",
      lgThNgayCxDc: "Days Gone Main",
      lgThNgayCxDp: "Days Gone Sub",
      lgThLauNnb: "Max NB Gap",
      lgThLauN3nb: "Max 3NB Gap",
      lgThLauN2d: "Max 2S Gap",
      lgThLauN3d: "Max 3S Gap",
      lgThLauNd3: "Max S3 Gap",
      lgThLauNmb: "Max North Gap",
      lgThLauNdc: "Max Main Gap",
      lgThLauNdp: "Max Sub Gap",
      lgThTong28n: "Total 28D",
      lgThTuan1: "Week 1",
      lgThTuan12: "Week 1+2",
      lgTh8t2dai: "8W 2-station",
      lgTh8tD3: "8W S3",
      lgThCountBoSo: "sets",
      lgThIntersectTitle: "Overlap Order",
      lgThAutoSource: "Auto Query-Type x Group Sources",
      lgThAutoLoad: "Load Query Types / Groups",
      lgThAutoApiSource: "Use get-table-data API",
      lgThAutoRunFull: "Run Auto Query-Type x Group",
      lgThAutoQueryTypes: "Query Types",
      lgThAutoGroups: "Number Groups",
      lgThAutoExpandGroups: "Expand Groups",
      lgThAutoCollapseGroups: "Collapse Groups",
      lgThAutoCheckWholeGroup: "Select Whole Group",
      lgThAutoSourceMode: "Group Source",
      lgThAutoSingle: "Singles",
      lgThAutoDao: "Reverse Pairs",
      lgThAutoBand: "Bands",
      lgThAutoCustom: "Custom",
      lgThAutoCustomGroups: "Custom Group List",
      lgThAutoSelectAll: "Select All",
      lgThAutoClearAll: "Clear",
      lgThAutoInvert: "Invert",
      lgThAutoStop: "Stop",
      lgThAutoProgress: "Auto Progress",
      lgThAutoTaskCount: "Tasks",
      lgThAutoStopped: "Stopped at task",
      lgThAutoTriet: "Triet Groups",
      lgThAutoTrietDuoi: "Follow Last 6 Days",
      lgThAutoGroupsTriet: "Triet Number Groups",
      lgThAutoSummary: "Auto Summary",
      lgThKetQua: "Result",
      lgThKtn: "Reference Weeks (KTN)",
      lgThKtd: "Reference Periods (KTD)",
      lgThL2c: "Reference Days (L2C)",
      lgThTky: "Reference LanDai Periods (TKY)",
      lgThTnd: "Reference D+P Days (TND)",
      lgThManualSetup: "Manual Setup",
      lgThManualNote: "Extra controls aligned with legacy HTML",
      lgThManualNumber: "Numbers",
      lgThManualPlaceholder: "93-37-53 or 93 37 53",
      lgThManualGroup: "Group",
      lgThManualTriet: "Triet",
      lgThManualShowTk: "Show Stats",
      lgThManualFlow: "Manual Flow",
      lgThManualFlowNote: "Run using selected Group/Pattern or manual numbers",
      lgThManualSearch: "🔍 Search",
      lgThManualSearchTriet: "🔍 Search Triet",
      lgThManualNeedInput: "Enter at least 1 number or select at least 1 Group/Pattern.",
      lgThManualNeedQueryType: "Please select a Query Type.",
      lgThSourceGroup: "Source: Group/Pattern",
      lgThSourceManual: "Source: Manual numbers",
      lgThManualInputCount: "Manual numbers",
      lgThManualGroupCount: "Normal groups",
      lgThManualTrietCount: "Triet Groups",
      lgThManualRunCount: "Run input",
      lgThAutoFlow: "Auto Flow",
      lgThAutoRunSearch: "⚙ Run Auto Search",
      lgThAutoRun: "Auto Filter (C1–C6)",
      lgThAutoC1Ngay: "C1 Day: Top N longest",
      lgThAutoC1Ky: "C1 Period: Top N longest",
      lgThAutoC2NgayCX: "C2: Days No-show (e.g. 5,9,13)",
      lgThAutoC3KyCX: "C3: Periods No-show (e.g. 5,9,13)",
      lgThAutoC4NgayGap: "C4: Days No-show > Max Day Gap + N",
      lgThAutoC5KyGap: "C5: Periods No-show > Max Period Gap + N",
      lgThAutoC6Both: "C6: Days No-show ≥ Max Day AND Periods No-show ≥ Max Period",
      lgThAutoResult: "Auto Filter Results",
      lgThResultSet: "Result Lines",
      lgThSelect: "Select",
      lgThExportChecked: "Export selected rows to Excel",
      lgThExportMainChecked: "Export main grid (selected)",
      lgThExportAutoChecked: "Export auto grid (selected)",
      lgThSelectRowsToExport: "Please select at least 1 row to export",
      lgThSeriesKqt: "Weekly Result",
      lgThSeriesKqn: "Daily Result",
      lgThSeriesKtd: "Weekly Station Result",
      lgThSeriesKqd: "Station Result",
      lgThSeriesN2d: "Weekly South-2 Result",
      lgThSeriesB2d: "Weekly North Result",
      lgThSeriesT2d: "Weekly South-3 Result",
      lgThSeriesN3d: "Weekly South-3-Station Result",
      lgThSeriesN2c: "Daily South-2 Result",
      lgThSeriesB2c: "Daily North Result",
      lgThSeriesT2c: "Daily South-3 Result",
      lgThSeriesN3c: "Daily South-3-Station Result",
      lgThSeriesB3c: "Daily Combined Result",
      lgThSeriesL2c: "Lo 2 South + North Result",
      lgThSeriesL3c: "Lo 3 South Result"
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
      soKy: "统计总期数",
      laySoKy: "取期数",
      demLe: "筛选：KQ1 ≤ N 次",
      kxhMin: "筛选：未出现 ≥ N 期",
      demKq3Le: "筛选：KQ3 ≤ N 次",
      lsBatDau: "从第几期开始",
      demGe: "筛选：出现 ≥ N 次",
      demToNhoHon: "筛选：数敖 ≤ N 次",
      kxhTu: "间隔区间起",
      kxhDen: "间隔区间止",
      locSau: "深度筛选间隔",
      soChu: "目标号码",
      btnUpdate: "更新结果",
      btnResult: "① 查看开奖结果",
      btnStat: "② 基础统计",
      btnStatNew: "③ 高级统计",
      btnExportExcel: "导出 Excel",
      btnCaptureTab: "截图页签",
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
      colDem: "出现次数",
      colKxh: "未出现期数",
      colMaxKxh: "最长间隔",
      mienNam: "南部",
      mienTrung: "中部",
      mienBac: "北部",
      tk1: "单台统计",
      tk2: "双台统计",
      tk3: "三台统计",
      theoNgay: "按日期",
      theoKy: "按期",
      sxMoi: "最新在前",
      sxCu: "最旧在前",
      lgHeThong: "北部号系（2或3位）",
      lgCdMode: "开奖结果检查方式",
      lgCdAll: "全部（头 + 尾）",
      lgCdC: "正号（头）",
      lgCdD: "倒号（尾）",
      lgCdPair: "对子（头-尾）",
      lgGhTu: "排名起始（1–60）",
      lgGhDen: "排名截止（1–60）",
      lgNgayChay: "历史天数（0 = 全部）",
      lgSlrOptions: "附加选项",
      lgTheoKy: "按期（天数 × 7）",
      lgTheoThu: "仅限同一星期",
      lgChkHieu: "排除重复对（11, 22, ...）",
      lgKttFields: "显示字段（KTT）",
      lgBtnRun: "运行分析",
      lgBtnCfgOpen: "高级配置 ▼",
      lgBtnCfgClose: "关闭配置 ▲",
      lgToolKtt: "① 综合检验",
      lgToolSlr: "② 长间隔号码统计",
      lgToolNb: "③ 南北统计汇总",
      lgKttLegendD: "D – 主台",
      lgKttLegendP: "P – 副台",
      lgKttLegendT: "T – 南部3台",
      lgKttLegendB: "B – 北台",
      lgKttLegendMatch: "▲ 匹配预测号码",
      lgKttFieldDdau: "D 头位（主台）",
      lgKttFieldDduoi: "D 尾位（主台）",
      lgKttFieldPdau: "P 头位（副台）",
      lgKttFieldPduoi: "P 尾位（副台）",
      lgKttFieldTdau: "T 头位（南部3台）",
      lgKttFieldTduoi: "T 尾位（南部3台）",
      lgKttFieldBdau: "B 头位（北台）",
      lgKttFieldBduoi: "B 尾位（北台）",
      lgSlrColSo: "号码",
      lgSlrColGap: "间隔（天 / 期 / 周）",
      lgSlrColFirst: "首次出现位置",
      lgToolTh: "④ 统计",
      lgToolThTab: "汇总",
      lgSubTabTh: "① 汇总",
      lgSubTabSlr: "② 南北长未出",
      lgSubTabKtt: "③ 综合检验",
      lgSubTabNb: "④ 南北统计",
      lgNbGroupSize: "号码组",
      lgSlrWeek: "周",
      lgSlrHit: "命中",
      lgNbColSo: "号码组",
      lgNbColDauCp: "主副头位 (D+P)",
      lgNbColDauC: "主台头位 (D)",
      lgNbColDauP: "副台头位 (P)",
      lgNbColDauT: "南3头位 (T)",
      lgNbColDauB: "北台头位 (B)",
      lgNbColDuoiCp: "主副尾位 (D+P)",
      lgNbColDuoiC: "主台尾位 (D)",
      lgNbColDuoiP: "副台尾位 (P)",
      lgNbColDuoiT: "南3尾位 (T)",
      lgNbColDuoiB: "北台尾位 (B)",
      lgNbColDauCDuoiP: "主头-副尾 (D-P)",
      lgNbColDauPDuoiC: "副头-主尾 (P-D)",
      lgNbColDd4Nhom: "头尾南北4组 (D+P+T+B)",
      lgNbColDd3NamBdau: "头尾南3组+北头 (D+P+T+B_dau)",
      lgNbColDd3Nam: "头尾南3台 (D+P+T)",
      lgNbColDd3Nb: "头尾南北3组 (D+P+B)",
      lgNbColDd2NamBdau: "头尾南2台+北头 (D+P+B_dau)",
      lgNbColDd2Nam: "头尾南2台 (D+P)",
      lgNbColDdC: "主台头尾 (D)",
      lgNbColDdP: "副台头尾 (P)",
      lgNbColDdT: "南3头尾 (T)",
      lgNbColDdB: "北台头尾 (B)",
      lgNbColBl4Nhom: "包罗南北4组 (D+P+T+B)",
      lgNbColBl3Nam: "包罗南3台 (D+P+T)",
      lgNbColBl3Nb: "包罗南北3组 (D+P+B)",
      lgNbColBl2Nam: "包罗南2台 (D+P)",
      lgNbColBlC: "包罗主台 (D)",
      lgNbColBlP: "包罗副台 (P)",
      lgNbColBlT: "包罗南3 (T)",
      lgNbColBlB: "包罗北台 (B)",
      lgThBoSo: "号码",
      lgThNgayCX: "未出现天数",
      lgThKyCX: "未出现期数",
      lgThLauNgay: "最大天间隔",
      lgThLauKy: "最大期间隔",
      lgThNgayCxNb: "NB未出现天数",
      lgThNgayCx3nb: "3NB未出现天数",
      lgThNgayCx2d: "2台未出现天数",
      lgThNgayCx3d: "3台未出现天数",
      lgThNgayCxD3: "南3未出现天数",
      lgThNgayCxMb: "北部未出现天数",
      lgThNgayCxDc: "主台未出现天数",
      lgThNgayCxDp: "副台未出现天数",
      lgThLauNnb: "NB最大间隔",
      lgThLauN3nb: "3NB最大间隔",
      lgThLauN2d: "2台最大间隔",
      lgThLauN3d: "3台最大间隔",
      lgThLauNd3: "南3最大间隔",
      lgThLauNmb: "北部最大间隔",
      lgThLauNdc: "主台最大间隔",
      lgThLauNdp: "副台最大间隔",
      lgThTong28n: "28天总计",
      lgThTuan1: "第1周",
      lgThTuan12: "第1+2周",
      lgTh8t2dai: "8周2台",
      lgTh8tD3: "8周南3",
      lgThCountBoSo: "组",
      lgThIntersectTitle: "重复顺序",
      lgThAutoSource: "自动类型 x 分组来源",
      lgThAutoLoad: "加载类型 / 分组",
      lgThAutoApiSource: "使用 get-table-data API",
      lgThAutoRunFull: "运行自动类型 x 分组",
      lgThAutoQueryTypes: "查询类型",
      lgThAutoGroups: "号码分组",
      lgThAutoExpandGroups: "展开分组",
      lgThAutoCollapseGroups: "收起分组",
      lgThAutoCheckWholeGroup: "整组全选",
      lgThAutoSourceMode: "分组来源",
      lgThAutoSingle: "单号",
      lgThAutoDao: "正反对",
      lgThAutoBand: "区间",
      lgThAutoCustom: "自定义",
      lgThAutoCustomGroups: "自定义组合列表",
      lgThAutoSelectAll: "全选",
      lgThAutoClearAll: "清空",
      lgThAutoInvert: "反选",
      lgThAutoStop: "停止",
      lgThAutoProgress: "自动进度",
      lgThAutoTaskCount: "任务数",
      lgThAutoStopped: "已停止于任务",
      lgThAutoTriet: "淘汰分组",
      lgThAutoTrietDuoi: "追最近6天",
      lgThAutoGroupsTriet: "淘汰号码分组",
      lgThAutoSummary: "自动汇总",
      lgThKetQua: "结果",
      lgThKtn: "参考周数 (KTN)",
      lgThKtd: "参考期数 (KTD)",
      lgThL2c: "参考天数 (L2C)",
      lgThTky: "LanDai参考期数 (TKY)",
      lgThTnd: "D+P参考天数 (TND)",
      lgThManualSetup: "手动设置",
      lgThManualNote: "按旧版 HTML 补充控制项",
      lgThManualNumber: "号码",
      lgThManualPlaceholder: "93-37-53 或 93 37 53",
      lgThManualGroup: "分组",
      lgThManualTriet: "Triet",
      lgThManualShowTk: "显示统计",
      lgThManualFlow: "手动流程",
      lgThManualFlowNote: "按已选分组/组合或手动号码执行",
      lgThManualSearch: "🔍 查找",
      lgThManualSearchTriet: "🔍 查找 Triet",
      lgThManualNeedInput: "请至少输入 1 个号码，或选择至少 1 个分组/组合。",
      lgThManualNeedQueryType: "请选择查询类型。",
      lgThSourceGroup: "来源: 分组/组合",
      lgThSourceManual: "来源: 手动号码",
      lgThManualInputCount: "手动号码",
      lgThManualGroupCount: "普通分组",
      lgThManualTrietCount: "Triet 分组",
      lgThManualRunCount: "执行输入",
      lgThAutoFlow: "自动流程",
      lgThAutoRunSearch: "⚙ 运行自动查找",
      lgThAutoRun: "自动筛选 (C1–C6)",
      lgThAutoC1Ngay: "C1 天：最长N个",
      lgThAutoC1Ky: "C1 期：最长N个",
      lgThAutoC2NgayCX: "C2 未出现天数（例如：5,9,13）",
      lgThAutoC3KyCX: "C3 未出现期数（例如：5,9,13）",
      lgThAutoC4NgayGap: "C4: 未出现天数 > 最大间隔 + N",
      lgThAutoC5KyGap: "C5: 未出现期数 > 最大间隔 + N",
      lgThAutoC6Both: "C6: 天数 ≥ 最大天间隔 且 期数 ≥ 最大期间隔",
      lgThAutoResult: "自动筛选结果",
      lgThResultSet: "结果行选择",
      lgThSelect: "勾选",
      lgThExportChecked: "导出已勾选行到 Excel",
      lgThExportMainChecked: "导出主表（已勾选）",
      lgThExportAutoChecked: "导出自动表（已勾选）",
      lgThSelectRowsToExport: "请至少勾选一行再导出",
      lgThSeriesKqt: "周结果",
      lgThSeriesKqn: "日结果",
      lgThSeriesKtd: "台周结果",
      lgThSeriesKqd: "台结果",
      lgThSeriesN2d: "南部2台周结果",
      lgThSeriesB2d: "北部周结果",
      lgThSeriesT2d: "南部3台周结果",
      lgThSeriesN3d: "南部3台周合计",
      lgThSeriesN2c: "南部2台日结果",
      lgThSeriesB2c: "北部日结果",
      lgThSeriesT2c: "南部3台日结果",
      lgThSeriesN3c: "南部3台日合计",
      lgThSeriesB3c: "综合日结果",
      lgThSeriesL2c: "南北2台Lô结果",
      lgThSeriesL3c: "南部3台Lô结果"
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
        var baseParams = Object.assign({}, params || {});
        function markIncomplete(reason) {
          if (dataFetchIntegrityRef && dataFetchIntegrityRef.current) {
            dataFetchIntegrityRef.current.incomplete = true;
            dataFetchIntegrityRef.current.reason = String(reason || "du_lieu_bi_cat");
          }
        }

        seft.csm_obj_tables(baseParams, function (rs) {
          var rows = (rs && rs.rows) || [];
          var truncated = !!(rs && (rs.truncated === true || (rs.raw && rs.raw.truncated === true)));
          var hasCursor = !!(rs && ((rs.nextCursor != null && rs.nextCursor !== "") || (rs.raw && rs.raw.nextCursor != null && rs.raw.nextCursor !== "")));
          if (truncated || hasCursor) {
            markIncomplete(hasCursor ? "backend_tra_ve_cursor" : "backend_truncated_khong_co_cursor");
          }
          resolve(rows);
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

  function parseSoChuByHeThong(value, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var re = he === 3 ? /\d{1,3}/g : /\d{1,2}/g;
    var numbers = String(value || "").replace(/\D/g, "").match(re) || [];
    var seen = {};
    var out = [];
    var maxVal = he === 3 ? 999 : 99;
    for (var i = 0; i < numbers.length; i += 1) {
      var n = String(numbers[i] || "").padStart(he, "0");
      if (n.length !== he) continue;
      if (Number(n) > maxVal) continue;
      if (seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    return out;
  }

  function formatSoChuInputByHe(value, heThong) {
    var list = parseSoChuByHeThong(value, heThong);
    return list.join("-");
  }

  function buildLegacyKttLookupFromTimKiemTrRows(rows, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var list = Array.isArray(rows) ? rows : [];
    var map = {};

    function rev2(token) {
      var s = String(token || "");
      if (!/^\d{2}$/.test(s)) return s;
      return s.slice(1) + s.slice(0, 1);
    }

    for (var i = 0; i < list.length; i += 1) {
      var row = list[i] || {};
      var maDuoi = Number(row.ma_duoi || row.MaDuoi || 0);
      if (maDuoi && maDuoi !== he) continue;
      var noiDung = String(row.noi_dung || row.NoiDung || row.dong_nghia || "").trim();
      if (!noiDung) continue;
      var tokens = parseSoChuByHeThong(noiDung, he);
      if (!tokens.length) continue;

      for (var ti = 0; ti < tokens.length; ti += 1) {
        var token = tokens[ti];
        if (map[token]) continue;

        if (he === 2) {
          if (token.charAt(0) !== token.charAt(1)) {
            var rv = rev2(token);
            if (tokens.indexOf(rv) < 0) continue;
          } else {
            if (noiDung.replace(/\s+/g, "").indexOf(token) !== 0) continue;
          }
        }

        map[token] = noiDung;
      }
    }

    // Fallback: if strict matching misses a token, use first row that contains it.
    for (var i2 = 0; i2 < list.length; i2 += 1) {
      var row2 = list[i2] || {};
      var maDuoi2 = Number(row2.ma_duoi || row2.MaDuoi || 0);
      if (maDuoi2 && maDuoi2 !== he) continue;
      var noiDung2 = String(row2.noi_dung || row2.NoiDung || row2.dong_nghia || "").trim();
      if (!noiDung2) continue;
      var tokens2 = parseSoChuByHeThong(noiDung2, he);
      for (var t2 = 0; t2 < tokens2.length; t2 += 1) {
        var tk = tokens2[t2];
        if (!map[tk]) map[tk] = noiDung2;
      }
    }

    return map;
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

  function buildLegacyThDefaultQueryTypeDefs(heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var maQuery = he === 3 ? "sp_Get3_DD3" : "sp_Get2_DD3";
    return [
      { value: maQuery + ",D_-P_-T_-B_", text: "4 Nhóm (D+P+T+B)" },
      { value: maQuery + ",D_-P_-T_", text: "3 Nam D+P+T" },
      { value: maQuery + ",D_-P_-B_", text: "3 NB D+P+B" },
      { value: maQuery + ",D_-T_-B_", text: "3 D+T+B" },
      { value: maQuery + ",P_-T_-B_", text: "3 P+T+B" },
      { value: maQuery + ",D_-P_", text: "2 Nam D+P" },
      { value: maQuery + ",D_-B_", text: "2 D+B" },
      { value: maQuery + ",P_-B_", text: "2 P+B" },
      { value: maQuery + ",D_", text: "Đài Chính D" },
      { value: maQuery + ",P_", text: "Đài Phụ P" },
      { value: maQuery + ",T_", text: "Đài T (Nam 3)" },
      { value: maQuery + ",B_", text: "Đài Bắc B" }
    ];
  }

  function getLegacySlrDefaultQueryValue(heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var maQuery = he === 3 ? "sp_Get3_DD3" : "sp_Get2_DD3";
    // Match legacy HTML SoLauRaNamBac: CboLoai.setComboValue("sp_Get2_DD3,D_-P_-B_")
    return maQuery + ",D_-P_-B_";
  }

  function isLegacyDd3NbQueryValue(value, heThong) {
    var raw = parseLegacyLoaiTimMeta(value, heThong).rawValue;
    return /,D_-P_-B_$/.test(String(raw || ""));
  }

  function getLegacySlrPreferredQueryValue(heThong, optionList) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var options = Array.isArray(optionList) && optionList.length
      ? optionList
      : buildLegacyThDefaultQueryTypeDefs(he);
    for (var i = 0; i < options.length; i += 1) {
      var v = String((options[i] && options[i].value) || "").trim();
      if (!v) continue;
      if (!isLegacyDd3NbQueryValue(v, he)) return v;
    }
    return String((options[0] && options[0].value) || getLegacySlrDefaultQueryValue(he));
  }

  // Static TongHop auto query-type definitions (replaces DB-driven CboLoaiTim.php)
  var LEGACY_TH_AUTO_QUERY_TYPE_DEFS = buildLegacyThDefaultQueryTypeDefs(2);

  function buildLegacyThSingleItems(heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var items = [];
    var max = he === 2 ? 100 : 1000;
    for (var i = 0; i < max; i += 1) items.push(String(i).padStart(he, "0"));
    return items;
  }

  function buildLegacyThDaoItems(heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var source = buildLegacyThSingleItems(he);
    var seen = {};
    var items = [];
    source.forEach(function (value) {
      var reverse = value.split("").reverse().join("");
      var normalized = [value, reverse].sort().join(" ");
      if (seen[normalized]) return;
      seen[normalized] = true;
      items.push(normalized);
    });
    return items.sort();
  }

  function parseLegacyThCustomGroups(text, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var lines = String(text || "").split(/\r?\n/).map(function (line) { return String(line || "").trim(); }).filter(Boolean);
    var groups = [];
    lines.forEach(function (line, idx) {
      var label = "Cách " + (idx + 1);
      var body = line;
      var colonPos = line.indexOf(":");
      if (colonPos > 0) {
        label = String(line.substring(0, colonPos) || "").trim() || label;
        body = String(line.substring(colonPos + 1) || "").trim();
      }
      var tokens = body.replace(/[;,|]+/g, " ").split(/\s+/).map(function (token) {
        return String(token || "").trim();
      }).filter(function (token) {
        return new RegExp("^\\d{" + he + "}$").test(token);
      });
      if (!tokens.length) return;
      groups.push({
        id: "custom_" + idx,
        text: label,
        children: tokens.map(function (token) { return { id: token, text: token }; }),
        cachIds: tokens.join(","),
        tCach: tokens.join(" ")
      });
    });
    return groups;
  }

  // Generate number group definitions from client-side rules (replaces DB-driven tree_nhomso.php)
  function buildLegacyThAutoGroupDefs(heThong, mode, customText) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var sourceMode = String(mode || "dao").trim();
    var groups = [];
    if (sourceMode === "custom") return parseLegacyThCustomGroups(customText, he);
    if (sourceMode === "single") {
      var singles = buildLegacyThSingleItems(he);
      return [{
        id: "single_all",
        text: he === 2 ? "Nhóm 1 số" : "Nhóm 1 bộ 3 số",
        children: singles.map(function (item) { return { id: item, text: item }; }),
        cachIds: singles.join(","),
        tCach: singles.join(" ")
      }];
    }
    if (sourceMode === "dao") {
      var daoItems = buildLegacyThDaoItems(he);
      var chunkSize = he === 2 ? 20 : 25;
      for (var di = 0; di < daoItems.length; di += chunkSize) {
        var part = daoItems.slice(di, di + chunkSize);
        groups.push({
          id: "dao_" + Math.floor(di / chunkSize),
          text: "Nhóm đảo " + (Math.floor(di / chunkSize) + 1),
          children: part.map(function (item) { return { id: item, text: item }; }),
          cachIds: part.join(","),
          tCach: part.join(" | ")
        });
      }
      return groups;
    }
    if (he === 2) {
      for (var start = 0; start <= 90; start += 10) {
        var end = start + 9;
        var nums = [];
        for (var n = start; n <= end; n++) nums.push(String(n).padStart(2, "0"));
        groups.push({
          id: String(start / 10),
          text: "Nhóm " + String(start).padStart(2, "0") + "-" + String(end).padStart(2, "0"),
          children: nums.map(function (s) { return { id: s, text: s }; }),
          cachIds: nums.join(","),
          tCach: nums.join(",")
        });
      }
    } else {
      for (var start3 = 0; start3 <= 900; start3 += 100) {
        var end3 = start3 + 99;
        var nums3 = [];
        for (var n3 = start3; n3 <= end3; n3++) nums3.push(String(n3).padStart(3, "0"));
        groups.push({
          id: String(start3 / 100),
          text: "Nhóm " + String(start3).padStart(3, "0") + "-" + String(end3).padStart(3, "0"),
          children: nums3.map(function (s) { return { id: s, text: s }; }),
          cachIds: nums3.join(","),
          tCach: nums3.join(",")
        });
      }
    }
    return groups;
  }

  function tokenizeLegacyGroupNumbers(rawText, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var regex = he === 3 ? /\d{3}/g : /\d{2}/g;
    var tokens = String(rawText || "").replace(/[^0-9]+/g, " ").match(regex) || [];
    var seen = {};
    var out = [];
    tokens.forEach(function (token) {
      var normalized = String(token || "").padStart(he, "0");
      if (normalized.length !== he) return;
      if (seen[normalized]) return;
      seen[normalized] = true;
      out.push(normalized);
    });
    return out;
  }

  function normalizeLegacyTongHopQueryValue(rawLoai, heThong) {
    var raw = String(rawLoai || "").trim();
    if (!raw) return "";
    if (/^sp_Get\d+_/i.test(raw)) {
      var cleaned = raw.replace(/\s+/g, "");
      // Legacy HTML/PHP combo values include both MaQuery and field filters: "sp_GetX_...,D_-P_-T_-B_".
      // Some API payloads only return MaQuery, so normalize to a complete value.
      if (cleaned.indexOf(",") < 0) cleaned = cleaned + ",D_-P_-T_-B_";
      return cleaned;
    }
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var defaultQuery = he === 3 ? "sp_Get3_DD3" : "sp_Get2_DD3";
    return (defaultQuery + "," + raw).replace(/\s+/g, "");
  }

  function parseLegacyLoaiTimMeta(rawLoai, heThong) {
    var normalized = normalizeLegacyTongHopQueryValue(rawLoai, heThong);
    if (!normalized) {
      var he = Number(heThong || 2) === 3 ? 3 : 2;
      normalized = normalizeLegacyTongHopQueryValue("D_-P_-T_-B_", he);
    }
    var parts = String(normalized || "").split(",");
    var maQuery = String(parts[0] || "").trim();
    var fieldPart = String(parts.slice(1).join(",") || "").trim();
    return {
      rawValue: normalized,
      maQuery: maQuery,
      fieldPart: fieldPart.replace(/\s+/g, "")
    };
  }

  function parseLegacyLoaiTimFieldPart(rawLoai) {
    return parseLegacyLoaiTimMeta(rawLoai).fieldPart;
  }

  function parseLegacyLoaiTimMaQuery(rawLoai, heThong) {
    return parseLegacyLoaiTimMeta(rawLoai, heThong).maQuery;
  }

  function buildLegacyRangeFieldNames(prefix, fromNum, toNum) {
    var out = [];
    for (var i = Number(fromNum || 0); i <= Number(toNum || 0); i += 1) {
      out.push(String(prefix || "") + i);
    }
    return out;
  }

  function getLegacyAllNormalizedFieldKeys() {
    var out = [];
    ["D", "P", "T"].forEach(function (role) {
      out.push(role + "_dau");
      out = out.concat(buildLegacyRangeFieldNames(role + "_so", 2, 17));
      out.push(role + "_duoi");
    });
    out.push("B_dau");
    out = out.concat(buildLegacyRangeFieldNames("B_so", 2, 26));
    out.push("B_duoi");
    return out;
  }

  function getLegacyQueryFieldList(queryValue, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var maQuery = String(parseLegacyLoaiTimMaQuery(queryValue, he) || "").toUpperCase();
      if (maQuery === "SP_GET2_DD") {
        return ["D_dau", "D_duoi", "P_dau", "P_duoi", "B_dau", "B_so2", "B_so3", "B_so4", "B_duoi"];
      }
      if (maQuery === "SP_GET2_BL") {
        return ["D_dau"].concat(buildLegacyRangeFieldNames("D_so", 2, 17), ["D_duoi", "P_dau"]).concat(buildLegacyRangeFieldNames("P_so", 2, 17), ["P_duoi", "B_dau"]).concat(buildLegacyRangeFieldNames("B_so", 2, 26), ["B_duoi"]);
      }
      if (maQuery === "SP_GET2_DD3") {
        return ["D_dau", "D_duoi", "P_dau", "P_duoi", "T_dau", "T_duoi", "B_dau", "B_so2", "B_so3", "B_so4", "B_duoi"];
      }
      if (maQuery === "SP_GET2_BL3") {
        return ["D_dau"].concat(buildLegacyRangeFieldNames("D_so", 2, 17), ["D_duoi", "P_dau"]).concat(buildLegacyRangeFieldNames("P_so", 2, 17), ["P_duoi", "T_dau"]).concat(buildLegacyRangeFieldNames("T_so", 2, 17), ["T_duoi", "B_dau"]).concat(buildLegacyRangeFieldNames("B_so", 2, 26), ["B_duoi"]);
      }
      if (maQuery === "SP_GET3_DD") {
        return ["D_dau", "D_duoi", "P_dau", "P_duoi", "B_dau", "B_so2", "B_so3", "B_duoi"];
      }
      if (maQuery === "SP_GET3_BL") {
        return buildLegacyRangeFieldNames("D_so", 2, 17).concat(["D_duoi"]).concat(buildLegacyRangeFieldNames("P_so", 2, 17), ["P_duoi"]).concat(buildLegacyRangeFieldNames("B_so", 5, 26), ["B_duoi"]);
      }
      if (maQuery === "SP_GET3_DD3") {
        return ["D_dau", "D_duoi", "P_dau", "P_duoi", "T_dau", "T_duoi", "B_dau", "B_so2", "B_so3", "B_duoi"];
      }
      if (maQuery === "SP_GET3_BL3") {
        return buildLegacyRangeFieldNames("D_so", 2, 17).concat(["D_duoi"]).concat(buildLegacyRangeFieldNames("P_so", 2, 17), ["P_duoi"]).concat(buildLegacyRangeFieldNames("T_so", 2, 17), ["T_duoi"]).concat(buildLegacyRangeFieldNames("B_so", 5, 26), ["B_duoi"]);
      }
      return getLegacyAllNormalizedFieldKeys();
  }

  function countLegacyLoaiTimDashParts(text) {
    var clean = String(text || "").trim();
    if (!clean) return 0;
    return clean.split("-").filter(function (part) {
      return String(part || "").trim() !== "";
    }).length;
  }

  function getLegacyLoaiTimPriorityScore(opt) {
    if (!opt) return 0;
    var valueText = String(opt.value || "");
    var valueTail = valueText;
    var commaPos = valueText.indexOf(",");
    if (commaPos >= 0) valueTail = valueText.substring(commaPos + 1);
    var fromValue = countLegacyLoaiTimDashParts(valueTail);
    var fromText = countLegacyLoaiTimDashParts(opt.text || "");
    return Math.max(fromValue, fromText);
  }

  function compareTextAsc(a, b) {
    return String(a || "").localeCompare(String(b || ""), "vi", { numeric: true, sensitivity: "base" });
  }

  function compareLegacyLoaiTimPriority(a, b) {
    var scoreA = getLegacyLoaiTimPriorityScore(a);
    var scoreB = getLegacyLoaiTimPriorityScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;

    var lenA = String((a && a.text) || "").length;
    var lenB = String((b && b.text) || "").length;
    if (lenB !== lenA) return lenB - lenA;

    return compareTextAsc((a && a.text) || "", (b && b.text) || "");
  }

  function buildLegacyThQueryTypeOptionsFromLoaiTimRows(rows, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var list = Array.isArray(rows) ? rows : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i] || {};
      var maDuoi = Number(row.ma_duoi|| 0);
      if (maDuoi && maDuoi !== he) continue;
      var maLoai = String(row.ma_loai|| "").trim();
      var value = normalizeLegacyTongHopQueryValue(maLoai, he);
      if (!value) continue;
      if (seen[value]) continue;
      seen[value] = true;
      var text = String(row.MoTa || row.mo_ta || row.mota || value).trim() || value;
      var meta = parseLegacyLoaiTimMeta(value, he);
      out.push({ value: value, text: text, maQuery: meta.maQuery, fieldPart: meta.fieldPart });
    }
    // Keep API/DB order to stay aligned with legacy combo source.
    return out;
  }

  function buildLegacyThGroupOptionsFromTimKiemRows(rows, heThong) {
    var he = Number(heThong || 2) === 3 ? 3 : 2;
    var list = Array.isArray(rows) ? rows : [];
    var out = [];
    var seen = {};
    var lastNoiDungByKieuTim = {};

    for (var li = 0; li < list.length; li += 1) {
      var srcRow = list[li] || {};
      var srcMaDuoi = Number(srcRow.ma_duoi || srcRow.MaDuoi || 0);
      if (srcMaDuoi && srcMaDuoi !== he) continue;
      var srcKieuTim = String(srcRow.kieu_tim || srcRow.KieuTim || "").trim();
      var srcNoiDung = String(srcRow.noi_dung || srcRow.NoiDung || srcRow.dong_nghia || "").trim();
      if (!srcKieuTim || !srcNoiDung) continue;
      // TongHop.php assigns NoiDung in a while-loop, so the last row per KieuTim wins.
      lastNoiDungByKieuTim[srcKieuTim] = srcNoiDung;
    }

    for (var i = 0; i < list.length; i += 1) {
      var row = list[i] || {};
      var maDuoi = Number(row.ma_duoi || row.MaDuoi || 0);
      if (maDuoi && maDuoi !== he) continue;

      var kieuTim = String(row.kieu_tim || row.KieuTim || "").trim();
      var rowNoiDung = String(row.noi_dung || row.NoiDung || row.dong_nghia || "").trim();
      var mappedNoiDung = String(lastNoiDungByKieuTim[kieuTim] || "").trim();
      var noiDung = String(mappedNoiDung || rowNoiDung || "").trim();
      if (!kieuTim || !noiDung) continue;

      var tokens = tokenizeLegacyGroupNumbers(noiDung, heThong);
      if (!tokens.length && rowNoiDung && rowNoiDung !== noiDung) {
        // Fallback to current row value to avoid dropping valid groups when the
        // last KieuTim record is not a numeric token set for this MaDuoi.
        noiDung = rowNoiDung;
        tokens = tokenizeLegacyGroupNumbers(noiDung, heThong);
      }
      if (!tokens.length) continue;

      var idSeed = kieuTim.replace(/[^a-zA-Z0-9_]+/g, "_") + "_" + i;
      var normalizedNoiDung = String(noiDung || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
      var displayText = String(row.dong_nghia || "").trim() || normalizedNoiDung || noiDung;
      var signature = [kieuTim, String(noiDung || "").trim()].join("||");
      if (seen[signature]) continue;
      seen[signature] = true;

      out.push({
        id: "api_nhom_" + idSeed,
        text: displayText,
        kieuTim: kieuTim,
        groupSize: tokens.length,
        sortIndex: i,
        children: [],
        cachIds: kieuTim,
        tCach: displayText,
        searchText: noiDung,
        noiDungDisplay: normalizedNoiDung || noiDung
      });
    }

    return out.sort(function (a, b) {
      var sizeA = Number(a.groupSize || 0);
      var sizeB = Number(b.groupSize || 0);
      if (sizeA !== sizeB) return sizeA - sizeB;
      var idxA = Number(a.sortIndex || 0);
      var idxB = Number(b.sortIndex || 0);
      if (idxA !== idxB) return idxA - idxB;
      return String(a.text || "").localeCompare(String(b.text || ""), "vi", { numeric: true, sensitivity: "base" });
    });
  }

  function getLegacyThGroupSize(group) {
    if (group && Number(group.groupSize || 0) > 0) return Number(group.groupSize || 0);
    if (group && Array.isArray(group.children) && group.children.length > 0) return group.children.length;
    var ids = String((group && group.cachIds) || "").split(",").map(function (s) { return String(s || "").trim(); }).filter(Boolean);
    return ids.length;
  }

  function buildLegacyThGroupBuckets(groups) {
    var list = Array.isArray(groups) ? groups : [];
    var bucketMap = {};
    for (var i = 0; i < list.length; i += 1) {
      var group = list[i];
      var size = getLegacyThGroupSize(group);
      var key = String(size || 0);
      if (!bucketMap[key]) {
        bucketMap[key] = {
          key: key,
          size: size,
          text: "Nhóm " + String(size || 0) + " số",
          groups: []
        };
      }
      bucketMap[key].groups.push(group);
    }
    return Object.keys(bucketMap).map(function (key) {
      return bucketMap[key];
    }).sort(function (a, b) {
      return Number(a.size || 0) - Number(b.size || 0);
    });
  }

  function buildLegacyGroupTreeModel(groups, keyPrefix) {
    var buckets = buildLegacyThGroupBuckets(groups || []);
    var allBucketKeys = [];
    var allGroupKeys = [];
    var bucketToGroupKeys = {};

    var treeData = buckets.map(function (bucket) {
      var bucketKey = String(keyPrefix || "group") + "_bucket_" + String(bucket.key || "0");
      allBucketKeys.push(bucketKey);

      var groupNodes = (bucket.groups || []).map(function (group) {
        var groupId = String(group && group.id != null ? group.id : "");
        var groupKey = String(keyPrefix || "group") + "_group_" + groupId;
        allGroupKeys.push(groupKey);

        return {
          key: groupKey,
          title: String((group && group.text) || groupId),
          isLeaf: true,
          selectable: false,
          disableCheckbox: false
        };
      });

      bucketToGroupKeys[bucketKey] = groupNodes.map(function (node) { return node.key; });

      return {
        key: bucketKey,
        title: String((bucket && bucket.text) || "Nhóm"),
        selectable: true,
        disableCheckbox: false,
        children: groupNodes
      };
    });

    return {
      treeData: treeData,
      allBucketKeys: allBucketKeys,
      allGroupKeys: allGroupKeys,
      bucketToGroupKeys: bucketToGroupKeys
    };
  }

  // BỎ GIỚI HẠN ĐỘ DÀI INPUT: loại bỏ maxLength, slice, substring, .substr trên các input số, dự đoán, v.v.
  // Đảm bảo các input liên quan số, dự đoán, Số Chủ, Dự Đoán, txtSo... không bị giới hạn độ dài
  // Đã loại bỏ slice(0, N), maxLength, substring(0, N) ở các vùng sau:
  // - formatSoChuInput
  // - các input React/Antd (Input, InputNumber)
  // - các input HTML (txtSo, dự đoán...)
  // Nếu còn input nào bị giới hạn, hãy báo lại cụ thể để xử lý triệt để.
  function formatSoChuInput(value) {
    // Không giới hạn độ dài, chỉ loại ký tự không phải số
    var digits = String(value || "").replace(/\D/g, "");
    var pairs = digits.match(/\d{1,2}/g) || [];
    return pairs.join("-");
  }

  function sanitizeSheetName(name) {
    var out = String(name || "Sheet").replace(/[\\\/?*\[\]:]/g, " ").trim();
    if (!out) out = "Sheet";
    // Excel sheet name vẫn giới hạn 31 ký tự, giữ lại cho xuất file Excel
    if (out.length > 31) out = out.slice(0, 31);
    return out;
  }

  function toExcelCellValue(value) {
    if (value == null) return "";
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (Array.isArray(value)) {
      return value.map(function (item) { return toExcelCellValue(item); }).join("\n");
    }
    if (typeof value === "object") {
      var extracted = extractExportTextFromNode(value);
      if (extracted) return extracted;
      try {
        return JSON.stringify(value);
      } catch (_jsonErr) {
        return "";
      }
    }
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

  function withMultiSortColumns(columns) {
    var src = Array.isArray(columns) ? columns : [];
    var total = src.length;

    function normalizeSorter(sorter, multiple) {
      if (!sorter) return sorter;
      if (typeof sorter === "function") {
        return { compare: sorter, multiple: multiple };
      }
      if (sorter === true) {
        return { multiple: multiple };
      }
      if (typeof sorter === "object") {
        if (sorter.multiple != null) return sorter;
        var nextSorter = {};
        Object.keys(sorter).forEach(function (k) { nextSorter[k] = sorter[k]; });
        nextSorter.multiple = multiple;
        return nextSorter;
      }
      return sorter;
    }

    function mapColumns(list) {
      var len = list.length;
      return list.map(function (col, idx) {
        if (!col || typeof col !== "object") return col;
        var nextCol = {};
        Object.keys(col).forEach(function (k) { nextCol[k] = col[k]; });
        var multiple = Math.max(1, len - idx);
        if (nextCol.sorter) {
          nextCol.sorter = normalizeSorter(nextCol.sorter, multiple);
        }
        if (Array.isArray(nextCol.children) && nextCol.children.length > 0) {
          nextCol.children = mapColumns(nextCol.children);
        }
        return nextCol;
      });
    }

    if (!total) return src;
    return mapColumns(src);
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

  function downloadArrayBufferAsFile(fileName, bytes, mimeType) {
    var blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
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
    var _aa1 = useState(false), autoUpdateProgressVisible = _aa1[0], setAutoUpdateProgressVisible = _aa1[1];
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
    var _an = useState(2), legacyHeThong = _an[0], setLegacyHeThong = _an[1];
    var _ao = useState({ D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, T_dau: true, T_duoi: true, B_dau: true, B_duoi: true }), legacyLocMap = _ao[0], setLegacyLocMap = _ao[1];
    var _ao1 = useState(getLegacySlrPreferredQueryValue(2)), legacySlrQueryValue = _ao1[0], setLegacySlrQueryValue = _ao1[1];
    var _ap = useState("C_D"), legacyCdMode = _ap[0], setLegacyCdMode = _ap[1];
    var _aq = useState(1), legacyRankFrom = _aq[0], setLegacyRankFrom = _aq[1];
    var _ar = useState(20), legacyRankTo = _ar[0], setLegacyRankTo = _ar[1];
    var _ab1 = useState(500), legacyNgayChay = _ab1[0], setLegacyNgayChay = _ab1[1];
    var _ab2 = useState(false), legacyTheoThu = _ab2[0], setLegacyTheoThu = _ab2[1];
    var _ab2k = useState(false), legacyTheoKy = _ab2k[0], setLegacyTheoKy = _ab2k[1];
    var _ab3 = useState(true), legacyChkHieu = _ab3[0], setLegacyChkHieu = _ab3[1];
    var _ab4 = useState(""), legacyNbGroupSize = _ab4[0], setLegacyNbGroupSize = _ab4[1];
    var _ab5 = useState(false), legacyNbTheoKy = _ab5[0], setLegacyNbTheoKy = _ab5[1];

    // --- SLR Auto-filter state (C1–C6) ---
    var _slr_af1 = useState(0), legacySlrAutoC1Gap = _slr_af1[0], setLegacySlrAutoC1Gap = _slr_af1[1];
    var _slr_af2 = useState(0), legacySlrAutoC1First = _slr_af2[0], setLegacySlrAutoC1First = _slr_af2[1];
    var _slr_af3 = useState([]), legacySlrAutoC2Gap = _slr_af3[0], setLegacySlrAutoC2Gap = _slr_af3[1];
    var _slr_af4 = useState([]), legacySlrAutoC3First = _slr_af4[0], setLegacySlrAutoC3First = _slr_af4[1];
    var _slr_af5 = useState(-1), legacySlrAutoC4Gap = _slr_af5[0], setLegacySlrAutoC4Gap = _slr_af5[1];
    var _slr_af6 = useState(-1), legacySlrAutoC5First = _slr_af6[0], setLegacySlrAutoC5First = _slr_af6[1];
    var _slr_af7 = useState(false), legacySlrAutoC6Both = _slr_af7[0], setLegacySlrAutoC6Both = _slr_af7[1];
    var _slr_autoRows = useState([]), legacySlrAutoRows = _slr_autoRows[0], setLegacySlrAutoRows = _slr_autoRows[1];
    var _slr_autoSummary = useState(""), legacySlrAutoSummary = _slr_autoSummary[0], setLegacySlrAutoSummary = _slr_autoSummary[1];
    var _slr_autoDebugLogs = useState([]), legacySlrAutoDebugLogs = _slr_autoDebugLogs[0], setLegacySlrAutoDebugLogs = _slr_autoDebugLogs[1];
    // --- SLR Auto-run custom conditions ---
    var _slr_autoSttRange = useState(4), legacySlrAutoSttRange = _slr_autoSttRange[0], setLegacySlrAutoSttRange = _slr_autoSttRange[1];
    var _slr_autoNoHitDays = useState(14), legacySlrAutoNoHitDays = _slr_autoNoHitDays[0], setLegacySlrAutoNoHitDays = _slr_autoNoHitDays[1];
    var _slr_autoNamWeeks = useState(2), legacySlrAutoNamWeeks = _slr_autoNamWeeks[0], setLegacySlrAutoNamWeeks = _slr_autoNamWeeks[1];

    // --- SLR Auto-filtered rows (kept for display binding) ---
    var legacySlrAutoFilteredRows = useMemo(function () {
      return Array.isArray(legacySlrAutoRows) ? legacySlrAutoRows : [];
    }, [legacySlrAutoRows]);

        function getLegacySlrHitByMode(row, mode) {
          var m = String(mode || "C_D").toUpperCase();
          var rec = row || {};
          if (m === "C") return Number(rec.cAll || 0);
          if (m === "D") return Number(rec.dAll || 0);
          if (m === "2C") return Number(rec.pAll || 0);
          return Number(rec.cAll || 0) + Number(rec.dAll || 0);
        }

        function flattenLegacySlrWeekCells(weekRows) {
          var src = Array.isArray(weekRows) ? weekRows : [];
          var keys = ["cn", "t7", "t6", "t5", "t4", "t3", "t2"];
          var out = [];
          for (var wi = 0; wi < src.length; wi += 1) {
            var wr = src[wi] || {};
            for (var ki = 0; ki < keys.length; ki += 1) {
              var cell = wr[keys[ki]];
              if (!cell || !cell.date) continue;
              out.push({
                weekIdx: wi,
                key: keys[ki],
                cell: cell,
                ymd: normalizeLegacyDateYmd(cell.date)
              });
            }
          }
          out = out.filter(function (x) { return !!x.ymd; });
          out.sort(function (a, b) {
            return String(b.ymd).localeCompare(String(a.ymd), "vi", { numeric: true, sensitivity: "base" });
          });
          return out;
        }

        function getLegacySlrWeekKeyFromDate(dateValue) {
          var label = legacySlrThuLabelFromYmd(normalizeLegacyDateYmd(dateValue));
          if (label === "CN") return "cn";
          if (label === "T7") return "t7";
          if (label === "T6") return "t6";
          if (label === "T5") return "t5";
          if (label === "T4") return "t4";
          if (label === "T3") return "t3";
          if (label === "T2") return "t2";
          return "";
        }

        function findLegacySlrReferenceCellInfo(weekRows, targetDate) {
          var src = Array.isArray(weekRows) ? weekRows : [];
          if (!src.length) return null;
          var keys = ["cn", "t7", "t6", "t5", "t4", "t3", "t2"];
          var targetYmd = normalizeLegacyDateYmd(targetDate);
          if (targetYmd) {
            for (var wi = 0; wi < src.length; wi += 1) {
              var wr = src[wi] || {};
              for (var ki = 0; ki < keys.length; ki += 1) {
                var key = keys[ki];
                var cell = wr[key];
                if (!cell || !cell.date) continue;
                if (normalizeLegacyDateYmd(cell.date) === targetYmd) {
                  return { weekIdx: wi, key: key, cell: cell, ymd: targetYmd };
                }
              }
            }
          }
          var fallbackKey = getLegacySlrWeekKeyFromDate(targetDate);
          if (fallbackKey) {
            for (var fwi = 0; fwi < src.length; fwi += 1) {
              var fwr = src[fwi] || {};
              var fcell = fwr[fallbackKey];
              if (fcell && fcell.date) {
                return { weekIdx: fwi, key: fallbackKey, cell: fcell, ymd: normalizeLegacyDateYmd(fcell.date) };
              }
            }
          }
          return null;
        }

        function buildLegacySlrCellRangeCache(cell, rankTo, mode) {
          var maxRank = Math.max(1, Number(rankTo || 1));
          var m = String(mode || "C_D").toUpperCase();
          var hitMark = new Array(maxRank + 1).fill(0);
          var namHitMark = new Array(maxRank + 1).fill(0);
          var presentMark = new Array(maxRank + 1).fill(0);
          var cNamArr = new Array(maxRank + 1).fill(0);
          var dNamArr = new Array(maxRank + 1).fill(0);
          var cBacArr = new Array(maxRank + 1).fill(0);
          var dBacArr = new Array(maxRank + 1).fill(0);
          var rows = Array.isArray(cell && cell.rows) ? cell.rows : [];
          for (var i = 0; i < rows.length; i += 1) {
            var r = rows[i] || {};
            var stt = Number(r.stt || 0);
            if (stt < 1 || stt > maxRank) continue;
            presentMark[stt] = 1;
            if (getLegacySlrHitByMode(r, mode) > 0) hitMark[stt] = 1;
            var namHit = 0;
            if (m === "C") namHit = Number(r.cNam || 0);
            else if (m === "D") namHit = Number(r.dNam || 0);
            else if (m === "2C") namHit = Number(r.pNam || 0);
            else namHit = Number(r.cNam || 0) + Number(r.dNam || 0);
            if (namHit > 0) namHitMark[stt] = 1;
            // actual hit counts for weekly stats display (cNam == pNam for 2C mode)
            cNamArr[stt] = Number(r.cNam || 0);
            dNamArr[stt] = Number(r.dNam || 0);
            cBacArr[stt] = Number(r.cBac || 0);
            dBacArr[stt] = Number(r.dBac || 0);
          }
          var hitPrefix = new Array(maxRank + 1).fill(0);
          var namHitPrefix = new Array(maxRank + 1).fill(0);
          var presentPrefix = new Array(maxRank + 1).fill(0);
          var cNamPrefix = new Array(maxRank + 1).fill(0);
          var dNamPrefix = new Array(maxRank + 1).fill(0);
          var cBacPrefix = new Array(maxRank + 1).fill(0);
          var dBacPrefix = new Array(maxRank + 1).fill(0);
          for (var ri = 1; ri <= maxRank; ri += 1) {
            hitPrefix[ri] = hitPrefix[ri - 1] + hitMark[ri];
            namHitPrefix[ri] = namHitPrefix[ri - 1] + namHitMark[ri];
            presentPrefix[ri] = presentPrefix[ri - 1] + presentMark[ri];
            cNamPrefix[ri] = cNamPrefix[ri - 1] + cNamArr[ri];
            dNamPrefix[ri] = dNamPrefix[ri - 1] + dNamArr[ri];
            cBacPrefix[ri] = cBacPrefix[ri - 1] + cBacArr[ri];
            dBacPrefix[ri] = dBacPrefix[ri - 1] + dBacArr[ri];
          }
          return {
            hitPrefix: hitPrefix,
            namHitPrefix: namHitPrefix,
            presentPrefix: presentPrefix,
            cNamPrefix: cNamPrefix,
            dNamPrefix: dNamPrefix,
            cBacPrefix: cBacPrefix,
            dBacPrefix: dBacPrefix
          };
        }

        function isLegacySlrNoHitRangeCached(cache, sttFrom, sttTo) {
          var from = Math.max(1, Number(sttFrom || 1));
          var to = Math.max(from, Number(sttTo || from));
          var needed = to - from + 1;
          var present = Number((cache.presentPrefix[to] || 0) - (cache.presentPrefix[from - 1] || 0));
          if (present < needed) return false;
          var hit = Number((cache.hitPrefix[to] || 0) - (cache.hitPrefix[from - 1] || 0));
          return hit === 0;
        }

        function getLegacySlrNamHitCountRangeCached(cache, sttFrom, sttTo) {
          var from = Math.max(1, Number(sttFrom || 1));
          var to = Math.max(from, Number(sttTo || from));
          return Number((cache.namHitPrefix[to] || 0) - (cache.namHitPrefix[from - 1] || 0));
        }

        function getLegacySlrHitCountRangeCached(cache, sttFrom, sttTo) {
          var from = Math.max(1, Number(sttFrom || 1));
          var to = Math.max(from, Number(sttTo || from));
          return Number((cache.hitPrefix[to] || 0) - (cache.hitPrefix[from - 1] || 0));
        }

        function getLegacySlrRangeCachedCount(prefix, sttFrom, sttTo) {
          if (!prefix || !prefix.length) return 0;
          var f = Math.max(1, Number(sttFrom || 1));
          var t = Math.max(f, Number(sttTo || f));
          var maxIdx = prefix.length - 1;
          t = Math.min(t, maxIdx);
          return Math.max(0, Number((prefix[t] || 0) - (prefix[Math.min(f - 1, maxIdx)] || 0)));
        }

        function getLegacySlrTongNamZeroWeekStreak(weekRows) {
          var src = Array.isArray(weekRows) ? weekRows : [];
          var streak = 0;
          var maxStreak = 0;
          for (var i = 0; i < src.length; i += 1) {
            var tongNam = Number((src[i] && src[i].tongNam) || 0);
            if (tongNam === 0) {
              streak += 1;
              if (streak > maxStreak) maxStreak = streak;
            } else {
              streak = 0;
            }
          }
          return maxStreak;
        }

        // --- SLR Auto-filter runner (quét theo Loại Tìm và điều kiện STT/Ngày) ---
        async function runLegacySlrAutoFilter(options) {
          options = options || {};
          var silent = !!options.silent;
          if (legacySlrAutoRunning) {
            if (!silent) canhbao("Đang chạy lọc tự động, vui lòng chờ hoàn tất");
            return;
          }
          var completedOk = false;
          var runLogs = [];
          function pushAutoLog(message) {
            var line = "[" + dateFormat(new Date(), "hh:MM:ss") + "] " + String(message || "");
            runLogs.push(line);
            if (runLogs.length > 600) runLogs = runLogs.slice(runLogs.length - 600);
            if (runLogs.length === 1 || runLogs.length % 6 === 0) {
              setLegacySlrAutoDebugLogs(runLogs.slice());
            }
            try { console.log("[SLR-AUTO]", line); } catch (_e) {}
          }

          pushAutoLog("Bắt đầu chạy tự động SLR");
          setLegacySlrAutoRunning(true);
          setLoading(true);
          setProgress(15);
          try {
            var timkiemRows = [];
            try {
              timkiemRows = await fetchRowsFromGetTableData("kqxs_timkiem", legacyHeThong);
              pushAutoLog("Tải timkiemRows: " + (timkiemRows && timkiemRows.length || 0) + " dòng");
            } catch (_slrAutoTkErr) {
              timkiemRows = [];
              pushAutoLog("Không tải được timkiemRows, dùng mảng rỗng");
            }

            var validOptionValues = (legacySlrQueryTypeOptions || []).map(function (item) {
              return String((item && item.value) || "");
            }).filter(Boolean);
            var rawSelected = Array.isArray(legacySlrSelectedQueryTypes) && legacySlrSelectedQueryTypes.length
              ? legacySlrSelectedQueryTypes.filter(function (v) {
                  return validOptionValues.indexOf(String(v || "")) >= 0;
                })
              : [];
            var selectedQueryValues = (rawSelected.length ? rawSelected : [getLegacySpecialQueryTypeForTab("slr").value])
              .map(function (v) {
                return parseLegacyLoaiTimMeta(v, legacyHeThong).rawValue;
              }).filter(Boolean);
            var resultRows = [];
            var dataByQuery = {};

            var sttWindowSize = Math.max(1, Number(legacySlrAutoSttRange || 4));
            var noHitDays = Math.max(1, Number(legacySlrAutoNoHitDays || 14));
            var tongNamWeeks = Math.max(1, Number(legacySlrAutoNamWeeks || 2));
            var modeNow = String(legacyCdMode || "C_D").toUpperCase();
            pushAutoLog("Tham số: LoạiTìm=" + selectedQueryValues.length + ", STTWindow=" + sttWindowSize + ", NoHitDays=" + noHitDays + ", NamNoHitWeeks=" + tongNamWeeks + ", Mode=" + modeNow);

            function findNearestHitInfoForRange(cells, cellCaches, sttFrom, sttTo) {
              if (typeof console !== 'undefined') {
                console.log('[FIND-NEAREST] sttFrom=' + sttFrom + ', sttTo=' + sttTo + ', cells.length=' + cells.length);
              }
              for (var idx = 0; idx < cells.length; idx += 1) {
                var cache = cellCaches[idx] || {};
                var hitCount = getLegacySlrHitCountRangeCached(cache, sttFrom, sttTo);
                if (typeof console !== 'undefined') {
                  console.log('[FIND-NEAREST-CHECK] idx=' + idx + ', hitCount=' + hitCount + ', hasPrefix=' + !!cache.hitPrefix);
                }
                if (hitCount > 0) {
                  var cell = cells[idx] && cells[idx].cell || {};
                  if (typeof console !== 'undefined') {
                    console.log('[FIND-NEAREST-FOUND] idx=' + idx + ', date=' + (cell && cell.date) + ', hitCount=' + hitCount);
                  }
                  return {
                    idx: idx,
                    date: String((cell && cell.date) || "")
                  };
                }
              }
              if (typeof console !== 'undefined') {
                console.log('[FIND-NEAREST-NOTFOUND] returning null');
              }
              return null;
            }

            function buildAutoRowForSttRange(args) {
              var sttFrom = Number(args && args.sttFrom || 0);
              var sttTo = Number(args && args.sttTo || 0);
              var qv = String(args && args.qv || "");
              var queryLabel = String(args && args.queryLabel || qv);
              var currentDateText = String(args && args.currentDateText || "").trim();
              var weekRows = Array.isArray(args && args.weekRows) ? args.weekRows : [];
              var cells = Array.isArray(args && args.cells) ? args.cells : [];
              var cellCaches = Array.isArray(args && args.cellCaches) ? args.cellCaches : [];
              var noHitDays = Math.max(1, Number(args && args.noHitDays || 1));
              var tongNamWeeks = Math.max(1, Number(args && args.tongNamWeeks || 1));
              var modeNow = String(args && args.modeNow || "C_D").toUpperCase();
              var rankTo = Math.max(sttTo, Number(args && args.rankTo || sttTo));
              var rowKeyPrefix = String(args && args.rowKeyPrefix || "slr_auto");

              // Count current consecutive no-hit days from newest backward for this STT range.
              var noHitDaysCurrent = 0;
              for (var cni = 0; cni < cells.length; cni += 1) {
                if (isLegacySlrNoHitRangeCached(cellCaches[cni], sttFrom, sttTo)) {
                  noHitDaysCurrent += 1;
                } else {
                  break;
                }
              }

              var streak = 0;
              var endIdx = -1;
              for (var ci = 0; ci < cells.length; ci += 1) {
                if (isLegacySlrNoHitRangeCached(cellCaches[ci], sttFrom, sttTo)) {
                  streak += 1;
                  if (streak >= noHitDays) {
                    endIdx = ci;
                    break;
                  }
                } else {
                  streak = 0;
                }
              }
              if (endIdx < 0) return null;

              var startIdx = endIdx - noHitDays + 1;
              var matchedWindow = cells.slice(startIdx, endIdx + 1);
              if (!matchedWindow || !matchedWindow.length) return null;

              var weekNamTotals = {};
              var weekCNamTotals = {};
              var weekDNamTotals = {};
              var weekCBacTotals = {};
              var weekDBacTotals = {};
              for (var wi = 0; wi < cells.length; wi += 1) {
                var wk = Number(cells[wi] && cells[wi].weekIdx || 0);
                if (!weekNamTotals[wk]) {
                  weekNamTotals[wk] = 0;
                  weekCNamTotals[wk] = 0;
                  weekDNamTotals[wk] = 0;
                  weekCBacTotals[wk] = 0;
                  weekDBacTotals[wk] = 0;
                }
                var cacheWi = cellCaches[wi];
                weekNamTotals[wk] += getLegacySlrHitCountRangeCached(cacheWi, sttFrom, sttTo);
                weekCNamTotals[wk] += getLegacySlrRangeCachedCount(cacheWi.cNamPrefix, sttFrom, sttTo);
                weekDNamTotals[wk] += getLegacySlrRangeCachedCount(cacheWi.dNamPrefix, sttFrom, sttTo);
                weekCBacTotals[wk] += getLegacySlrRangeCachedCount(cacheWi.cBacPrefix, sttFrom, sttTo);
                weekDBacTotals[wk] += getLegacySlrRangeCachedCount(cacheWi.dBacPrefix, sttFrom, sttTo);
              }

              var weekNoHitStreak = 0;
              var weekNoHitMax = 0;
              for (var wri = 0; wri < weekRows.length; wri += 1) {
                var namTotal = Number(weekNamTotals[wri] || 0);
                if (namTotal === 0) {
                  weekNoHitStreak += 1;
                  if (weekNoHitStreak > weekNoHitMax) weekNoHitMax = weekNoHitStreak;
                } else {
                  break;
                }
              }
              if (weekNoHitMax <= tongNamWeeks) return null;

              var rowWeekSummaryRows = buildLegacySlrAutoWeekSummaryFromTotals(modeNow, weekRows.length, weekCNamTotals, weekDNamTotals, weekCBacTotals, weekDBacTotals);
              var latestCell = matchedWindow[0].cell || {};
              var oldestCell = matchedWindow[matchedWindow.length - 1].cell || {};
              var nearestBaseHit = findNearestHitInfoForRange(cells, cellCaches, sttFrom, sttTo);
              
              // nearestBaseHit.idx là index trong cells array, dùng trực tiếp
              var dataCellIdx = nearestBaseHit ? nearestBaseHit.idx : 0;
              
              var newestCellCache = cellCaches[dataCellIdx] || {};
              var latestCellData = Object.assign({}, (cells[dataCellIdx] && cells[dataCellIdx].cell) || {}, {
                mode: modeNow
              });
              
              // DEBUG LOG
              if (typeof console !== 'undefined') {
                console.log('[AUTO-MERGED] STT=' + sttFrom + '-' + sttTo + ', nearestIdx=' + (nearestBaseHit ? nearestBaseHit.idx : 'null') + ', dataCellIdx=' + dataCellIdx + ', cells.length=' + cells.length + ', cache=' + Object.keys(newestCellCache).join(','));
              }
              
              // Tính latestCellStats từ cell có dữ liệu thực cho range
              var latestCellStats = {
                date: String((latestCellData && latestCellData.date) || ""),
                cNam: getLegacySlrRangeCachedCount(newestCellCache.cNamPrefix, sttFrom, sttTo),
                dNam: getLegacySlrRangeCachedCount(newestCellCache.dNamPrefix, sttFrom, sttTo),
                cBac: getLegacySlrRangeCachedCount(newestCellCache.cBacPrefix, sttFrom, sttTo),
                dBac: getLegacySlrRangeCachedCount(newestCellCache.dBacPrefix, sttFrom, sttTo)
              };
              
              if (typeof console !== 'undefined') {
                console.log('[AUTO-STATS] cNam=' + latestCellStats.cNam + ', dNam=' + latestCellStats.dNam + ', cBac=' + latestCellStats.cBac + ', dBac=' + latestCellStats.dBac);
              }
              if (latestCellData && Array.isArray(latestCellData.rows)) {
                latestCellData.rows = latestCellData.rows.filter(function (rowItem) {
                  var sttVal = Number(rowItem && rowItem.stt || 0);
                  return sttVal >= sttFrom && sttVal <= sttTo;
                });
              }

              var expandedHint = "";
              if (sttTo + 1 <= rankTo) {
                var nearestBase = nearestBaseHit;
                var nearestExpanded = findNearestHitInfoForRange(cells, cellCaches, sttFrom, sttTo + 1);
                if (nearestExpanded && (!nearestBase || nearestExpanded.idx < nearestBase.idx)) {
                  expandedHint = "STT " + sttFrom + "-" + (sttTo + 1) + " Xổ ngày " + String(nearestExpanded.date || "");
                }
              }

              return {
                key: rowKeyPrefix + "_" + qv + "_" + sttFrom + "_" + sttTo,
                queryValue: qv,
                queryLabel: queryLabel,
                sttFrom: sttFrom,
                sttTo: sttTo,
                noHitDays: noHitDays,
                noHitDaysCurrent: noHitDaysCurrent,
                fromDate: currentDateText || String(latestCell.date || ""),
                toDate: String((nearestBaseHit && nearestBaseHit.date) || oldestCell.date || ""),
                tongNamWeeks: tongNamWeeks,
                tongNamZeroWeekStreak: weekNoHitMax,
                weekSummaryRows: rowWeekSummaryRows,
                latestCellData: latestCellData,
                latestCellStats: latestCellStats,
                mode: modeNow,
                noHitHintText: expandedHint
              };
            }

            function appendMergedSlrRows(baseRows, args) {
              var rows = Array.isArray(baseRows) ? baseRows.slice() : [];
              if (rows.length < 2) return rows;
              var finalRows = [];
              var i = 0;
              while (i < rows.length) {
                var start = i;
                var end = i;
                while (end + 1 < rows.length
                  && String(rows[end + 1].queryValue || "") === String(rows[end].queryValue || "")
                  && Number(rows[end + 1].sttFrom || 0) === Number(rows[end].sttFrom || 0) + 1
                  && Number(rows[end + 1].sttTo || 0) === Number(rows[end].sttTo || 0) + 1) {
                  end += 1;
                }
                if (end > start) {
                  var mergedFrom = Number(rows[start].sttFrom || 0);
                  var mergedTo = Number(rows[end].sttTo || 0);
                  var mergedRow = buildAutoRowForSttRange(Object.assign({}, args || {}, {
                    sttFrom: mergedFrom,
                    sttTo: mergedTo,
                    rowKeyPrefix: "slr_auto_merge"
                  }));
                  if (mergedRow) {
                    mergedRow.isMergedAuto = true;
                    finalRows.push(mergedRow);
                  } else {
                    // Không tạo merged fallback giả theo STT rộng vì sẽ làm sai số chính/đảo
                    // (ví dụ STT 1-20 nhưng chỉ hiện số của segment 1-4). Giữ nguyên segment rows.
                    finalRows = finalRows.concat(rows.slice(start, end + 1));
                  }
                } else {
                  finalRows.push(rows[start]);
                }
                i = end + 1;
              }
              return finalRows;
            }

            for (var qi = 0; qi < selectedQueryValues.length; qi += 1) {
              if (qi > 0 && qi % 2 === 0) {
                // Nhả event loop định kỳ để tránh UI bị treo (popup Wait/Exit).
                await sleepMs(0);
              }
              if (selectedQueryValues.length > 0) {
                var loopPct = 15 + Math.round((qi / selectedQueryValues.length) * 75);
                setProgress(Math.max(15, Math.min(95, loopPct)));
              }
              var qv = String(selectedQueryValues[qi] || "").trim();
              if (!qv) {
                pushAutoLog("Bỏ qua query rỗng tại index " + qi);
                continue;
              }
              pushAutoLog("Loại Tìm " + (qi + 1) + "/" + selectedQueryValues.length + ": " + qv);
              if (!dataByQuery[qv]) {
                dataByQuery[qv] = await loadLegacySpecialDataByQuery(qv);
              }
              var dataMien = dataByQuery[qv];
              if (!dataMien || !dataMien.length) {
                pushAutoLog("- Rớt: không có dataMien");
                continue;
              }

              var runtimeCfg = buildLegacySoLauRaRuntimeConfig(dataMien, timkiemRows, qv);
              var rankFrom = Math.max(1, Number(legacyRankFrom || 1));
              var rankTo = Math.max(rankFrom, Number(legacyRankTo || 20));
              var maxStart = rankTo - sttWindowSize + 1;
              if (maxStart < rankFrom) {
                pushAutoLog("- Rớt: phạm vi STT không hợp lệ (" + rankFrom + "->" + rankTo + ")");
                continue;
              }

              var weekRows = buildLegacySoLauRaWeekRows(runtimeCfg.weekCfg);
              var cells = flattenLegacySlrWeekCells(weekRows);
              var queryItem = (legacySlrQueryTypeOptions || []).find(function (item) {
                return String(item && item.value) === qv;
              });
              var queryLabel = String((queryItem && queryItem.text) || qv);

              if (!weekRows.length || !cells.length) {
                pushAutoLog("- Rớt: weekRows/cells rỗng (weekRows=" + weekRows.length + ", cells=" + cells.length + ")");
                continue;
              }
              pushAutoLog("- weekRows=" + weekRows.length + ", cells=" + cells.length + ", queryLabel=" + queryLabel);

              var cellCaches = cells.map(function (c) {
                return buildLegacySlrCellRangeCache(c && c.cell, rankTo, modeNow);
              });
              var rangeChecked = 0;
              var rangeMatched = 0;
              var rangeRejectedByDay = 0;
              var rangeRejectedByWeek = 0;
              var bestWeekStreak = 0;
              var bestDayStreak = 0;
              var queryRows = [];

              for (var sttFrom = rankFrom; sttFrom <= maxStart; sttFrom += 1) {
                if ((sttFrom - rankFrom) > 0 && (sttFrom - rankFrom) % 8 === 0) {
                  // Luồng tính toán STT có thể rất nặng, cần yield để tránh đứng trang.
                  await sleepMs(0);
                }
                rangeChecked += 1;
                var sttTo = sttFrom + sttWindowSize - 1;
                var streak = 0;
                var maxLocalDayStreak = 0;
                var endIdx = -1;
                for (var ci = 0; ci < cells.length; ci += 1) {
                  if (isLegacySlrNoHitRangeCached(cellCaches[ci], sttFrom, sttTo)) {
                    streak += 1;
                    if (streak > maxLocalDayStreak) maxLocalDayStreak = streak;
                    if (streak >= noHitDays) {
                      endIdx = ci;
                      break;
                    }
                  } else {
                    streak = 0;
                  }
                }
                if (maxLocalDayStreak > bestDayStreak) bestDayStreak = maxLocalDayStreak;
                if (endIdx < 0) {
                  rangeRejectedByDay += 1;
                  continue;
                }
                var startIdx = endIdx - noHitDays + 1;
                var matchedWindow = cells.slice(startIdx, endIdx + 1);
                if (!matchedWindow || !matchedWindow.length) {
                  rangeRejectedByDay += 1;
                  continue;
                }

                var weekNamTotals = {};
                var weekNoHitStreak = 0;
                var weekNoHitMax = 0;
                for (var wri = 0; wri < weekRows.length; wri += 1) {
                  var namTotalTmp = 0;
                  for (var wci = 0; wci < cells.length; wci += 1) {
                    if (Number(cells[wci] && cells[wci].weekIdx || -1) !== wri) continue;
                    namTotalTmp += getLegacySlrHitCountRangeCached(cellCaches[wci], sttFrom, sttTo);
                  }
                  weekNamTotals[wri] = namTotalTmp;
                  if (namTotalTmp === 0) {
                    weekNoHitStreak += 1;
                    if (weekNoHitStreak > weekNoHitMax) weekNoHitMax = weekNoHitStreak;
                  } else {
                    break;
                  }
                }
                if (weekNoHitMax > bestWeekStreak) bestWeekStreak = weekNoHitMax;
                if (weekNoHitMax <= tongNamWeeks) {
                  rangeRejectedByWeek += 1;
                  continue;
                }

                rangeMatched += 1;
                var baseRow = buildAutoRowForSttRange({
                  sttFrom: sttFrom,
                  sttTo: sttTo,
                  qv: qv,
                  queryLabel: queryLabel,
                  currentDateText: den_ngay,
                  weekRows: weekRows,
                  cells: cells,
                  cellCaches: cellCaches,
                  noHitDays: noHitDays,
                  tongNamWeeks: tongNamWeeks,
                  modeNow: modeNow,
                  rankTo: rankTo,
                  weekToDate: runtimeCfg.weekCfg && runtimeCfg.weekCfg.toDate,
                  rowKeyPrefix: "slr_auto"
                });
                if (baseRow) queryRows.push(baseRow);
              }
              queryRows = appendMergedSlrRows(queryRows, {
                qv: qv,
                queryLabel: queryLabel,
                currentDateText: den_ngay,
                weekRows: weekRows,
                cells: cells,
                cellCaches: cellCaches,
                noHitDays: noHitDays,
                tongNamWeeks: tongNamWeeks,
                modeNow: modeNow,
                rankTo: rankTo,
                weekToDate: runtimeCfg.weekCfg && runtimeCfg.weekCfg.toDate
              });
              if (queryRows.length) {
                resultRows = resultRows.concat(queryRows);
              }
              var mergedCount = queryRows.filter(function (row) { return !!(row && row.isMergedAuto); }).length;
              if (rangeMatched === 0) {
                pushAutoLog("- Rớt theo STT: checked=" + rangeChecked + ", rejectByDay=" + rangeRejectedByDay + " (bestDayStreak=" + bestDayStreak + "/need=" + noHitDays + "), rejectByWeek=" + rangeRejectedByWeek + " (bestWeekStreak=" + bestWeekStreak + "/need=" + tongNamWeeks + ")");
              } else {
                pushAutoLog("- Quét STT xong: checked=" + rangeChecked + ", matched=" + rangeMatched + ", merged=" + mergedCount + ", rejectByDay=" + rangeRejectedByDay + ", rejectByWeek=" + rangeRejectedByWeek + ", bestDayStreak=" + bestDayStreak + ", bestWeekStreak=" + bestWeekStreak);
              }
            }

            resultRows.sort(function (a, b) {
              var qa = String((a && a.queryLabel) || "");
              var qb = String((b && b.queryLabel) || "");
              var dq = qa.localeCompare(qb, "vi", { numeric: true, sensitivity: "base" });
              if (dq) return dq;
              var ds = Number((a && a.sttFrom) || 0) - Number((b && b.sttFrom) || 0);
              if (ds) return ds;
              return Number((b && b.tongNamZeroWeekStreak) || 0) - Number((a && a.tongNamZeroWeekStreak) || 0);
            });

            var finalAutoRows = resultRows;
            try {
              var previewPack = buildLegacySlrAutoPreviewGroups(resultRows, 0);
              var previewFlatRows = [];
              (previewPack && previewPack.groups || []).forEach(function (g) {
                (g && g.rows || []).forEach(function (r) { previewFlatRows.push(r); });
              });
              if (previewFlatRows.length || !resultRows.length) {
                finalAutoRows = previewFlatRows;
              }
            } catch (mergePreviewErr) {
              console.warn("SLR auto merge-align failed, fallback to raw rows", mergePreviewErr);
            }

            setLegacySlrAutoRows(finalAutoRows);
            legacySortedRowsRef.current["slr_auto"] = null;
            setLegacySlrAutoSummary(
              "Auto: " + finalAutoRows.length + " dòng thỏa điều kiện từ " + selectedQueryValues.length + " loại tìm"
            );
            pushAutoLog("Kết thúc: total raw=" + resultRows.length + ", total sau gộp=" + finalAutoRows.length);
            setLegacySlrAutoDebugLogs(runLogs.slice());
            setActiveAction("legacy_slr");
            setSubTab("legacy_slr");
            setProgress(100);
            completedOk = true;
          } catch (e) {
            console.error(e);
            pushAutoLog("Lỗi: " + String((e && e.message) || e || "unknown"));
            setLegacySlrAutoDebugLogs(runLogs.slice());
            if (!silent) canhbao("Không thể chạy Auto Số Lâu Ra Nam-Bắc");
          } finally {
            setLegacySlrAutoRunning(false);
            setLoading(false);
            if (!completedOk) {
              setTimeout(function () { setProgress(0); }, 600);
            }
          }
        }
    var _av = useState("th"), legacyTool = _av[0], setLegacyTool = _av[1];
    var _av1 = useState("slr"), legacyMainTab = _av1[0], setLegacyMainTab = _av1[1];
    var _av2 = useState("th"), legacySpecialConfigTab = _av2[0], setLegacySpecialConfigTab = _av2[1];
    var _as = useState([]), legacyKttRows = _as[0], setLegacyKttRows = _as[1];
    var _ax = useState({}), legacyKttMatchSet = _ax[0], setLegacyKttMatchSet = _ax[1];
    var _ax1 = useState({}), legacyKttClickMap = _ax1[0], setLegacyKttClickMap = _ax1[1];
    var _ax2 = useState(false), legacyKttHasSearchInput = _ax2[0], setLegacyKttHasSearchInput = _ax2[1];
    var _at = useState([]), legacySlrRows = _at[0], setLegacySlrRows = _at[1];
    var _atb = useState([]), legacySlrWeekRows = _atb[0], setLegacySlrWeekRows = _atb[1];
    var _au = useState([]), legacyNbRows = _au[0], setLegacyNbRows = _au[1];
    var _aub1 = useState("bong"), legacyBongVariant = _aub1[0], setLegacyBongVariant = _aub1[1];
    var _aub2 = useState([]), legacyBongRows = _aub2[0], setLegacyBongRows = _aub2[1];
    var _aub3 = useState([]), legacyBongStatsRows = _aub3[0], setLegacyBongStatsRows = _aub3[1];
    var _aub4 = useState(""), legacyBongSummary = _aub4[0], setLegacyBongSummary = _aub4[1];
    var _nbcw = useState({}), legacyNbColWidths = _nbcw[0], setLegacyNbColWidths = _nbcw[1];
    var legacyNbColWidthsRef = useRef({}); legacyNbColWidthsRef.current = legacyNbColWidths;
    var _slrcw = useState({}), legacySlrColWidths = _slrcw[0], setLegacySlrColWidths = _slrcw[1];
    var legacySlrColWidthsRef = useRef({}); legacySlrColWidthsRef.current = legacySlrColWidths;
    var _ath1 = useState([]), legacyThRows = _ath1[0], setLegacyThRows = _ath1[1];
    var _ath2 = useState([]), legacyThAutoRows = _ath2[0], setLegacyThAutoRows = _ath2[1];
    var _ath3 = useState(toSinhThreshold(12, 12)), legacyThKtn = _ath3[0], setLegacyThKtn = _ath3[1];
    var _ath4 = useState(toSinhThreshold(12, 12)), legacyThKtd = _ath4[0], setLegacyThKtd = _ath4[1];
    var _ath5 = useState(toSinhThreshold(12, 12)), legacyThL2c = _ath5[0], setLegacyThL2c = _ath5[1];
    var _ath6 = useState(toSinhThreshold(52, 52)), legacyThTky = _ath6[0], setLegacyThTky = _ath6[1];
    var _ath7 = useState(toSinhThreshold(7, 7)), legacyThTnd = _ath7[0], setLegacyThTnd = _ath7[1];
    var _ath8 = useState(""), legacyThAutoC1Ngay = _ath8[0], setLegacyThAutoC1Ngay = _ath8[1];
    var _ath9 = useState(""), legacyThAutoC1Ky = _ath9[0], setLegacyThAutoC1Ky = _ath9[1];
    var _ath10 = useState(""), legacyThAutoC2NgayCX = _ath10[0], setLegacyThAutoC2NgayCX = _ath10[1];
    var _ath11 = useState(""), legacyThAutoC2KyCX = _ath11[0], setLegacyThAutoC2KyCX = _ath11[1];
    var _ath12 = useState(""), legacyThAutoC4NgayGap = _ath12[0], setLegacyThAutoC4NgayGap = _ath12[1];
    var _ath13 = useState(""), legacyThAutoC5KyGap = _ath13[0], setLegacyThAutoC5KyGap = _ath13[1];
    var _ath14 = useState(false), legacyThAutoC6Both = _ath14[0], setLegacyThAutoC6Both = _ath14[1];
    var _ath15 = useState(""), legacyThIntersect = _ath15[0], setLegacyThIntersect = _ath15[1];
    var _ath16 = useState({ KQT: true, KQN: false, KTD: false, KQD: false, N2D: false, B2D: false, T2D: false, N3D: false, N2C: false, B2C: false, T2C: false, N3C: false, B3C: false, L2C: false, L3C: false }), legacyThResultMask = _ath16[0], setLegacyThResultMask = _ath16[1];
    var _ath16b = useState(true), legacyThShowKetQua = _ath16b[0], setLegacyThShowKetQua = _ath16b[1];
    var _ath17 = useState(buildLegacyThDefaultQueryTypeDefs(2)), legacyThQueryTypeOptions = _ath17[0], setLegacyThQueryTypeOptions = _ath17[1];
    var _ath18 = useState([buildLegacyThDefaultQueryTypeDefs(2)[0].value]), legacyThSelectedQueryTypes = _ath18[0], setLegacyThSelectedQueryTypes = _ath18[1];
    var _ath19 = useState(buildLegacyThAutoGroupDefs(2, "dao", "")), legacyThGroupOptions = _ath19[0], setLegacyThGroupOptions = _ath19[1];
    var _ath20 = useState(buildLegacyThAutoGroupDefs(2, "dao", "").map(function (g) { return g.id; })), legacyThSelectedGroups = _ath20[0], setLegacyThSelectedGroups = _ath20[1];
    var _ath20b = useState([]), legacyThGroupTrietOptions = _ath20b[0], setLegacyThGroupTrietOptions = _ath20b[1];
    var _ath20c = useState([]), legacyThSelectedGroupsTriet = _ath20c[0], setLegacyThSelectedGroupsTriet = _ath20c[1];
    var _ath20d = useState(false), legacyThUseGroupSource = _ath20d[0], setLegacyThUseGroupSource = _ath20d[1];
    var _ath21 = useState("dao"), legacyThGroupSourceMode = _ath21[0], setLegacyThGroupSourceMode = _ath21[1];
    var _ath22 = useState(""), legacyThCustomGroupsText = _ath22[0], setLegacyThCustomGroupsText = _ath22[1];
    var _ath23 = useState(""), legacyThAutoSummary = _ath23[0], setLegacyThAutoSummary = _ath23[1];
    var _ath24 = useState(false), legacyThAutoRunning = _ath24[0], setLegacyThAutoRunning = _ath24[1];
    var _ath25 = useState(""), legacyThAutoStatus = _ath25[0], setLegacyThAutoStatus = _ath25[1];
    var _ath26 = useState(0), legacyThAutoTaskDone = _ath26[0], setLegacyThAutoTaskDone = _ath26[1];
    var _ath27 = useState(0), legacyThAutoTaskTotal = _ath27[0], setLegacyThAutoTaskTotal = _ath27[1];
    var _ath28 = useState(true), legacyThUseApiSource = _ath28[0], setLegacyThUseApiSource = _ath28[1];
    var _ath29 = useState(false), legacyThUseTrietSource = _ath29[0], setLegacyThUseTrietSource = _ath29[1];
    var _ath30 = useState(false), legacyThApiLoading = _ath30[0], setLegacyThApiLoading = _ath30[1];
    var _ath31 = useState(""), legacyThApiStatus = _ath31[0], setLegacyThApiStatus = _ath31[1];
    var _ath32 = useState([]), legacyThExpandedGroupKeys = _ath32[0], setLegacyThExpandedGroupKeys = _ath32[1];
    var _ath33 = useState([]), legacyThExpandedTrietGroupKeys = _ath33[0], setLegacyThExpandedTrietGroupKeys = _ath33[1];
    var _ath34 = useState(false), legacyThAutoPinnedFullAuto = _ath34[0], setLegacyThAutoPinnedFullAuto = _ath34[1];
    var _ath35 = useState(""), legacyThSoInput = _ath35[0], setLegacyThSoInput = _ath35[1];
    var _ath35b = useState(false), legacyThTkEnabled = _ath35b[0], setLegacyThTkEnabled = _ath35b[1];

      var _ath_rs1 = useState([]), legacyThManualSelectedRowKeys = _ath_rs1[0], setLegacyThManualSelectedRowKeys = _ath_rs1[1];
      var _ath_rs2 = useState([]), legacyThAutoSelectedRowKeys = _ath_rs2[0], setLegacyThAutoSelectedRowKeys = _ath_rs2[1];
      var _ath_im = useState(""), legacyThIntersectManual = _ath_im[0], setLegacyThIntersectManual = _ath_im[1];
    var _sel_kq = useState([]), legacyKetQuaSelectedRowKeys = _sel_kq[0], setLegacyKetQuaSelectedRowKeys = _sel_kq[1];
    var _sel_slr_week = useState([]), legacySlrWeekSelectedRowKeys = _sel_slr_week[0], setLegacySlrWeekSelectedRowKeys = _sel_slr_week[1];
    var _sel_slr_auto = useState([]), legacySlrAutoSelectedRowKeys = _sel_slr_auto[0], setLegacySlrAutoSelectedRowKeys = _sel_slr_auto[1];
    var _sel_nb = useState([]), legacyNbSelectedRowKeys = _sel_nb[0], setLegacyNbSelectedRowKeys = _sel_nb[1];
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
    var taiDuLieuCacheRef = useRef({});
    var legacySortedRowsRef = useRef({});
    var taiDuLieuPendingRef = useRef({});
    var taiDuLieuXemKqCacheRef = useRef({});
    var taiDuLieuXemKqPendingRef = useRef({});
    var dataFetchIntegrityRef = useRef({ incomplete: false, reason: "" });
    var filterResetReadyRef = useRef(false);
    var autoDailyUpdatingRef = useRef(false);
    var legacyThAutoStopRef = useRef(false);

    var legacyNbResizableComponents = useMemo(function() {
      var wRef = legacyNbColWidthsRef;
      var setter = setLegacyNbColWidths;
      return { header: { cell: function legacyNbResizableCell(props) {
        var rk = props["data-rk"], dw = Number(props["data-dw"]) || 80;
        if (!rk) return h("th", props, props.children);
        return h("th", Object.assign({}, props, { style: Object.assign({}, props.style, { position: "relative", userSelect: "none", whiteSpace: "nowrap" }) }), [
          props.children,
          h("span", { key: "__rh", style: { position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize", zIndex: 5 },
            onMouseDown: function(e) {
              e.preventDefault(); e.stopPropagation();
              var sx = e.clientX, sw = wRef.current[rk] || dw;
              function mv(me) { var nw = Math.max(50, sw + me.clientX - sx); setter(function(p) { var n = Object.assign({}, p); n[rk] = nw; return n; }); }
              function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
              document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
            }
          })
        ]);
      }}};
    }, []);

    var legacySlrResizableComponents = useMemo(function() {
      var wRef = legacySlrColWidthsRef;
      var setter = setLegacySlrColWidths;
      return { header: { cell: function legacySlrResizableCell(props) {
        var rk = props["data-rk"], dw = Number(props["data-dw"]) || 80;
        if (!rk) return h("th", props, props.children);
        return h("th", Object.assign({}, props, { style: Object.assign({}, props.style, { position: "relative", userSelect: "none", whiteSpace: "nowrap" }) }), [
          props.children,
          h("span", { key: "__rh", style: { position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize", zIndex: 5 },
            onMouseDown: function(e) {
              e.preventDefault(); e.stopPropagation();
              var sx = e.clientX, sw = wRef.current[rk] || dw;
              function mv(me) { var nw = Math.max(50, sw + me.clientX - sx); setter(function(p) { var n = Object.assign({}, p); n[rk] = nw; return n; }); }
              function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); }
              document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
            }
          })
        ]);
      }}};
    }, []);

    function ensureDataFetchComplete() {
      if (!dataFetchIntegrityRef.current || !dataFetchIntegrityRef.current.incomplete) return true;
      var reason = String(dataFetchIntegrityRef.current.reason || "du_lieu_bi_cat");
      canhbao("Dữ liệu truy xuất chưa đầy đủ (" + reason + "). Vui lòng thu hẹp thời gian hoặc kiểm tra phân trang backend.");
      return false;
    }

    function snapshotThongKeInputs() {
      return {
        so_ky: Number(so_ky || 0),
        lay_so_ky: Number(lay_so_ky || 0),
        dem_be_hon: Number(dem_be_hon || 0),
        kxh_phai_lonhon: Number(kxh_phai_lonhon || 0),
        dem_nho_hon: Number(dem_nho_hon || 0),
        dem_lon_hon: Number(dem_lon_hon || 0),
        dem_to_nho_hon: Number(dem_to_nho_hon || 0),
        kxh_tu: Number(kxh_tu || 0),
        kxh_den: Number(kxh_den || 0),
        kxh_locsau: !!kxh_locsau,
        loai_tim: Number(loai_tim || 0),
        loai_tk: Number(loai_tk || 1),
        mien: String(mien || ""),
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

    var legacyKttFieldLabels = useMemo(function () {
      return {
        D_dau: tt.lgKttFieldDdau,
        D_duoi: tt.lgKttFieldDduoi,
        P_dau: tt.lgKttFieldPdau,
        P_duoi: tt.lgKttFieldPduoi,
        T_dau: tt.lgKttFieldTdau,
        T_duoi: tt.lgKttFieldTduoi,
        B_dau: tt.lgKttFieldBdau,
        B_duoi: tt.lgKttFieldBduoi
      };
    }, [tt]);

    var legacyThResultItems = useMemo(function () {
      return [
        { key: "KQT", code: "KTN", field: "serKQT", label: tt.lgThSeriesKqt },
        { key: "KQN", code: "KQN", field: "serKQN", label: tt.lgThSeriesKqn },
        { key: "KTD", code: "KTD", field: "serKTD", label: tt.lgThSeriesKtd },
        { key: "KQD", code: "KQD", field: "serKQD", label: tt.lgThSeriesKqd },
        { key: "N2D", code: "N2D", field: "serD2D", label: tt.lgThSeriesN2d },
        { key: "B2D", code: "B2D", field: "serB2D", label: tt.lgThSeriesB2d },
        { key: "T2D", code: "T2D", field: "serT2D", label: tt.lgThSeriesT2d },
        { key: "N3D", code: "N3D", field: "serN3D", label: tt.lgThSeriesN3d },
        { key: "N2C", code: "N2C", field: "serD2C", label: tt.lgThSeriesN2c },
        { key: "B2C", code: "B2C", field: "serB2C", label: tt.lgThSeriesB2c },
        { key: "T2C", code: "T2C", field: "serT2C", label: tt.lgThSeriesT2c },
        { key: "N3C", code: "N3C", field: "serN3C", label: tt.lgThSeriesN3c },
        { key: "B3C", code: "B3C", field: "serB3C", label: tt.lgThSeriesB3c },
        { key: "L2C", code: "L2C", field: "serLKD2C", label: tt.lgThSeriesL2c },
        { key: "L3C", code: "L3C", field: "serL3C", label: tt.lgThSeriesL3c }
      ];
    }, [tt]);

    function buildLegacyThResultText(rec) {
      if (!legacyThShowKetQua) return "";
      var lines = [];
      legacyThResultItems.forEach(function (item) {
        if (!legacyThResultMask[item.key]) return;
        lines.push(item.code + ": " + String((rec && rec[item.field]) || ""));
      });
      return lines.length ? lines.join("\n") : "";
    }

    function resolveLegacyTongHopFieldLocList(queryValue) {
      return parseLegacyLoaiTimFieldPart(queryValue || "D_-P_-T_-B_")
        .split("-")
        .map(function (part) { return String(part || "").trim(); })
        .filter(Boolean);
    }

    async function fetchLegacyTongHopRowsFromApi(opts) {
      var cfg = opts || {};
      var cachItems = Array.isArray(cfg.cachItems) ? cfg.cachItems : [];
      if (!cachItems.length) return [];
      var sourceStations = getLegacyTongHopSourceStations(cfg.queryValue);
      if (!sourceStations.length) {
        throw new Error("missing_legacy_station_source");
      }

      var loaded = await lay_ds_dai_xem_kq(sourceStations);
      if (!ensureDataFetchComplete()) {
        throw new Error("legacy_data_incomplete");
      }

      var dataMien = [];
      if (loaded && loaded.MN && Array.isArray(loaded.MN.data)) {
        dataMien = dataMien.concat(loaded.MN.data);
      }
      if (loaded && loaded.MB && Array.isArray(loaded.MB.data)) {
        dataMien = dataMien.concat(loaded.MB.data);
      }
      return buildTongHopMetrics({
        dataMien: dataMien,
        fromDate: tu_ngay,
        toDate: den_ngay,
        heThong: legacyHeThong,
        fieldsLoc: resolveLegacyTongHopFieldLocList(cfg.queryValue),
        cachList: cachItems,
        ktn: legacyThKtn,
        ktd: legacyThKtd,
        l2c: legacyThL2c,
        tky: legacyThTky,
        tnd: legacyThTnd,
        queryValue: cfg.queryValue,
        queryText: cfg.queryText,
        triet: !!cfg.triet
      });
    }

    function getLegacyThFilterConfig() {
      function parseAutoNumberList(raw) {
        var text = String(raw || "").trim();
        if (!text) return [];
        var seen = {};
        return text.split(/[\s,;|]+/).map(function (s) {
          return parseInt(String(s || "").trim(), 10);
        }).filter(function (n) {
          if (isNaN(n) || n <= 0) return false;
          if (seen[n]) return false;
          seen[n] = true;
          return true;
        });
      }

      var c1NgayTop = parseInt(legacyThAutoC1Ngay, 10) || 0;
      var c1KyTop = parseInt(legacyThAutoC1Ky, 10) || 0;
      var c2NgayCX = parseAutoNumberList(legacyThAutoC2NgayCX);
      var c3KyCX = parseAutoNumberList(legacyThAutoC2KyCX);
      var c4NgayGap = String(legacyThAutoC4NgayGap || "").trim() === "" ? -1 : (parseInt(legacyThAutoC4NgayGap, 10) || 0);
      var c5KyGap = String(legacyThAutoC5KyGap || "").trim() === "" ? -1 : (parseInt(legacyThAutoC5KyGap, 10) || 0);
      return {
        c1NgayTop: c1NgayTop,
        c1KyTop: c1KyTop,
        c2NgayCX: c2NgayCX,
        c3KyCX: c3KyCX,
        c4NgayGap: c4NgayGap,
        c5KyGap: c5KyGap,
        c6Both: !!legacyThAutoC6Both
      };
    }

    function hasLegacyThAutoFilter(cfg) {
      var filterCfg = cfg || getLegacyThFilterConfig();
      return filterCfg.c1NgayTop > 0 || filterCfg.c1KyTop > 0 || filterCfg.c2NgayCX.length > 0 || filterCfg.c3KyCX.length > 0 || filterCfg.c4NgayGap >= 0 || filterCfg.c5KyGap >= 0 || filterCfg.c6Both;
    }

    function buildLegacyThIntersectText(rows) {
      var counts = {};
      (rows || []).forEach(function (row) {
        var tokens = String((row && row.boSo) || "").split(/[\s,]+/).filter(Boolean);
        tokens.forEach(function (token) {
          counts[token] = (counts[token] || 0) + 1;
        });
      });
      var maxC = 0;
      Object.keys(counts).forEach(function (key) {
        if (counts[key] > maxC) maxC = counts[key];
      });
      var lines = [];
      for (var c = maxC; c >= 1; c -= 1) {
        var arr = Object.keys(counts).filter(function (key) { return counts[key] === c; }).sort();
        if (arr.length) lines.push("Lần " + c + ": " + arr.join(" "));
      }
      return lines.join("\n");
    }

    function buildLegacyThExportAoa(rows) {
      var srcRows = Array.isArray(rows) ? rows : [];
      var header = (legacyThColumns || []).map(function (col) {
        return String((col && col.title) || "");
      });
      var aoa = [header];

      srcRows.forEach(function (row) {
        var line = [];
        (legacyThColumns || []).forEach(function (col) {
          var dataKey = String((col && col.dataIndex) || "");
          if (!dataKey) {
            line.push("");
            return;
          }
          if (dataKey === "ketQua") {
            line.push(buildLegacyThResultText(row));
            return;
          }
          line.push(row && row[dataKey] != null ? row[dataKey] : "");
        });
        aoa.push(line);
      });

      return aoa;
    }

    function sanitizeLegacyExportFileToken(text) {
      return String(text || "")
        .replace(/[\\\/?*\[\]:]+/g, " ")
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    function getLegacyThSelectedQueryTypeItems() {
      var selected = Array.isArray(legacyThSelectedQueryTypes) ? legacyThSelectedQueryTypes : [];
      var options = Array.isArray(legacyThQueryTypeOptions) ? legacyThQueryTypeOptions : [];
      if (!selected.length || !options.length) return [];

      var optionMap = {};
      options.forEach(function (item) {
        var key = String((item && item.value) || "").trim();
        if (!key) return;
        optionMap[key] = item;
      });

      var seen = {};
      var out = [];
      selected.forEach(function (value) {
        var key = String(value || "").trim();
        if (!key || seen[key] || !optionMap[key]) return;
        seen[key] = true;
        out.push(optionMap[key]);
      });
      return out;
    }

    function buildLegacyThExportFileName(isAutoGrid, rows) {
      if (isAutoGrid) return "TONGHOP_AUTO";
      var queryText = "";
      if (Array.isArray(rows) && rows.length) {
        queryText = String((rows[0] && rows[0].autoQueryTypeText) || "").trim();
      }
      if (!queryText && legacyThSelectedQueryTypes && legacyThSelectedQueryTypes.length) {
        var selectedValue = legacyThSelectedQueryTypes[0];
        var selectedItem = (legacyThQueryTypeOptions || []).find(function (item) {
          return String((item && item.value) || "") === String(selectedValue || "");
        });
        queryText = String((selectedItem && selectedItem.text) || "").trim();
      }
      var token = sanitizeLegacyExportFileToken(queryText);
      return token ? ("TONGHOP_" + token) : "TONGHOP";
    }

    async function exportLegacyThSelectedRows(isAutoGrid) {
      var selectedKeys = isAutoGrid ? (legacyThAutoSelectedRowKeys || []) : (legacyThManualSelectedRowKeys || []);
      var sourceRows = isAutoGrid
        ? (legacySortedRowsRef.current["th_auto"] || legacyThAutoRows || [])
        : (legacySortedRowsRef.current["th_main"] || legacyThRows || []);
      if (!selectedKeys.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }
      var selectedMap = {};
      selectedKeys.forEach(function (k) { selectedMap[String(k)] = true; });
      var exportRows = sourceRows.filter(function (r) { return selectedMap[String(r.key)]; });
      if (!exportRows.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }

      var aoa = buildLegacyThExportAoa(exportRows);
      var payload = {
        fileName: buildLegacyThExportFileName(isAutoGrid, exportRows),
        sheets: [{
          name: isAutoGrid ? "TongHop Auto" : "TongHop",
          aoa: aoa
        }]
      };
      await exportPayloadToFile(payload);
    }

    function getRowValueByDataIndex(row, dataIndex) {
      if (row == null || dataIndex == null) return "";
      if (Array.isArray(dataIndex)) {
        var current = row;
        for (var i = 0; i < dataIndex.length; i += 1) {
          var key = dataIndex[i];
          current = current != null ? current[key] : undefined;
        }
        return current == null ? "" : current;
      }
      return row[dataIndex] == null ? "" : row[dataIndex];
    }

    function htmlToPlainText(html) {
      var src = String(html || "");
      if (!src) return "";
      if (typeof document !== "undefined" && document && typeof document.createElement === "function") {
        var temp = document.createElement("div");
        temp.innerHTML = src;
        return String(temp.textContent || temp.innerText || "").trim();
      }
      return src.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    function extractExportTextFromNode(node) {
      if (node == null) return "";
      if (typeof node === "string") return node;
      if (typeof node === "number") return Number.isFinite(node) ? String(node) : "";
      if (typeof node === "boolean") return node ? "TRUE" : "FALSE";
      if (Array.isArray(node)) {
        return node.map(function (item) { return extractExportTextFromNode(item); }).filter(Boolean).join("\n");
      }
      if (typeof node !== "object") return String(node);

      if (typeof node.__html === "string") {
        return htmlToPlainText(node.__html);
      }

      if (node && node.date != null && Array.isArray(node.rows)) {
        return buildLegacySlrAutoLatestCellText(node);
      }

      if (Array.isArray(node.weekSummaryRows)) {
        return buildLegacySlrAutoWeekSummaryText(node.weekSummaryRows);
      }

      if (node.props && typeof node.props === "object") {
        if (node.props.dangerouslySetInnerHTML && typeof node.props.dangerouslySetInnerHTML.__html === "string") {
          var htmlText = htmlToPlainText(node.props.dangerouslySetInnerHTML.__html);
          if (htmlText) return htmlText;
        }
        var childrenText = extractExportTextFromNode(node.props.children);
        if (childrenText) return childrenText;
      }

      if (Array.isArray(node.children)) {
        var childrenListText = extractExportTextFromNode(node.children);
        if (childrenListText) return childrenListText;
      }

      if (node.label != null || node.text != null || node.value != null) {
        return String(node.label != null ? node.label : (node.text != null ? node.text : node.value));
      }

      try {
        return JSON.stringify(node);
      } catch (_err) {
        return "";
      }
    }

    function flattenExportColumns(columns) {
      var out = [];

      function walk(list) {
        (Array.isArray(list) ? list : []).forEach(function (col) {
          if (!col || typeof col !== "object") return;
          if (Array.isArray(col.children) && col.children.length) {
            walk(col.children);
            return;
          }
          if (col.dataIndex == null) return;
          out.push(col);
        });
      }

      walk(columns);
      return out;
    }

    function resolveExportHeader(col) {
      if (!col) return "";
      var titleText = extractExportTextFromNode(col.title);
      if (titleText) return titleText;
      if (typeof col.dataIndex === "string") return col.dataIndex;
      if (Array.isArray(col.dataIndex)) return col.dataIndex.join(".");
      return String(col.key || "");
    }

    function resolveExportCellValue(col, row, rowIndex) {
      var raw = getRowValueByDataIndex(row, col && col.dataIndex);
      if (col && typeof col.render === "function") {
        try {
          var rendered = col.render(raw, row, rowIndex);
          var renderedText = extractExportTextFromNode(rendered);
          if (renderedText) return renderedText;
        } catch (_renderErr) {
          // Fallback to raw cell value when render depends on runtime-only contexts.
        }
      }

      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "boolean") return raw ? "TRUE" : "FALSE";
      return extractExportTextFromNode(raw);
    }

    function buildGenericExportAoa(columns, rows) {
      var exportColumns = flattenExportColumns(columns || []);
      var header = exportColumns.map(function (col) { return resolveExportHeader(col); });

      var aoa = [header];
      (Array.isArray(rows) ? rows : []).forEach(function (row, rowIndex) {
        var line = exportColumns.map(function (col) {
          return resolveExportCellValue(col, row, rowIndex);
        });
        aoa.push(line);
      });
      return aoa;
    }

    async function exportSelectedRowsByConfig(config) {
      var selectedKeys = (config && config.selectedKeys) || [];
      var sourceRows = (config && config.sourceRows) || [];
      if (!Array.isArray(selectedKeys) || !selectedKeys.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }

      var keyGetter = (config && config.keyGetter) || function (row) {
        return row && row.key != null ? row.key : "";
      };
      var selectedMap = {};
      selectedKeys.forEach(function (k) { selectedMap[String(k)] = true; });

      var exportRows = (Array.isArray(sourceRows) ? sourceRows : []).filter(function (row, idx) {
        return !!selectedMap[String(keyGetter(row, idx))];
      });
      if (!exportRows.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }

      var aoa = buildGenericExportAoa((config && config.columns) || [], exportRows);
      var payload = {
        fileName: sanitizeLegacyExportFileToken((config && config.fileName) || "export_selected") || "export_selected",
        sheets: [{
          name: String((config && config.sheetName) || "Data"),
          aoa: aoa
        }]
      };
      await exportPayloadToFile(payload);
    }

    function filterLegacyThRowsWithConfig(rows, filterCfg) {
      var sourceRows = Array.isArray(rows) ? rows.slice() : [];
      var cfg = filterCfg || getLegacyThFilterConfig();
      if (!hasLegacyThAutoFilter(cfg)) return [];

      var c1NgayMap = {};
      var c1KyMap = {};
      if (cfg.c1NgayTop > 0) {
        sourceRows.slice().sort(function (a, b) {
          return (Number(b.ngayCXHT) || 0) - (Number(a.ngayCXHT) || 0);
        }).slice(0, cfg.c1NgayTop).forEach(function (row) {
          c1NgayMap[row.key] = 1;
        });
      }
      if (cfg.c1KyTop > 0) {
        sourceRows.slice().sort(function (a, b) {
          return (Number(b.kyCXHT) || 0) - (Number(a.kyCXHT) || 0);
        }).slice(0, cfg.c1KyTop).forEach(function (row) {
          c1KyMap[row.key] = 1;
        });
      }

      return sourceRows.filter(function (row) {
        var matchC1 = !!c1NgayMap[row.key] || !!c1KyMap[row.key];
        var matchC2 = cfg.c2NgayCX.length > 0 && cfg.c2NgayCX.indexOf(Number(row.ngayCXHT) || 0) >= 0;
        var matchC3 = cfg.c3KyCX.length > 0 && cfg.c3KyCX.indexOf(Number(row.kyCXHT) || 0) >= 0;
        var matchC4 = cfg.c4NgayGap >= 0 && ((Number(row.ngayCXHT) || 0) > ((Number(row.lauNgay) || 0) + cfg.c4NgayGap));
        var matchC5 = cfg.c5KyGap >= 0 && ((Number(row.kyCXHT) || 0) > ((Number(row.lauKy) || 0) + cfg.c5KyGap));
        var matchC6 = !!cfg.c6Both && ((Number(row.ngayCXHT) || 0) >= (Number(row.lauNgay) || 0)) && ((Number(row.kyCXHT) || 0) >= (Number(row.lauKy) || 0));
        return matchC1 || matchC2 || matchC3 || matchC4 || matchC5 || matchC6;
      });
    }

    function buildLegacyThAutoSummaryText(rows, filterCfg) {
      var cfg = filterCfg || getLegacyThFilterConfig();
      if (!rows || !rows.length) return "";
      var grouped = {};
      var repeated = {};
      rows.forEach(function (row) {
        var q = String(row.autoQueryTypeText || "").trim() || "?";
        var g = String(row.autoGroupText || "").trim() || "?";
        var bo = String(row.boSo || "").trim() || "?";
        if (!grouped[q]) grouped[q] = {};
        if (!grouped[q][g]) grouped[q][g] = {};
        if (!grouped[q][g][bo]) grouped[q][g][bo] = [];
        grouped[q][g][bo].push(row);
        if (!repeated[bo]) repeated[bo] = [];
        repeated[bo].push(q + " | " + g + " | " + (row.noiDung || ""));
      });

      var lines = [];
      lines.push("Auto rows: " + rows.length);
      lines.push("Filter: " + [
        cfg.c1NgayTop > 0 ? ("C1N=" + cfg.c1NgayTop) : "",
        cfg.c1KyTop > 0 ? ("C1K=" + cfg.c1KyTop) : "",
        cfg.c2NgayCX.length ? ("C2=" + cfg.c2NgayCX.join(",")) : "",
        cfg.c3KyCX.length ? ("C3=" + cfg.c3KyCX.join(",")) : "",
        cfg.c4NgayGap >= 0 ? ("C4=" + cfg.c4NgayGap) : "",
        cfg.c5KyGap >= 0 ? ("C5=" + cfg.c5KyGap) : "",
        cfg.c6Both ? "C6=1" : ""
      ].filter(Boolean).join(" | "));

      Object.keys(grouped).sort().forEach(function (queryType) {
        lines.push("[" + queryType + "]");
        Object.keys(grouped[queryType]).sort().forEach(function (groupText) {
          var boMap = grouped[queryType][groupText];
          var details = Object.keys(boMap).sort().map(function (boSo) {
            return boSo + "(" + boMap[boSo].length + ")";
          });
          lines.push("- " + groupText + ": " + details.join(", "));
        });
      });

      var repeatedLines = Object.keys(repeated).sort().filter(function (boSo) {
        return repeated[boSo].length > 1;
      }).map(function (boSo) {
        return boSo + ": " + repeated[boSo].join(" || ");
      });
      if (repeatedLines.length) {
        lines.push("");
        lines.push("Repeated:");
        lines = lines.concat(repeatedLines);
      }
      return lines.join("\n");
    }

    function toggleLegacyThSelection(list, value, checked) {
      var next = Array.isArray(list) ? list.slice() : [];
      if (checked && next.indexOf(value) < 0) next.push(value);
      if (!checked) next = next.filter(function (item) { return item !== value; });
      return next;
    }

    function toggleLegacyThSelectionMany(list, values, checked) {
      var next = Array.isArray(list) ? list.slice() : [];
      var items = Array.isArray(values) ? values.slice() : [];
      var removeMap = {};
      items.forEach(function (v) { removeMap[String(v)] = true; });
      if (checked) {
        items.forEach(function (v) {
          if (next.indexOf(v) < 0) next.push(v);
        });
        return next;
      }
      return next.filter(function (item) { return !removeMap[String(item)]; });
    }

    function sortLegacyThAutoRowsForDisplay(rows) {
      return (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
        var aq = String(a.autoQueryTypeText || "");
        var bq = String(b.autoQueryTypeText || "");
        if (aq !== bq) return aq.localeCompare(bq, "vi", { numeric: true, sensitivity: "base" });
        var ag = String(a.autoGroupText || "");
        var bg = String(b.autoGroupText || "");
        if (ag !== bg) return ag.localeCompare(bg, "vi", { numeric: true, sensitivity: "base" });
        var ab = String(a.boSo || "");
        var bb = String(b.boSo || "");
        if (ab !== bb) return ab.localeCompare(bb, "vi", { numeric: true, sensitivity: "base" });
        var an = Number(a.ngayCXHT) || 0;
        var bn = Number(b.ngayCXHT) || 0;
        if (bn !== an) return bn - an;
        var ak = Number(a.kyCXHT) || 0;
        var bk = Number(b.kyCXHT) || 0;
        if (bk !== ak) return bk - ak;
        return String(a.noiDung || "").localeCompare(String(b.noiDung || ""), "vi", { numeric: true, sensitivity: "base" });
      });
    }

    var legacyThGroupTreeModel = useMemo(function () {
      return buildLegacyGroupTreeModel(legacyThGroupOptions, "main");
    }, [legacyThGroupOptions]);

    var legacyThTrietGroupTreeModel = useMemo(function () {
      return buildLegacyGroupTreeModel(legacyThGroupTrietOptions, "triet");
    }, [legacyThGroupTrietOptions]);

    function groupIdsToTreeKeys(ids, prefix) {
      return (Array.isArray(ids) ? ids : []).map(function (id) {
        return String(prefix || "group") + "_group_" + String(id);
      });
    }

    function treeKeysToGroupIds(keys, prefix) {
      var needle = String(prefix || "group") + "_group_";
      var out = [];
      var seen = {};
      (Array.isArray(keys) ? keys : []).forEach(function (key) {
        var s = String(key || "");
        if (s.indexOf(needle) !== 0) return;
        var id = s.slice(needle.length);
        if (!id || seen[id]) return;
        seen[id] = true;
        out.push(id);
      });
      return out;
    }

    function toggleExpandedKey(expandedKeys, key) {
      var list = Array.isArray(expandedKeys) ? expandedKeys.slice() : [];
      var idx = list.indexOf(key);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(key);
      }
      return list;
    }

    function getCheckedTreeKeys(model, selectedIds, prefix) {
      var selectedMap = {};
      (Array.isArray(selectedIds) ? selectedIds : []).forEach(function (id) {
        selectedMap[String(id)] = true;
      });

      var groupKeys = [];
      (model && Array.isArray(model.allGroupKeys) ? model.allGroupKeys : []).forEach(function (key) {
        var groupId = String(key).replace(String(prefix || "group") + "_group_", "");
        if (selectedMap[groupId]) groupKeys.push(key);
      });
      return groupKeys;
    }

    function extractRowsFromTableDataPayload(payload, tableName) {
      if (Array.isArray(payload)) return payload;
      if (!payload || typeof payload !== "object") return [];
      if (Array.isArray(payload.rows)) return payload.rows;
      if (payload.data) {
        if (Array.isArray(payload.data)) return payload.data;
        if (payload.data && Array.isArray(payload.data.rows)) return payload.data.rows;
        if (payload.data && tableName && Array.isArray(payload.data[tableName])) return payload.data[tableName];
      }
      if (tableName && Array.isArray(payload[tableName])) return payload[tableName];
      return [];
    }

    async function fetchRowsFromGetTableData(tableName, heThong) {
      var token = "";
      try {
        var raw = localStorage.getItem("access-token");
        if (raw) {
          var parsed = JSON.parse(raw);
          token = String((parsed && parsed.state && parsed.state.token) || "");
        }
      } catch (_e) {}

      var headers = { "Content-Type": "application/json", "Accept": "application/json" };
      if (token) headers["csm-token"] = token;

      var endpointCandidates = ["/api/get-table-data", "api/get-table-data"];
      var bodyCandidates = [
        { app_id: "kqxs", obj_name: tableName, e_where: { field: "ma_duoi", type: "eq", value: Number(heThong || 2) } }
      ];

      for (var ei = 0; ei < endpointCandidates.length; ei += 1) {
        for (var bi = 0; bi < bodyCandidates.length; bi += 1) {
          try {
            var resp = await fetch(endpointCandidates[ei], {
              method: "POST",
              credentials: "include",
              headers: headers,
              body: JSON.stringify(bodyCandidates[bi])
            });
            if (!resp || !resp.ok) continue;
            var payload = await resp.json();
            var rows = extractRowsFromTableDataPayload(payload, tableName);
            if (rows.length) return rows;
          } catch (_err) {}
        }
      }

      // Fallback to SDK wrapper if direct endpoint is not available.
      return await fetchRows({
        app_id: "kqxs",
        obj_name: tableName,
        e_where: { field: "id", type: "like", value: "" }
      });
    }

    async function reloadLegacyThApiSource() {
      if (!legacyThUseApiSource) {
        var heLocal = Number(legacyHeThong || 2) === 3 ? 3 : 2;
        var localGroups = buildLegacyThAutoGroupDefs(heLocal, legacyThGroupSourceMode, legacyThCustomGroupsText);
        setLegacyThGroupOptions(localGroups);
        setLegacyThSelectedGroups(function (prev) {
          var selectedMap = {};
          (Array.isArray(prev) ? prev : []).forEach(function (id) { selectedMap[id] = true; });
          var kept = localGroups.filter(function (g) { return !!selectedMap[g.id]; }).map(function (g) { return g.id; });
          return kept.length ? kept : localGroups.map(function (g) { return g.id; });
        });
        setLegacyThGroupTrietOptions([]);
        setLegacyThSelectedGroupsTriet([]);
        setLegacyThApiStatus("Đang dùng nguồn nhóm nội bộ: " + legacyThGroupSourceMode + ".");
        setLegacyThApiLoading(false);
        return;
      }
      setLegacyThApiLoading(true);
      setLegacyThApiStatus("Đang tải Loại Tìm/Nhóm từ get-table-data...");
      try {
        var he = Number(legacyHeThong || 2) === 3 ? 3 : 2;
        var rs = await Promise.all([
          fetchRowsFromGetTableData("kqxs_loaitim", he),
          fetchRowsFromGetTableData("kqxs_timkiem", he),
          fetchRowsFromGetTableData("kqxs_timkiemtr", he)
        ]);
        var loaiRows = rs[0] || [];
        var groupRows = rs[1] || [];
        var groupTrietRows = rs[2] || [];

        var queryTypeOptions = buildLegacyThQueryTypeOptionsFromLoaiTimRows(loaiRows, he);
        if (!queryTypeOptions.length) queryTypeOptions = buildLegacyThDefaultQueryTypeDefs(he);
        setLegacyThQueryTypeOptions(queryTypeOptions);
        setLegacyThSelectedQueryTypes(function (prev) {
          var map = {};
          queryTypeOptions.forEach(function (item) { map[item.value] = true; });
          var kept = (Array.isArray(prev) ? prev : []).filter(function (value) { return !!map[value]; });
          return kept.length ? kept : (queryTypeOptions.length ? [queryTypeOptions[0].value] : []);
        });

        var groups = buildLegacyThGroupOptionsFromTimKiemRows(groupRows, he);
        if (!groups.length) groups = buildLegacyThAutoGroupDefs(he, "dao", "");
        setLegacyThGroupOptions(groups);
        setLegacyThSelectedGroups(function (prev) {
          var selectedMap = {};
          (Array.isArray(prev) ? prev : []).forEach(function (id) { selectedMap[id] = true; });
          var kept = groups.filter(function (g) { return !!selectedMap[g.id]; }).map(function (g) { return g.id; });
          return kept.length ? kept : [];
        });

        var groupsTriet = buildLegacyThGroupOptionsFromTimKiemRows(groupTrietRows, he);
        setLegacyThGroupTrietOptions(groupsTriet);
        setLegacyThSelectedGroupsTriet(function (prev) {
          var selectedMap = {};
          (Array.isArray(prev) ? prev : []).forEach(function (id) { selectedMap[id] = true; });
          var kept = groupsTriet.filter(function (g) { return !!selectedMap[g.id]; }).map(function (g) { return g.id; });
          return kept.length ? kept : [];
        });

        setLegacyThApiStatus("Đã tải: " + queryTypeOptions.length + " loại tìm, " + groups.length + " nhóm số, " + groupsTriet.length + " nhóm triệt.");
      } catch (err) {
        console.error(err);
        setLegacyThApiStatus("Không tải được dữ liệu get-table-data, đã dùng nguồn dự phòng.");
      } finally {
        setLegacyThApiLoading(false);
      }
    }

    function stopLegacyTongHopFullAuto() {
      legacyThAutoStopRef.current = true;
      setLegacyThAutoStatus(tt.lgThAutoStopped + " " + Math.min(legacyThAutoTaskDone + 1, legacyThAutoTaskTotal) + "/" + legacyThAutoTaskTotal);
    }

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

    // All stations in the current region — no loai_tim filter.
    // Legacy tools (KTT, SLR, NamBac, TongHop) must load ALL station data
    // across ALL days; they must NOT inherit ThongKe's "theo ky" (loai_tim===1) filter.
    var dsDaiLegacyCanTai = useMemo(function () {
      return danh_sach_dai.filter(function (d) { return d.mien === mien; })
        .sort(function (a, b) {
          var ka = String(a.thu || "") + "_" + String(a.stt || "");
          var kb = String(b.thu || "") + "_" + String(b.stt || "");
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
    }, [danh_sach_dai, mien]);

    function getLegacyTongHopSourceStations(queryValue) {
      var requiredRoles = getLegacyTongHopRequiredRoles(queryValue, legacyHeThong);
      var seen = {};
      var items = (danh_sach_dai || []).filter(function (d) {
        var mienCode = normalizeLegacyTongHopMienCode(d && d.mien || "");
        var stt = String(d && d.stt || "");
        if (mienCode === "MB") return !!requiredRoles.B;
        if (mienCode === "MN") {
          if (stt === "1") return !!requiredRoles.D;
          if (stt === "2") return !!requiredRoles.P;
          if (stt === "3") return !!requiredRoles.T;
        }
        return false;
      }).filter(function (d) {
        var key = [String(d && d.mien || ""), String(d && d.du_lieu_dai || ""), String(d && d.thu || ""), String(d && d.stt || "")].join("#");
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      }).sort(function (a, b) {
        var ka = [String(a.mien || ""), String(a.thu || ""), String(a.stt || ""), String(a.du_lieu_dai || "")].join("_");
        var kb = [String(b.mien || ""), String(b.thu || ""), String(b.stt || ""), String(b.du_lieu_dai || "")].join("_");
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      return items.length ? items : dsDaiLegacyCanTai;
    }

    var dsDaiThu = useMemo(function () {
      return dsDaiMienThu.map(function (d) {
        var n = Object.assign({}, d);
        n.label = loai_tim === 0 ? (mien + n.stt + " - " + n.ten_dai) : n.ten_dai;
        return n;
      });
    }, [dsDaiMienThu, mien, loai_tim]);

    useEffect(function () {
      setAllowUpdateActions(!KQXS_VIEW_ONLY && typeof window !== "undefined" && window.hasOwnProperty("process"));
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
      taiDuLieuCacheRef.current = {};
      taiDuLieuPendingRef.current = {};
      taiDuLieuXemKqCacheRef.current = {};
      taiDuLieuXemKqPendingRef.current = {};
    }, [mien, loai_tim, den_ngay]);

    useEffect(function () {
      var validMap = {};
      (dsDaiThu || []).forEach(function (d) {
        validMap[String((d && d.stt) || "")] = true;
      });

      setDsDaiChon(function (prev) {
        var next = (prev || []).filter(function (stt) {
          return !!validMap[String(stt || "")];
        });
        return next.length === (prev || []).length ? prev : next;
      });

      setDsDaiChonSoChu(function (prev) {
        var next = (prev || []).filter(function (stt) {
          return !!validMap[String(stt || "")];
        });
        return next.length === (prev || []).length ? prev : next;
      });
    }, [dsDaiThu]);

    // Auto-load Loại Tìm / Nhóm Số / Nhóm Triệt from API whenever legacyHeThong changes (also on mount).
    useEffect(function () {
      reloadLegacyThApiSource();
    }, [legacyHeThong, legacyThUseApiSource, legacyThGroupSourceMode, legacyThCustomGroupsText]);

    useEffect(function () {
      // Auto-apply C1-C6 only after Tong Hop data exists from explicit user actions.
      // Do not auto-run Tong Hop calculations when no source rows are present.
      if (legacyThAutoRunning) return;
      if (legacyThAutoPinnedFullAuto) return;
      runLegacyTongHopAutoFilter({ silent: true });
    }, [
      legacyThRows,
      legacyThAutoC1Ngay,
      legacyThAutoC1Ky,
      legacyThAutoC2NgayCX,
      legacyThAutoC2KyCX,
      legacyThAutoC4NgayGap,
      legacyThAutoC5KyGap,
      legacyThAutoC6Both,
      legacyThAutoRunning,
      legacyThAutoPinnedFullAuto
    ]);

    useEffect(function () {
      setCookie("chon_mau", chon_mau, 365);
    }, [chon_mau]);

    useEffect(function () {
      var parsed = parseSoChuMasked(so_chu_input);
      setSoChu(parsed);
    }, [so_chu_input]);

    useEffect(function () {
      function themesEqual(a, b) {
        if (!a || !b) return false;
        return a.isDark === b.isDark
          && a.primary === b.primary
          && a.success === b.success
          && a.warning === b.warning
          && a.error === b.error
          && a.pageBg === b.pageBg
          && a.cardBg === b.cardBg
          && a.text === b.text
          && a.textInverse === b.textInverse
          && a.muted === b.muted
          && a.border === b.border
          && a.inputBg === b.inputBg
          && a.inputText === b.inputText;
      }

      function onLocaleChanged(e) {
        var nextLang = normalizeUILanguage(e && e.detail && e.detail.language ? e.detail.language : detectUILanguage());
        setUiLang(nextLang);
      }
      function onThemeChanged() {
        var nextTheme = detectThemeTokens();
        setTheme(function (prevTheme) {
          return themesEqual(prevTheme, nextTheme) ? prevTheme : nextTheme;
        });
      }
      var mq = null;
      var onMediaThemeChanged = null;
      var observer = null;

      if (window.matchMedia) {
        try {
          mq = window.matchMedia("(prefers-color-scheme: dark)");
          onMediaThemeChanged = function () { onThemeChanged(); };
          if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onMediaThemeChanged);
          } else if (typeof mq.addListener === "function") {
            mq.addListener(onMediaThemeChanged);
          }
        } catch (_e) {}
      }

      if (typeof MutationObserver !== "undefined") {
        try {
          observer = new MutationObserver(function () { onThemeChanged(); });
          if (document && document.documentElement) {
            observer.observe(document.documentElement, {
              attributes: true,
              attributeFilter: ["class", "data-theme", "theme"]
            });
          }
          if (document && document.body) {
            observer.observe(document.body, {
              attributes: true,
              attributeFilter: ["class", "data-theme", "theme"]
            });
          }
        } catch (_e2) {}
      }

      window.addEventListener("csm:locale-change", onLocaleChanged);
      window.addEventListener("csm:theme-change", onThemeChanged);
      return function () {
        window.removeEventListener("csm:locale-change", onLocaleChanged);
        window.removeEventListener("csm:theme-change", onThemeChanged);
        if (mq && onMediaThemeChanged) {
          if (typeof mq.removeEventListener === "function") {
            mq.removeEventListener("change", onMediaThemeChanged);
          } else if (typeof mq.removeListener === "function") {
            mq.removeListener(onMediaThemeChanged);
          }
        }
        if (observer && typeof observer.disconnect === "function") {
          observer.disconnect();
        }
      };
    }, []);

    useEffect(function () {
      var vars = {
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
      };

      var root = document && document.documentElement ? document.documentElement : null;
      var body = document && document.body ? document.body : null;
      function applyVars(el) {
        if (!el || !el.style) return;
        Object.keys(vars).forEach(function (k) {
          el.style.setProperty(k, String(vars[k] || ""));
        });
      }
      applyVars(root);
      applyVars(body);

      return function () {
        function clearVars(el) {
          if (!el || !el.style) return;
          Object.keys(vars).forEach(function (k) {
            el.style.removeProperty(k);
          });
        }
        clearVars(root);
        clearVars(body);
      };
    }, [theme]);

    useEffect(function () {
      window.__kqxsLegacyCompat = {
        isMienBacRow: isMienBacRow,
        getRowTwoDigits: getRowTwoDigits,
        inferLegacyRole: inferLegacyRole,
        buildLegacyTongHopViewModel: function (opts) {
          var cfg = Object.assign({}, opts || {});
          if (!cfg.dataMien) cfg.dataMien = ((du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || []);
          if (!cfg.fromDate) cfg.fromDate = tu_ngay;
          if (!cfg.toDate) cfg.toDate = den_ngay;
          return buildLegacyTongHopViewModel(cfg);
        },
        buildLegacySoLauRaViewModel: function (opts) {
          var cfg = Object.assign({}, opts || {});

          if (!cfg.fromDate) cfg.fromDate = tu_ngay;
          if (!cfg.toDate) cfg.toDate = den_ngay;
          return buildLegacySoLauRaViewModel(cfg);
        },
        buildLegacyNamBacSummary: function (opts) {
          var cfg = Object.assign({}, opts || {});
          if (!cfg.dataMien) cfg.dataMien = ((du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || []);
          if (!cfg.fromDate) cfg.fromDate = tu_ngay;
          if (!cfg.toDate) cfg.toDate = den_ngay;
          return buildLegacyNamBacSummary(cfg);
        }
      };
      return function () {
        try { delete window.__kqxsLegacyCompat; } catch (_e) {}
      };
    }, [du_lieu_dai_mien, mien, tu_ngay, den_ngay]);


    useEffect(function () {

      var autoCfg = readJsonObject(window.csmKqxsAutoDailyUpdate || window.kqxsAutoDailyUpdate);
      var autoEnabled = (typeof autoCfg.enabled === "boolean") ? autoCfg.enabled : true;
      if (!autoEnabled || KQXS_VIEW_ONLY) return;

      if (autoDailyUpdatingRef.current) return;
      autoDailyUpdatingRef.current = true;

      var delayMs = Math.max(0, Number(autoCfg.delayMs || 1800));
      var timer = setTimeout(async function () {
        try {
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
          var daysToUpdate = Math.max(1, Number(autoCfg.daysToUpdateOnLogin || 3) || 3);
          var updatedDays = [];

          for (var i = 0; i < daysToUpdate; i += 1) {
            var targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - i);
            var ok = await cap_nhat(targetDate);
            if (ok) updatedDays.push(dateFormat(targetDate, "dd/mm/yyyy"));
            if (i < daysToUpdate - 1) {
              await sleepMs(Math.max(0, Number(autoCfg.perDayDelayMs || 1200)));
            }
          }

          if (updatedDays.length > 0) {
            thongbao("Đã tự động cập nhật kết quả cho " + updatedDays.length + " ngày: " + updatedDays.join(", "));
          }
        } catch (err) {
          console.error("Auto daily update failed", err);
        } finally {
          autoDailyUpdatingRef.current = false;
        }
      }, delayMs);

      return function () {
        clearTimeout(timer);
        autoDailyUpdatingRef.current = false;
      };
    }, []);

    function locVaSapXepNgay(rows) {
      // Vue parity: sort giảm dần theo ngày trước, sau đó dedup để giữ bản ghi đầu tiên của mỗi ngày.
      var sorted = (Array.isArray(rows) ? rows.slice() : []).sort(function (a, b) {
        return chuyenNgay(String((b && b.field_ngay) || "").trim(), "yyyymmdd") - chuyenNgay(String((a && a.field_ngay) || "").trim(), "yyyymmdd");
      });
      var seen = {};
      var out = [];
      for (var i = 0; i < sorted.length; i += 1) {
        var r = sorted[i] || {};
        var ngay = String(r.field_ngay || "").trim();
        if (!ngay || seen[ngay]) continue;
        seen[ngay] = true;
        out.push(r);
      }
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

    function isMienBacRow(row, opt) {
      var cfg = opt || {};
      var tableName = String((cfg.sourceTable || (row && row._source_table) || "")).toLowerCase();
      if (/mienbac/.test(tableName)) return true;
      var mienCode = String((cfg.mien || (row && row._mien) || "")).toUpperCase();
      if (mienCode === "MB") return true;
      return false;
    }

    function isThongKeLoResultFieldName(fieldName) {
      var name = String(fieldName || "").trim();
      if (!/^field_/i.test(name)) return false;
      if (name === "field_ngay") return false;
      return true;
    }

    function isThongKeLoMergedResultFieldName(fieldName) {
      var name = String(fieldName || "").trim();
      if (!/^d_[^_]+_field_/i.test(name)) return false;
      if (/_field_ngay$/i.test(name)) return false;
      return true;
    }

    function getRowTwoDigits(row, opt) {
      var out = [];
      var cfg = opt || {};

      if (!cfg.useNorthRules) {
        Object.keys(row || {}).forEach(function (f) {
          if (f === "_id" || f === "id" || f === "thu" || f === "field_ngay") return;
          if (String(f || "").indexOf("_") === 0) return;
          if (!isThongKeLoResultFieldName(f)) return;
          var val = String((row && row[f]) || "").trim();
          if (!val) return;
          var so = val.slice(-2);
          if (/^\d{2}$/.test(so)) out.push(so);
        });
        return out;
      }

      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var isBac = isMienBacRow(row, cfg);

      function pushVal(v) {
        var val = String(v || "").trim();
        if (!val) return;
        var so = val.slice(-2);
        if (/^\d{2}$/.test(so)) out.push(so);
      }

      // Tất cả đài đều dùng đầu/đuôi.
      pushVal(row && row.field_dau);
      pushVal(row && row.field_duoi);

      // Chỉ miền Bắc mới lấy thêm bộ số phụ thuộc hệ số.
      if (isBac) {
        if (heThong === 3) {
          pushVal(row && row.field_so5);
          pushVal(row && row.field_so6);
          pushVal(row && row.field_so7);
        } else {
          pushVal(row && row.field_so2);
          pushVal(row && row.field_so3);
          pushVal(row && row.field_so4);
        }
      }

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

    function normalizeLegacyTongHopMienCode(rawCode) {
      var code = String(rawCode || "").trim();
      if (!code) return "";
      var upper = code.toUpperCase();
      if (upper === "MN" || upper === "MIENNAM") return "MN";
      if (upper === "MB" || upper === "MIENBAC") return "MB";
      if (upper === "MT" || upper === "MIENTRUNG") return "MT";
      if (code === "mienNam") return "MN";
      if (code === "mienBac") return "MB";
      if (code === "mienTrung") return "MT";
      return upper;
    }

    function getLegacyTongHopRequiredRoles(queryValue, heThong) {
      var maQuery = String(parseLegacyLoaiTimMaQuery(queryValue, heThong) || "").toUpperCase();
      if (maQuery === "SP_GET2_DD" || maQuery === "SP_GET2_BL" || maQuery === "SP_GET3_DD" || maQuery === "SP_GET3_BL") {
        return { D: true, P: true, T: false, B: true };
      }
      if (maQuery === "SP_GET2_DD3" || maQuery === "SP_GET2_BL3" || maQuery === "SP_GET3_DD3" || maQuery === "SP_GET3_BL3") {
        return { D: true, P: true, T: true, B: true };
      }
      return { D: true, P: true, T: true, B: true };
    }

    function inferLegacyRole(meta) {
      var item = meta || {};
      var name = stripVietnamese(String(item.ten_dai || "")).toLowerCase();
      var table = String(item.dai || item.du_lieu_dai || "").toLowerCase();
      if (/mienbac|bac/.test(table) || /mienbac|bac/.test(name)) return "B";
      if (/daichinh|chinh/.test(table) || /chinh/.test(name)) return "D";
      if (/daiphu|phu/.test(table) || /phu/.test(name)) return "P";
      if (/dai3|thu3|nam3|mndai3/.test(table) || /3/.test(name)) return "T";
      return "";
    }

    function resolveLegacyTongHopStationRole(meta, row) {
      var item = meta || {};
      var rec = row || {};
      var mienCode = normalizeLegacyTongHopMienCode(item.mien || rec._mien || "");
      var stt = String(item.stt || rec._stt || "");
      if (mienCode === "MB") return "B";
      if (mienCode === "MN") {
        if (stt === "1") return "D";
        if (stt === "2") return "P";
        if (stt === "3") return "T";
      }
      return inferLegacyRole(item || rec);
    }

    function normalizeLegacyDateYmd(v) {
      var s = String(v || "").trim();
      if (!s) return "";
      if (/^\d{8}$/.test(s)) return s;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return dateFormat(chuyenNgay(s, "dd/mm/yyyy"), "yyyymmdd");
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "");
      return s.replace(/\D/g, "").slice(0, 8);
    }

    function buildLegacyDateTimeline(fromDate, toDate, stepDays) {
      var fromYmd = normalizeLegacyDateYmd(fromDate);
      var toYmd = normalizeLegacyDateYmd(toDate);
      if (!fromYmd || !toYmd) return [];
      var out = [];
      var cur = chuyenNgay(toYmd, "yyyymmdd");
      var stop = chuyenNgay(fromYmd, "yyyymmdd");
      var step = Math.max(1, Number(stepDays || 1));
      while (cur >= stop) {
        out.push(dateFormat(cur, "yyyymmdd"));
        cur = chuyenNgay(CongNgay(dateFormat(cur, "dd/mm/yyyy"), -step, "dd/mm/yyyy"), "dd/mm/yyyy");
      }
      return out;
    }

    function buildLegacyTongHopViewModel(opts) {
      var cfg = opts || {};
      var dataMien = Array.isArray(cfg.dataMien) ? cfg.dataMien : [];
      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var locList = Array.isArray(cfg.locList) ? cfg.locList.slice() : [];
      var allKeys = getLegacyAllNormalizedFieldKeys();
      var locSet = {};
      locList.forEach(function (k) { locSet[String(k)] = true; });

      var byDate = {};
      dataMien.forEach(function (dai) {
        (dai.data || []).forEach(function (row) {
          var role = resolveLegacyTongHopStationRole(dai, row);
          if (!role) return;
          var ymd = normalizeLegacyDateYmd(row && row.field_ngay);
          if (!ymd) return;
          if (!byDate[ymd]) byDate[ymd] = { ID: ymd, Ngay: dateFormat(chuyenNgay(ymd, "yyyymmdd"), "dd/mm/yyyy") };
          var bucket = byDate[ymd];
          if (role === "D" || role === "P" || role === "T") {
            bucket[role + "_dau"] = String(heThong === 3 ? (row.field_so2 || row.field_dau || "") : (row.field_dau || "")).trim();
            for (var ds = 2; ds <= 17; ds += 1) {
              bucket[role + "_so" + ds] = String(row["field_so" + ds] || "").trim();
            }
            bucket[role + "_duoi"] = String(row.field_duoi || "").trim();
          } else if (role === "B") {
            bucket.B_duoi = String(row.field_duoi || "").trim();
            bucket.B_dau = String(heThong === 3 ? (row.field_so5 || "") : (row.field_dau || "")).trim();
            bucket.B_so2 = String(heThong === 3 ? (row.field_so6 || "") : (row.field_so2 || "")).trim();
            bucket.B_so3 = String(heThong === 3 ? (row.field_so7 || "") : (row.field_so3 || "")).trim();
            bucket.B_so4 = String(heThong === 3 ? "" : (row.field_so4 || "")).trim();
            for (var bs = heThong === 3 ? 5 : 5; bs <= 26; bs += 1) {
              bucket["B_so" + bs] = String(row["field_so" + bs] || bucket["B_so" + bs] || "").trim();
            }
          }
        });
      });

      var timeline = buildLegacyDateTimeline(cfg.fromDate, cfg.toDate, Number(cfg.stepDays || 1));
      var rows = timeline.map(function (ymd) {
        var row = byDate[ymd];
        if (!row) {
          row = {
            ID: ymd,
            Ngay: dateFormat(chuyenNgay(ymd, "yyyymmdd"), "dd/mm/yyyy")
          };
          allKeys.forEach(function (key) {
            row[key] = (heThong === 3 && key === "B_so4") ? "" : "?";
          });
        }
        if (locList.length) {
          var copy = Object.assign({}, row);
          allKeys.forEach(function (k) {
            if (!locSet[k]) copy[k] = "";
          });
          return copy;
        }
        return row;
      });

      return rows;
    }

    function hasLegacyDrawData(row, heThong) {
      var he = Number(heThong || 2) === 3 ? 3 : 2;
      var fields = getLegacyAllNormalizedFieldKeys();
      var rec = row || {};
      for (var i = 0; i < fields.length; i += 1) {
        var raw = String(rec[fields[i]] || "").trim();
        if (!raw || raw === "?" || !/\d/.test(raw)) continue;
        var tail = raw.slice(-he);
        if (tail.length === he && new RegExp("^\\d{" + he + "}$").test(tail)) return true;
      }
      return false;
    }

    function buildLegacySoLauRaViewModel(opts) {
      var cfg = opts || {};
      var allRows = Array.isArray(cfg.baseRows)
        ? cfg.baseRows.slice()
        : buildLegacyTongHopViewModel(cfg).filter(function (row) {
            return hasLegacyDrawData(row, cfg.heThong);
          });
      var fromYmd = normalizeLegacyDateYmd(cfg.fromDate);
      var toYmdBound = normalizeLegacyDateYmd(cfg.toDate);
      if (fromYmd || toYmdBound) {
        allRows = allRows.filter(function (row) {
          var ymd = normalizeLegacyDateYmd(row && row.ID);
          if (!ymd) return false;
          if (fromYmd && ymd < fromYmd) return false;
          if (toYmdBound && ymd > toYmdBound) return false;
          return true;
        });
      }
      var mode = String(cfg.mode || "C_D").toUpperCase(); // C, D, 2C, C_D (Tất cả)
      var gt = Math.max(1, Number(cfg.rankFrom || 1));
      var gd = Math.max(gt, Number(cfg.rankTo || 10));
      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var tokenFields = getLegacySoLauRaTokenFields(cfg.queryValue, heThong, allRows);

      // Lọc theo thứ theo đúng PHP GetSoLauRa: chỉ cần TK==1 (theoKy) là lọc cùng thứ.
      var rows = allRows;
      if (cfg.theoKy && allRows.length > 0) {
        var toYmd = normalizeLegacyDateYmd(cfg.toDate);
        var targetDow = -1;
        if (toYmd && toYmd.length >= 8) {
          var ty = parseInt(toYmd.substring(0, 4), 10);
          var tm = parseInt(toYmd.substring(4, 6), 10) - 1;
          var td = parseInt(toYmd.substring(6, 8), 10);
          targetDow = new Date(ty, tm, td).getDay();
        }
        if (targetDow >= 0) {
          rows = allRows.filter(function (r) {
            var ymd = normalizeLegacyDateYmd(r.ID);
            if (!ymd || ymd.length < 8) return false;
            var ry = parseInt(ymd.substring(0, 4), 10);
            var rm = parseInt(ymd.substring(4, 6), 10) - 1;
            var rd = parseInt(ymd.substring(6, 8), 10);
            return new Date(ry, rm, rd).getDay() === targetDow;
          });
        }
      }

      rows = rows.slice().sort(function (a, b) {
        return String(normalizeLegacyDateYmd((b && b.ID) || "") || "").localeCompare(
          String(normalizeLegacyDateYmd((a && a.ID) || "") || ""),
          "vi",
          { numeric: true, sensitivity: "base" }
        );
      });

      // PHP uses date window (LuiNgay..Den) for lookback, not row-count slicing.

      function dayTokens(r) {
        var vals = tokenFields.map(function (fieldName) {
          return r[fieldName];
        });
        var heRe = new RegExp("^\\d{" + heThong + "}$");
        return vals.map(function (v) { return String(v || "").slice(-heThong); }).filter(function (s) { return heRe.test(s); });
      }

      // PHP: $KQ = rows where ID < Den AND ID >= (Den - LM)
      // $KQHT = the Den row, used only for hit display.
      var toDateYmd = normalizeLegacyDateYmd(cfg.toDate);
      var lookbackDays = Math.max(0, Number(cfg.ngayChay || 0));
      var luiDate = toDateYmd ? chuyenNgay(toDateYmd, "yyyymmdd") : null;
      if (luiDate && lookbackDays > 0) {
        luiDate = new Date(luiDate.getFullYear(), luiDate.getMonth(), luiDate.getDate() - lookbackDays);
      }
      var luiYmd = luiDate ? dateFormat(luiDate, "yyyymmdd") : "";

      var history = rows.filter(function (r) {
        var ymd = normalizeLegacyDateYmd(r && r.ID);
        if (!ymd) return false;
        if (toDateYmd && ymd >= toDateYmd) return false;
        if (luiYmd && ymd < luiYmd) return false;
        return true;
      }).map(function (r) {
        var arr = dayTokens(r);
        var set = {};
        for (var i = 0; i < arr.length; i += 1) set[arr[i]] = true;
        return set;
      });

      function buildCandidates() {
        // Bám sát PHP: danh sách số phải lấy từ timkiem; không sinh dữ liệu giả lập.
        return (Array.isArray(cfg.candidateList) && cfg.candidateList.length)
          ? cfg.candidateList.slice()
          : [];
      }

      function dayHitsCandidate(daySet, candidate) {
        var toks = (candidate && candidate.matchTokens) || (candidate && candidate.tokens) || [];
        for (var ti = 0; ti < toks.length; ti += 1) {
          if (daySet[toks[ti]]) return true;
        }
        return false;
      }

      var candidates = buildCandidates();
      var out = [];
      for (var ci = 0; ci < candidates.length; ci += 1) {
        var cand = candidates[ci];
        var gap = 0;
        var firstHit = -1;
        for (var d = 0; d < history.length; d += 1) {
          if (dayHitsCandidate(history[d], cand)) {
            firstHit = d;
            break;
          }
          gap += 1;
        }
        // PHP keeps NgayCXHT as -1 when no hit in lookback window.
        var gapForRank = firstHit >= 0 ? gap : -1;
        out.push({ so: cand.key, gap: gapForRank, first_hit_idx: firstHit, _ord: ci });
      }
      out.sort(function (a, b) {
        var dg = Number(b.gap || 0) - Number(a.gap || 0);
        if (dg) return dg;
        return Number(a._ord || 0) - Number(b._ord || 0);
      });
      for (var ri = 0; ri < out.length; ri += 1) {
        out[ri].rank = ri + 1;
      }

      // PHP GHTu/GHDen semantics: include ties with the value at GHDen.
      var selected = [];
      var cuoi = null;
      for (var pi = 0; pi < out.length; pi += 1) {
        var item = out[pi];
        var dem = pi + 1;
        if (dem < gt) continue;
        if (dem === gd) cuoi = Number(item.gap || 0);
        if (dem > gd && cuoi !== null && Number(item.gap || 0) !== cuoi) break;
        selected.push({
          so: item.so,
          gap: item.gap,
          first_hit_idx: item.first_hit_idx,
          rank: item.rank
        });
      }
      return selected;
    }

    function getLegacySoLauRaTokenFields(queryValue, heThong, dataRows) {
      var queryFields = getLegacyQueryFieldList(queryValue, heThong);

      function resolveQueryFieldsForRows(expectedFields, dataRows) {
        var expected = Array.isArray(expectedFields) ? expectedFields : [];
        var rowsSrc = Array.isArray(dataRows) ? dataRows : [];
        if (!rowsSrc.length) return expected.slice();

        var actualMap = {};
        rowsSrc.forEach(function (row) {
          Object.keys(row || {}).forEach(function (k) {
            var key = String(k || "").trim();
            if (!key || key === "ID") return;
            if (/^[DPTB]_(dau|duoi|so\d+)$/i.test(key)) {
              actualMap[key] = true;
            }
          });
        });

        var intersect = expected.filter(function (f) { return !!actualMap[String(f || "")]; });
        if (expected.length) {
          // Bám sát PHP: đã có danh sách field theo query thì không được tự nới rộng.
          // Nếu không giao nhau do khác schema/case thì vẫn giữ expected để tránh lệch công thức.
          return intersect.length ? intersect : expected.slice();
        }

        var actual = Object.keys(actualMap);
        actual.sort(function (a, b) { return a.localeCompare(b, "vi", { numeric: true, sensitivity: "base" }); });
        return actual.length ? actual : expected.slice();
      }

      queryFields = resolveQueryFieldsForRows(queryFields, dataRows);
      var fieldParts = parseLegacyLoaiTimFieldPart(queryValue).split("-").map(function (part) {
        return String(part || "").trim();
      }).filter(Boolean);

      function fieldAllowed(fieldName) {
        var name = String(fieldName || "").trim();
        if (!name) return false;
        if (queryFields.length && queryFields.indexOf(name) < 0) return false;
        if (!fieldParts.length) return true;
        for (var i = 0; i < fieldParts.length; i += 1) {
          if (name.indexOf(fieldParts[i]) >= 0) return true;
        }
        return false;
      }

      return getLegacyAllNormalizedFieldKeys().filter(fieldAllowed);
    }

    function buildLegacySoLauRaCandidatesFromTimKiemRows(rows, heThong, mode, chkHieu) {
      var he = Number(heThong || 2) === 3 ? 3 : 2;
      var m = String(mode || "C_D").toUpperCase();
      var list = Array.isArray(rows) ? rows : [];
      var out = [];
      var seen = {};
      var tokenRe = new RegExp("^\\d{" + he + "}$");

      for (var i = 0; i < list.length; i += 1) {
        var row = list[i] || {};
        var maDuoi = Number(row.ma_duoi || row.MaDuoi || 0);
        var noiDung = String(row.noi_dung || row.NoiDung || row.dong_nghia || "").trim();
        if (!noiDung) continue;

        if (m === "2C") {
          if (he !== 2) continue;
          // PHP: LENGTH(trim(NoiDung))=5 for CD=2C.
          if (noiDung.length !== 5) continue;
          var pairTokens = parseSoChuByHeThong(noiDung, 2);
          if (pairTokens.length < 2) continue;
          var a = pairTokens[0], b = pairTokens[1];
          var key = a + " " + b;
          if (seen[key]) continue;
          seen[key] = true;
          out.push({ key: key, tokens: [a, b], matchTokens: [a, b] });
          continue;
        }

        // PHP: MaDuoi must match and LENGTH(NoiDung)=MaDuoi for non-2C.
        if (maDuoi && maDuoi !== he) continue;
        if (!tokenRe.test(noiDung)) continue;
        var tokens = parseSoChuByHeThong(noiDung, he);
        if (!tokens.length) continue;
        var tk = tokens[0];
        if (he === 2 && !chkHieu && tk.charAt(0) === tk.charAt(1)) continue;
        if (seen[tk]) continue;
        seen[tk] = true;
        out.push({ key: tk, tokens: [tk], matchTokens: [tk] });
      }

      return out;
    }

    function legacyPhpRight(value, count) {
      var text = String(value == null ? "" : value);
      var n = Math.max(0, Number(count || 0));
      if (!n) return "";
      return text.slice(-n);
    }

    function legacyPhpLeft(value, count) {
      var text = String(value == null ? "" : value);
      var n = Math.max(0, Number(count || 0));
      if (!n) return "";
      return text.slice(0, n);
    }

    function legacyPhpStrrposTrue(haystack, needle) {
      var h = String(haystack == null ? "" : haystack);
      var n = String(needle == null ? "" : needle);
      if (!n) return false;
      // PHP code compares strrpos(...) == true, so only positions > 0 pass.
      return h.lastIndexOf(n) > 0;
    }

    function legacySlrThuLabelFromYmd(ymd) {
      var d = chuyenNgay(String(ymd || ""), "yyyymmdd");
      if (!d) return "";
      var w = d.getDay();
      return w === 0 ? "CN" : ("T" + String(w + 1));
    }

    function buildLegacySoLauRaPhpSnapshot(cfg, denDate, rowsDesc, tokenFields, soTimList, allowTieExpand) {
      var denYmd = normalizeLegacyDateYmd(denDate);
      if (!denYmd) {
        return {
          rows: [],
          c: 0, d: 0, t: 0,
          cNam: 0, dNam: 0, tNam: 0,
          cBac: 0, dBac: 0, tBac: 0
        };
      }

      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var lookback = Math.max(0, Number(cfg.ngayChay || 0));
      var denObj = chuyenNgay(denYmd, "yyyymmdd");
      var luiObj = denObj ? new Date(denObj.getFullYear(), denObj.getMonth(), denObj.getDate() - lookback) : null;
      var luiYmd = luiObj ? dateFormat(luiObj, "yyyymmdd") : denYmd;
      var gt = Math.max(1, Number(cfg.rankFrom || 1));
      var gd = Math.max(gt, Number(cfg.rankTo || 10));
      var tieExpand = allowTieExpand !== false;
      var thuDen = cfg.theoKy
        ? String(cfg.fixedThuLabel || "").trim() || legacySlrThuLabelFromYmd(denYmd)
        : "";

      var KQ = [];
      var KQHT = {};
      var srcRows = Array.isArray(rowsDesc) ? rowsDesc : [];
      for (var i = 0; i < srcRows.length; i += 1) {
        var entry = srcRows[i] || {};
        var key = String(entry.id || "");
        var val = entry.row || {};
        if (!key) continue;
        if (cfg.theoKy) {
          if (thuDen !== legacySlrThuLabelFromYmd(key)) continue;
        }
        if (key < denYmd && key >= luiYmd) KQ.push(val);
        if (key === denYmd) KQHT = val;
      }

      var KQItem = [];
      var soList = Array.isArray(soTimList) ? soTimList : [];
      for (var tk = 0; tk < soList.length; tk += 1) {
        var noiDung = String(soList[tk] || "").trim();
        if (!noiDung) continue;
        var ngayCXHT = -1;
        var ngayCX = 0;
        for (var k = 0; k < KQ.length; k += 1) {
          var row = KQ[k] || {};
          var coNgay = 0;
          for (var cl = 0; cl < tokenFields.length; cl += 1) {
            var f = tokenFields[cl];
            var token = legacyPhpRight(String((row && row[f]) || "").trim(), heThong);
            if (legacyPhpStrrposTrue("_" + noiDung, token)) coNgay += 1;
          }
          if (coNgay === 0) {
            ngayCX += 1;
          } else {
            if (ngayCXHT === -1) ngayCXHT = ngayCX;
            ngayCX = 0;
          }
        }
        KQItem.push({ key: noiDung, val: ngayCXHT, ord: tk });
      }

      KQItem.sort(function (a, b) {
        var dv = Number(b.val || 0) - Number(a.val || 0);
        if (dv) return dv;
        return Number(a.ord || 0) - Number(b.ord || 0);
      });

      var rows = [];
      var cuoi = -100;
      var dem = 0;
      var demso = 0;
      var CTC = 0, CT2C = 0, CTD = 0;
      var CTCN = 0, CT2CN = 0, CTDN = 0;
      var CTCB = 0, CT2CB = 0, CTDB = 0;

      for (var qi = 0; qi < KQItem.length; qi += 1) {
        var item = KQItem[qi] || {};
        var keySo = String(item.key || "").trim();
        demso += 1;
        dem += 1;
        if (dem < gt) continue;
        if (dem === gd) cuoi = Number(item.val || 0);
        if (dem > gd && (!tieExpand || Number(cuoi) !== Number(item.val || 0))) break;

        var countC = 0, count2C = 0, countD = 0;
        var countCN = 0, count2CN = 0, countDN = 0;
        var countCB = 0, count2CB = 0, countDB = 0;

        for (var cfi = 0; cfi < tokenFields.length; cfi += 1) {
          var fieldName = String(tokenFields[cfi] || "");
          var fieldVal = legacyPhpRight(String((KQHT && KQHT[fieldName]) || "").trim(), heThong);
          if (legacyPhpStrrposTrue("_" + keySo, fieldVal)) {
            countC += 1;
            if (fieldName.indexOf("B_") === 0) countCB += 1;
            else countCN += 1;
          }
          if (legacyPhpStrrposTrue("_" + keySo, fieldVal)) {
            count2C += 1;
            if (fieldName.indexOf("B_") === 0) count2CB += 1;
            else count2CN += 1;
          }
          var daoKey = legacyPhpRight(keySo, 1) + legacyPhpLeft(keySo, 1);
          if (legacyPhpStrrposTrue("_" + daoKey, fieldVal)) {
            countD += 1;
            if (fieldName.indexOf("B_") === 0) countDB += 1;
            else countDN += 1;
          }
        }

        rows.push({
          stt: demso,
          rank: dem,
          so: keySo,
          dao: legacyPhpRight(keySo, 1) + legacyPhpLeft(keySo, 1),
          pairTokens: String(keySo || "").split(/\s+/).filter(function (x) { return /^\d{2}$/.test(x); }),
          cAll: countC, cNam: countCN, cBac: countCB,
          dAll: countD, dNam: countDN, dBac: countDB,
          pAll: count2C, pNam: count2CN, pBac: count2CB,
          first_hit_idx: Number(item.val || -1)
        });

        CTC += countC;
        CT2C += count2C;
        CTD += countD;
        CTCN += countCN;
        CT2CN += count2CN;
        CTDN += countDN;
        CTCB += countCB;
        CT2CB += count2CB;
        CTDB += countDB;
      }

      var mode = String(cfg.mode || "C_D").toUpperCase();
      if (mode === "2C") {
        return {
          rows: rows,
          c: CT2C,
          d: 0,
          t: 0,
          cNam: CT2CN,
          dNam: 0,
          tNam: CT2CN,
          cBac: CT2CB,
          dBac: 0,
          tBac: CT2CB
        };
      }
      return {
        rows: rows,
        c: CTC,
        d: CTD,
        t: CTC + CTD,
        cNam: CTCN,
        dNam: CTDN,
        tNam: CTCN + CTDN,
        cBac: CTCB,
        dBac: CTDB,
        tBac: CTCB + CTDB
      };
    }

    function buildLegacySoLauRaDayTokenSet(cfg, dateValue, tokenFields) {
      var ymd = normalizeLegacyDateYmd(dateValue);
      if (!ymd) return {};
      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var day = cfg.dayRowMap && cfg.dayRowMap[ymd];
      if (!day) {
        var rows = buildLegacyTongHopViewModel(Object.assign({}, cfg, {
          fromDate: dateValue,
          toDate: dateValue,
          stepDays: 1
        })).filter(function (row) {
          return hasLegacyDrawData(row, cfg.heThong);
        });
        day = rows.find(function (row) {
          return normalizeLegacyDateYmd(row && row.ID) === ymd;
        });
      }
      if (!day) return {};

      var set = {};
      var fields = Array.isArray(tokenFields) ? tokenFields : [];
      for (var i = 0; i < fields.length; i += 1) {
        var val = String(day[fields[i]] || "").slice(-heThong);
        if (new RegExp("^\\d{" + heThong + "}$").test(val)) set[val] = true;
      }
      return set;
    }

    // Returns {all, nam, bac} token sets in a single view-model call
    function buildLegacySoLauRaDayEntries(cfg, dateValue, tokenFields) {
      var ymd = normalizeLegacyDateYmd(dateValue);
      if (!ymd) return [];
      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var day = cfg.dayRowMap && cfg.dayRowMap[ymd];
      if (!day) {
        var rows = buildLegacyTongHopViewModel(Object.assign({}, cfg, {
          fromDate: dateValue,
          toDate: dateValue,
          stepDays: 1
        })).filter(function (row) {
          return hasLegacyDrawData(row, cfg.heThong);
        });
        day = rows.find(function (row) {
          return normalizeLegacyDateYmd(row && row.ID) === ymd;
        });
      }
      if (!day) return [];
      var out = [];
      var fields = Array.isArray(tokenFields) ? tokenFields : [];
      for (var i = 0; i < fields.length; i += 1) {
        var f = fields[i];
        var val = String(day[f] || "").slice(-heThong);
        if (new RegExp("^\\d{" + heThong + "}$").test(val)) {
          out.push({ token: val, region: /^B_/.test(f) ? "bac" : "nam" });
        }
      }
      return out;
    }

    function buildLegacySoLauRaDayStats(mode, topRows, dayEntries) {
      var m = String(mode || "C_D").toUpperCase();
      var rows = Array.isArray(topRows) ? topRows : [];
      var entries = Array.isArray(dayEntries) ? dayEntries : [];
      var c = 0, d = 0, c2 = 0;
      var cNam = 0, dNam = 0, cBac = 0, dBac = 0;

      function incByRegion(region, kind) {
        if (kind === "c") {
          if (region === "bac") cBac += 1;
          else cNam += 1;
        } else if (kind === "d") {
          if (region === "bac") dBac += 1;
          else dNam += 1;
        } else if (kind === "2c") {
          if (region === "bac") cBac += 1;
          else cNam += 1;
        }
      }

      for (var i = 0; i < rows.length; i += 1) {
        var so = String((rows[i] && rows[i].so) || "").trim();
        var dao = /^\d{2}$/.test(so) ? (so.slice(1) + so.slice(0, 1)) : "";
        var pairTokens = String(so || "").split(/\s+/).filter(function (x) { return /^\d{2}$/.test(x); });
        if (m === "2C") {
          var tkSet = {};
          if (pairTokens.length) {
            pairTokens.forEach(function (t) { tkSet[t] = true; });
          } else if (/^\d{2}$/.test(so)) {
            tkSet[so] = true;
            tkSet[dao] = true;
          }
          for (var e2 = 0; e2 < entries.length; e2 += 1) {
            if (tkSet[entries[e2].token]) {
              c2 += 1;
              incByRegion(entries[e2].region, "2c");
            }
          }
          continue;
        }

        if (!/^\d{2}$/.test(so)) continue;
        for (var e = 0; e < entries.length; e += 1) {
          var token = entries[e].token;
          if (token === so) {
            c += 1;
            incByRegion(entries[e].region, "c");
          }
          if (token === dao) {
            d += 1;
            incByRegion(entries[e].region, "d");
          }
        }
      }

      if (m === "2C") {
        return { c: c2, d: 0, t: 0, cNam: cNam, dNam: 0, tNam: cNam, cBac: cBac, dBac: 0, tBac: cBac };
      }
      return { c: c, d: d, t: c + d, cNam: cNam, dNam: dNam, tNam: cNam + dNam, cBac: cBac, dBac: dBac, tBac: cBac + dBac };
    }

    function buildLegacySoLauRaWeekRows(opts) {
      var cfg = opts || {};
      var toDate = String(cfg.toDate || "").trim();
      var fromDate = String(cfg.fromDate || "").trim();
      if (!toDate) return [];
      var weekDefs = [
        { key: "cn", text: "CN", dow: 0 },
        { key: "t7", text: "T7", dow: 6 },
        { key: "t6", text: "T6", dow: 5 },
        { key: "t5", text: "T5", dow: 4 },
        { key: "t4", text: "T4", dow: 3 },
        { key: "t3", text: "T3", dow: 2 },
        { key: "t2", text: "T2", dow: 1 }
      ];

      function dayDowByDdMmYyyy(v) {
        var d = chuyenNgay(v, "dd/mm/yyyy");
        return d ? d.getDay() : -1;
      }

      function findDateForDow(baseDate, dow) {
        for (var i = 0; i < 7; i += 1) {
          var candidate = CongNgay(baseDate, -i, "dd/mm/yyyy");
          if (dayDowByDdMmYyyy(candidate) === dow) return candidate;
        }
        return baseDate;
      }

      function buildSoTimList() {
        var out = [];
        var list = Array.isArray(cfg.candidateList) ? cfg.candidateList : [];
        if (list.length) {
          for (var i = 0; i < list.length; i += 1) {
            var item = list[i];
            var k = "";
            if (typeof item === "string") k = String(item || "").trim();
            else k = String((item && (item.key || item.so || item.value || item.noiDung || item.NoiDung)) || "").trim();
            if (k) out.push(k);
          }
          if (out.length) return { list: out };
        }
        return { list: [] };
      }

      var soTimMeta = buildSoTimList();
      var soTimList = Array.isArray(soTimMeta && soTimMeta.list) ? soTimMeta.list : [];

      function formatCell(dateValue) {
        var denYmd = normalizeLegacyDateYmd(dateValue);
        var snapshot = buildLegacySoLauRaPhpSnapshot(cfg, denYmd, rowsDesc, tokenFields, soTimList, true);
        var top = Array.isArray(snapshot.rows) ? snapshot.rows : [];
        var hits = top.filter(function (r) { return Number(r.first_hit_idx) === 0; }).length;
        var dayEntries = buildLegacySoLauRaDayEntries(cfg, dateValue, tokenFields);
        var cntAll = {}, cntNam = {}, cntBac = {};
        for (var ei = 0; ei < dayEntries.length; ei += 1) {
          var et = String(dayEntries[ei].token || "");
          if (!/^\d{2}$/.test(et)) continue;
          cntAll[et] = Number(cntAll[et] || 0) + 1;
          if (dayEntries[ei].region === "bac") cntBac[et] = Number(cntBac[et] || 0) + 1;
          else cntNam[et] = Number(cntNam[et] || 0) + 1;
        }

        top = top.map(function (r) {
          var so = String((r && r.so) || "").trim();
          var pairTokens = String(so || "").split(/\s+/).filter(function (x) { return /^\d{2}$/.test(x); });
          var pairNamMap = {}, pairBacMap = {};
          for (var pi = 0; pi < pairTokens.length; pi += 1) {
            var tk = pairTokens[pi];
            pairNamMap[tk] = Number(cntNam[tk] || 0);
            pairBacMap[tk] = Number(cntBac[tk] || 0);
          }
          return Object.assign({}, r, {
            pairTokens: pairTokens,
            pairNamMap: pairNamMap,
            pairBacMap: pairBacMap
          });
        });

        return {
          date: dateValue,
          list: top.map(function (r) { return String(r.so || ""); }).join(" "),
          rows: top,
          mode: String(cfg.mode || "C_D").toUpperCase(),
          hit: hits,
          total: top.length,
          c: Number(snapshot.c || 0),
          d: Number(snapshot.d || 0),
          t: Number(snapshot.t || 0),
          cNam: Number(snapshot.cNam || 0),
          dNam: Number(snapshot.dNam || 0),
          tNam: Number(snapshot.tNam || 0),
          cBac: Number(snapshot.cBac || 0),
          dBac: Number(snapshot.dBac || 0),
          tBac: Number(snapshot.tBac || 0)
        };
      }

      function diffDays(d1, d2) {
        var a = chuyenNgay(String(d1 || ""), "dd/mm/yyyy");
        var b = chuyenNgay(String(d2 || ""), "dd/mm/yyyy");
        if (!a || !b) return 0;
        return Math.floor((a.getTime() - b.getTime()) / 86400000);
      }
      function dow1to7(v) {
        var d = chuyenNgay(String(v || ""), "dd/mm/yyyy");
        if (!d) return 7;
        var w = d.getDay();
        return w === 0 ? 7 : w;
      }

      var denG = toDate;
      var denAdj = toDate;
      if (!cfg.theoKy || !cfg.theoThu) {
        var D = dow1to7(denAdj);
        denAdj = CongNgay(denAdj, 7 - D, "dd/mm/yyyy");
      }
      var tuAdj = fromDate || toDate;
      var T = dow1to7(tuAdj);
      tuAdj = CongNgay(tuAdj, 1 - T, "dd/mm/yyyy");

      var tongNgay = Math.max(0, diffDays(denAdj, tuAdj)) + 1;
      if (cfg.theoKy && cfg.theoThu) tongNgay = tongNgay * 7;
      var stepDays = (cfg.theoKy && cfg.theoThu) ? 7 : 1;
      var denGYmd = normalizeLegacyDateYmd(denG);
      var broadFrom = CongNgay(tuAdj, -Math.max(0, Number(cfg.ngayChay || 0)), "dd/mm/yyyy");
      var baseRows = Array.isArray(cfg.baseRows)
        ? cfg.baseRows
        : buildLegacyTongHopViewModel(Object.assign({}, cfg, {
            fromDate: broadFrom,
            toDate: denG,
            stepDays: 1
          })).filter(function (row) {
            return hasLegacyDrawData(row, cfg.heThong);
          });
      var dayRowMap = cfg.dayRowMap || {};
      if (!cfg.dayRowMap) {
        for (var bri = 0; bri < baseRows.length; bri += 1) {
          var bymd = normalizeLegacyDateYmd(baseRows[bri] && baseRows[bri].ID);
          if (bymd && !dayRowMap[bymd]) dayRowMap[bymd] = baseRows[bri];
        }
      }
      var tokenFields = getLegacySoLauRaTokenFields(cfg.queryValue, Number(cfg.heThong || 2) === 3 ? 3 : 2, baseRows);

      var rowsDesc = (Array.isArray(baseRows) ? baseRows : []).map(function (row) {
        return {
          id: normalizeLegacyDateYmd(row && row.ID),
          row: row || {}
        };
      }).filter(function (x) { return !!x.id; }).sort(function (a, b) {
        return String(b.id).localeCompare(String(a.id), "vi", { numeric: true, sensitivity: "base" });
      });

      var out = [];
      var denCursor = denAdj;
      var rowIdx = 0;
      for (var i = 0; i < tongNgay; i += 1) {
        if (i % 7 === 0) {
          out.push({ key: "wk_" + rowIdx, week: "Tuần " + (rowIdx + 1), chinh: 0, dao: 0, tong: 0, chinhNam: 0, chinhBac: 0, daoNam: 0, daoBac: 0, tongNam: 0, tongBac: 0 });
          rowIdx += 1;
        }
        var row = out[out.length - 1];
        var wd = weekDefs[i % 7];
        var curYmd = normalizeLegacyDateYmd(denCursor);
        var isReal = !!denGYmd && !!curYmd && denGYmd >= curYmd;
        var cell = isReal ? formatCell(denCursor) : { date: denCursor, list: "", hit: 0, total: 0, c: 0, d: 0, t: 0, cNam: 0, dNam: 0, tNam: 0, cBac: 0, dBac: 0, tBac: 0 };
        row[wd.key] = cell;
        row.chinh += Number(cell.c || 0);
        row.dao += Number(cell.d || 0);
        row.tong += Number(cell.t || 0);
        row.chinhNam += Number(cell.cNam || 0);
        row.chinhBac += Number(cell.cBac || 0);
        row.daoNam += Number(cell.dNam || 0);
        row.daoBac += Number(cell.dBac || 0);
        row.tongNam += Number(cell.tNam || 0);
        row.tongBac += Number(cell.tBac || 0);
        denCursor = CongNgay(denCursor, -stepDays, "dd/mm/yyyy");
      }
      return out;
    }

    function buildLegacyNamBacSummary(opts) {
      var cfg = opts || {};
      // NamBac.php is fixed to MaDuoi=2 and reads rows in [Tu..Den].
      var rows = buildLegacyTongHopViewModel({
        dataMien: cfg.dataMien,
        fromDate: cfg.fromDate,
        toDate: cfg.toDate,
        heThong: 2,
        stepDays: 1
      }).filter(function (row) {
        var ymd = normalizeLegacyDateYmd(row && row.ID);
        if (!ymd || ymd.length < 8) return false;
        var fromYmd = normalizeLegacyDateYmd(cfg.fromDate);
        var toYmd = normalizeLegacyDateYmd(cfg.toDate);
        if (fromYmd && ymd < fromYmd) return false;
        if (toYmd && ymd > toYmd) return false;
        if (!hasLegacyDrawData(row, 2)) return false;
        return true;
      });
      
      if (cfg.theoKy) {
        var targetYmd = normalizeLegacyDateYmd(cfg.toDate);
        if (targetYmd && targetYmd.length >= 8) {
          var targetDow = new Date(
            parseInt(targetYmd.substring(0, 4), 10),
            parseInt(targetYmd.substring(4, 6), 10) - 1,
            parseInt(targetYmd.substring(6, 8), 10)
          ).getDay();
          rows = rows.filter(function (row) {
            var ymd = normalizeLegacyDateYmd(row && row.ID);
            if (!ymd || ymd.length < 8) return false;
            return new Date(
              parseInt(ymd.substring(0, 4), 10),
              parseInt(ymd.substring(4, 6), 10) - 1,
              parseInt(ymd.substring(6, 8), 10)
            ).getDay() === targetDow;
          });
        }
      }

      // NamBac.php uses: ORDER BY ID DESC
      rows.sort(function (a, b) {
        var ay = normalizeLegacyDateYmd(a && a.ID);
        var by = normalizeLegacyDateYmd(b && b.ID);
        if (ay === by) return 0;
        return ay < by ? 1 : -1;
      });

      var boSoRaw = Array.isArray(cfg.boSoList) ? cfg.boSoList.slice() : [];
      var boSoList = boSoRaw.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
      if (!boSoList.length) return [];

      function startsWith(value, prefix) {
        return String(value || "").indexOf(String(prefix || "")) === 0;
      }

      function tail2(value) {
        return String(value || "").trim().slice(-2);
      }

      function buildBoSoLookup(value) {
        var set = {};
        String(value || "").trim().split(/\s+/).forEach(function (part) {
          if (!part) return;
          set[part] = true;
        });
        return set;
      }

      var expectedCols = getLegacyQueryFieldList(cfg.queryValue || "sp_Get2_BL3,D_-P_-T_-B_", 2);
      var actualMap = {};
      for (var ar = 0; ar < rows.length; ar += 1) {
        var rowMap = rows[ar] || {};
        Object.keys(rowMap).forEach(function (k) {
          var key = String(k || "").trim();
          if (!key || key === "ID" || key === "Ngay") return;
          if (/^[DPTB]_(dau|duoi|so\d+)$/i.test(key)) actualMap[key] = true;
        });
      }
      var colA = expectedCols.filter(function (name) { return !!actualMap[String(name || "")]; });
      if (!colA.length) colA = expectedCols.slice();

      var DD3D_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, B_dau: true, B_so2: true, B_so3: true, B_so4: true, B_duoi: true };
      var DDMB_FIELDS = { B_dau: true, B_so2: true, B_so3: true, B_so4: true, B_duoi: true };
      var DAUB_FIELDS = { B_dau: true, B_so2: true, B_so3: true, B_so4: true };
      var DD2D_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true };
      var DD3MN_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, T_dau: true, T_duoi: true };
      var DDNDB_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, B_dau: true, B_so2: true, B_so3: true, B_so4: true };
      var DDNDB2_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, B_dau: true, B_so2: true, B_so3: true, B_so4: true };
      var DDNDB3_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, T_dau: true, T_duoi: true, B_dau: true, B_so2: true, B_so3: true, B_so4: true };
      var DDC_FIELDS = { D_dau: true, D_duoi: true };
      var DAUCP_FIELDS = { D_dau: true, P_dau: true };
      var DDP_FIELDS = { P_dau: true, P_duoi: true };
      var DAI3_FIELDS = { T_dau: true, T_duoi: true };
      var DUOICP_FIELDS = { D_duoi: true, P_duoi: true };
      var DD3NB_FIELDS = { D_dau: true, D_duoi: true, P_dau: true, P_duoi: true, T_dau: true, T_duoi: true, B_dau: true, B_so2: true, B_so3: true, B_so4: true, B_duoi: true };

      var fieldProfiles = {};
      for (var ci = 0; ci < colA.length; ci += 1) {
        var fieldName = String(colA[ci] || "").trim();
        colA[ci] = fieldName;
        fieldProfiles[fieldName] = {
          blnb: startsWith(fieldName, "D_") || startsWith(fieldName, "P_") || startsWith(fieldName, "B_"),
          blmn: startsWith(fieldName, "D_") || startsWith(fieldName, "P_"),
          bldc: startsWith(fieldName, "D_"),
          bldp: startsWith(fieldName, "P_"),
          bld3: startsWith(fieldName, "T_"),
          blmb: startsWith(fieldName, "B_"),
          dd3d: !!DD3D_FIELDS[fieldName],
          ddmb: !!DDMB_FIELDS[fieldName],
          daub: !!DAUB_FIELDS[fieldName],
          dd2d: !!DD2D_FIELDS[fieldName],
          mndai3: !!DD3MN_FIELDS[fieldName],
          ddndb: !!DDNDB_FIELDS[fieldName],
          ddndb2: !!DDNDB2_FIELDS[fieldName],
          ddndb3: !!DDNDB3_FIELDS[fieldName],
          bl3mn: startsWith(fieldName, "D_") || startsWith(fieldName, "P_") || startsWith(fieldName, "T_"),
          ddc: !!DDC_FIELDS[fieldName],
          daucp: !!DAUCP_FIELDS[fieldName],
          ddp: !!DDP_FIELDS[fieldName],
          ddd3: !!DAI3_FIELDS[fieldName],
          duoicp: !!DUOICP_FIELDS[fieldName],
          dauc: fieldName === "D_dau",
          daup: fieldName === "P_dau",
          duoic: fieldName === "D_duoi",
          duoip: fieldName === "P_duoi",
          daut3: fieldName === "T_dau",
          duoit3: fieldName === "T_duoi",
          duoib: fieldName === "B_duoi",
          dd3nb: !!DD3NB_FIELDS[fieldName],
          blnb3: startsWith(fieldName, "D_") || startsWith(fieldName, "P_") || startsWith(fieldName, "T_") || startsWith(fieldName, "B_"),
          dauc_duoip: fieldName === "D_dau" || fieldName === "P_duoi",
          daup_duoic: fieldName === "P_dau" || fieldName === "D_duoi"
        };
      }

      var states = boSoList.map(function (boSoLabel) {
        return {
          lookup: buildBoSoLookup(boSoLabel),
          result: {
            so: boSoLabel,
            DAU_CP: 0, DAU_C: 0, DAU_P: 0, DAU_T: 0, DAU_B: 0,
            DUOI_CP: 0, DUOI_C: 0, DUOI_P: 0, DUOI_T: 0, DUOI_B: 0,
            DAU_C_DUOI_P: 0, DAU_P_DUOI_C: 0,
            DD_4_NHOM: 0, DD_3_NAM_B_DAU: 0, DD_3_NAM: 0, DD_3_NB: 0, DD_3_NB_DAU: 0,
            DD_2_NAM_B_DAU: 0, DD_2_NAM: 0, DD_C: 0, DD_P: 0, DD_T: 0, DD_B: 0,
            BL_4_NHOM: 0, BL_3_NAM: 0, BL_3_NB: 0, BL_2_NAM: 0, BL_C: 0, BL_P: 0, BL_T: 0, BL_B: 0
          },
          fg: {
            DAU_CP: false, DAU_C: false, DAU_P: false, DAU_T: false, DAU_B: false,
            DUOI_CP: false, DUOI_C: false, DUOI_P: false, DUOI_T: false, DUOI_B: false,
            DAU_C_DUOI_P: false, DAU_P_DUOI_C: false,
            DD_4_NHOM: false, DD_3_NAM_B_DAU: false, DD_3_NAM: false, DD_3_NB: false, DD_3_NB_DAU: false,
            DD_2_NAM_B_DAU: false, DD_2_NAM: false, DD_C: false, DD_P: false, DD_T: false, DD_B: false,
            BL_4_NHOM: false, BL_3_NAM: false, BL_3_NB: false, BL_2_NAM: false, BL_C: false, BL_P: false, BL_T: false, BL_B: false
          }
        };
      });

      function isDone(fg) {
        return fg.DD_3_NB && fg.DD_2_NAM && fg.DD_3_NAM && fg.DD_B &&
          fg.DD_3_NB_DAU &&
          fg.DUOI_B && fg.DAU_B && fg.DD_C && fg.DD_P && fg.DD_T &&
          fg.DAU_T && fg.DUOI_T && fg.DAU_C && fg.DAU_P && fg.DAU_CP &&
          fg.DUOI_C && fg.DUOI_P && fg.DUOI_CP && fg.BL_2_NAM && fg.BL_3_NAM &&
          fg.BL_C && fg.BL_P && fg.BL_T && fg.DD_2_NAM_B_DAU && fg.DD_3_NAM_B_DAU &&
          fg.DD_4_NHOM && fg.BL_4_NHOM && fg.BL_B && fg.BL_3_NB && fg.DAU_C_DUOI_P && fg.DAU_P_DUOI_C;
      }

      for (var r = 0; r < rows.length; r += 1) {
        var day = rows[r] || {};
        var anyPending = false;

        for (var s = 0; s < states.length; s += 1) {
          var st = states[s];
          var fg = st.fg;
          var rs = st.result;
          if (isDone(fg)) continue;
          anyPending = true;

          for (var c = 0; c < colA.length; c += 1) {
            var fieldName = colA[c];
            var value = tail2(day[fieldName]);
            if (!value || !st.lookup[value]) continue;

            var fp = fieldProfiles[fieldName] || {};
            if (fp.blnb) fg.BL_3_NB = true;
            if (fp.blmn) fg.BL_2_NAM = true;
            if (fp.bldc) fg.BL_C = true;
            if (fp.bldp) fg.BL_P = true;
            if (fp.bld3) fg.BL_T = true;
            if (fp.blmb) fg.BL_B = true;
            if (fp.dd3d) fg.DD_3_NB = true;
            if (fp.ddmb) fg.DD_B = true;
            if (fp.daub) fg.DAU_B = true;
            if (fp.dd2d) fg.DD_2_NAM = true;
            if (fp.mndai3) fg.DD_3_NAM = true;
            if (fp.ddndb) fg.DD_3_NB_DAU = true;
            if (fp.ddndb2) fg.DD_2_NAM_B_DAU = true;
            if (fp.ddndb3) fg.DD_3_NAM_B_DAU = true;
            if (fp.bl3mn) fg.BL_3_NAM = true;
            if (fp.ddc) fg.DD_C = true;
            if (fp.daucp) fg.DAU_CP = true;
            if (fp.ddp) fg.DD_P = true;
            if (fp.ddd3) fg.DD_T = true;
            if (fp.duoicp) fg.DUOI_CP = true;
            if (fp.dauc) fg.DAU_C = true;
            if (fp.daup) fg.DAU_P = true;
            if (fp.duoic) fg.DUOI_C = true;
            if (fp.duoip) fg.DUOI_P = true;
            if (fp.daut3) fg.DAU_T = true;
            if (fp.duoit3) fg.DUOI_T = true;
            if (fp.duoib) fg.DUOI_B = true;
            if (fp.dd3nb) fg.DD_4_NHOM = true;
            if (fp.blnb3) fg.BL_4_NHOM = true;
            if (fp.dauc_duoip) fg.DAU_C_DUOI_P = true;
            if (fp.daup_duoic) fg.DAU_P_DUOI_C = true;
          }

          if (!fg.BL_2_NAM) rs.BL_2_NAM += 1;
          if (!fg.BL_3_NB) rs.BL_3_NB += 1;
          if (!fg.BL_C) rs.BL_C += 1;
          if (!fg.BL_P) rs.BL_P += 1;
          if (!fg.BL_T) rs.BL_T += 1;
          if (!fg.DD_2_NAM_B_DAU) rs.DD_2_NAM_B_DAU += 1;
          if (!fg.DD_3_NAM_B_DAU) rs.DD_3_NAM_B_DAU += 1;
          if (!fg.DD_3_NB_DAU) rs.DD_3_NB_DAU += 1;
          if (!fg.BL_3_NAM) rs.BL_3_NAM += 1;
          if (!fg.BL_B) rs.BL_B += 1;
          if (!fg.DD_3_NB) rs.DD_3_NB += 1;
          if (!fg.DD_2_NAM) rs.DD_2_NAM += 1;
          if (!fg.DD_3_NAM) rs.DD_3_NAM += 1;
          if (!fg.DD_B) rs.DD_B += 1;
          if (!fg.DAU_C) rs.DAU_C += 1;
          if (!fg.DAU_P) rs.DAU_P += 1;
          if (!fg.DAU_CP) rs.DAU_CP += 1;
          if (!fg.DUOI_C) rs.DUOI_C += 1;
          if (!fg.DUOI_P) rs.DUOI_P += 1;
          if (!fg.DAU_T) rs.DAU_T += 1;
          if (!fg.DUOI_T) rs.DUOI_T += 1;
          if (!fg.DUOI_CP) rs.DUOI_CP += 1;
          if (!fg.DAU_B) rs.DAU_B += 1;
          if (!fg.DUOI_B) rs.DUOI_B += 1;
          if (!fg.DD_C) rs.DD_C += 1;
          if (!fg.DD_P) rs.DD_P += 1;
          if (!fg.DD_T) rs.DD_T += 1;
          if (!fg.DD_4_NHOM) rs.DD_4_NHOM += 1;
          if (!fg.BL_4_NHOM) rs.BL_4_NHOM += 1;
          if (!fg.DAU_C_DUOI_P) rs.DAU_C_DUOI_P += 1;
          if (!fg.DAU_P_DUOI_C) rs.DAU_P_DUOI_C += 1;
        }

        if (!anyPending) break;
      }

      return states.map(function (st) { return st.result; });
    }

    // Tổng Hợp metrics: replicates TongHop.php logic client-side.
    // opts: { dataMien, fromDate, toDate, heThong, fieldsLoc[], cachList[], ktn, ktd, l2c, tky, tnd }
    // Returns array of metric objects, one per cachList item.
    function buildTongHopMetrics(opts) {
      var cfg = opts || {};
      var heThong = Number(cfg.heThong || 2) === 3 ? 3 : 2;
      var queryMeta = parseLegacyLoaiTimMeta(cfg.queryValue, heThong);
      var fieldsLoc = Array.isArray(cfg.fieldsLoc) ? cfg.fieldsLoc : ["D_", "P_", "T_", "B_"];
      var cachList = Array.isArray(cfg.cachList) ? cfg.cachList : [];
      var queryValue = queryMeta.rawValue;
      var queryText = String(cfg.queryText || queryValue).trim() || queryValue;
      var isTriet = !!cfg.triet;
      var ktn = toSinhThreshold(cfg.ktn, 12);
      var ktd = toSinhThreshold(cfg.ktd, 12);
      var l2c = toSinhThreshold(cfg.l2c, 12);
      var tky = toSinhThreshold(cfg.tky, 52);
      var tnd = toSinhThreshold(cfg.tnd, 7);
      // TongHop.php uses fixed 21 thresholds for detail windows.
      var chiTietNgay = toSinhThreshold(21, 21);
      var chiTietTuan = toSinhThreshold(21, 21);
      var tongNgaySinh = toSinhThreshold(28, 28);
      var tuan2DaiSinh = toSinhThreshold(7, 7);
      var tuanD3Sinh = toSinhThreshold(7, 7);
      var tuan21Sinh = toSinhThreshold(21, 21);

      // buildLegacyTongHopViewModel builds a full date timeline.
      // TongHop.php only iterates real DB rows in [Tu..Den], so we must
      // drop synthetic empty days to avoid +1 drift on Ngay CX/Ky CX.
      var rows = buildLegacyTongHopViewModel({
        dataMien: cfg.dataMien,
        fromDate: cfg.fromDate,
        toDate: cfg.toDate,
        heThong: heThong,
        stepDays: 1
      }).filter(function (row) {
        return hasLegacyDrawData(row, heThong);
      });

      var queryFields = getLegacyQueryFieldList(queryValue, heThong);

      function tailOf(value) {
        var s = String(value || "").trim();
        if (!s || s === "?") return "";
        return s.slice(-heThong);
      }

      // Mirror PHP behavior:
      // - strrpos(".".$field, $prefix) == true
      // - strrpos(".".$NoiDung, right($value, $MaDuoi)) == true
      function fieldMatchesPrefixLikePhp(fieldName, prefix) {
        var fn = String(fieldName || "");
        var p = String(prefix || "");
        if (!fn || !p) return false;
        return (("." + fn).indexOf(p) > 0);
      }

      function valueMatchesNoiDungLikePhp(noiDung, rawValue) {
        var nd = String(noiDung || "").trim();
        if (!nd) return false;
        var rightVal = tailOf(rawValue);
        if (!rightVal) return false;
        return (("." + nd).indexOf(String(rightVal)) > 0);
      }

      // Determine toDate weekday (same approach as PHP $Thu = weekday of $Den)
      var toYmd = normalizeLegacyDateYmd(cfg.toDate);
      var targetDow = -1;
      if (toYmd && toYmd.length >= 8) {
        targetDow = new Date(
          parseInt(toYmd.substring(0,4),10),
          parseInt(toYmd.substring(4,6),10)-1,
          parseInt(toYmd.substring(6,8),10)
        ).getDay();
      }

      function getDow(ymd) {
        if (!ymd || ymd.length < 8) return -1;
        return new Date(
          parseInt(ymd.substring(0,4),10),
          parseInt(ymd.substring(4,6),10)-1,
          parseInt(ymd.substring(6,8),10)
        ).getDay();
      }

      var results = [];

      for (var k = 0; k < cachList.length; k++) {
        var cachItem = cachList[k];
        var isObj = cachItem && typeof cachItem === "object";
        var matchSource = isObj
          ? String(cachItem.searchText || cachItem.noiDung || cachItem.value || cachItem.boSo || cachItem.text || cachItem.key || "")
          : String(cachItem || "");
        var NoiDung = matchSource.trim();
        if (!NoiDung) continue;
        var boSoDisplay = isObj
          ? String(cachItem.boSo || cachItem.text || cachItem.key || matchSource).trim()
          : String(cachItem || "").trim();
        if (!boSoDisplay) boSoDisplay = String(k + 1);
        var cachName = isObj
          ? String(cachItem.cachName || cachItem.noiDungDisplay || cachItem.searchText || cachItem.tCach || cachItem.groupText || cachItem.autoGroupText || cachItem.text || boSoDisplay).trim()
          : String(cachItem || "").trim();
        if (!cachName) cachName = boSoDisplay;
        var sourceGroupId = isObj
          ? String(cachItem.groupId || cachItem.autoGroupId || cachItem.id || cachItem.key || boSoDisplay).trim()
          : String(boSoDisplay || k + 1);
        var sourceGroupText = isObj
          ? String(cachItem.groupText || cachItem.autoGroupText || cachItem.text || cachItem.noiDungDisplay || boSoDisplay).trim()
          : String(boSoDisplay || "").trim();
        var noiDungDisplay = String(matchSource || "")
          .replace(/,/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!noiDungDisplay) noiDungDisplay = boSoDisplay;

        var count = 0, countD = 0, countB = 0, countA = 0, countT = 0, count3D = 0;
        var kqtArr = [], kqnArr = [], ktdArr = [], kqdArr = [];
        var d2dArr = [], b2dArr = [], t2dArr = [], n3dArr = [];
        var d2cArr = [], b2cArr = [], t2cArr = [], n3cArr = [], b3cArr = [], lkd2cArr = [], l3cArr = [];

        var CT = 2, CTuan = 0, CTuanA = 0, CTuanD = 0, CTuanT = 0;
        var CNgay = 1, CNgayB = 1, CNgayA = 1, CNgayA3 = 1, CNgayT = 1, CNgayA4 = 1, CNgayA5 = 1;
        var CDai = 1;
        var CTA = 2, CTD = 2, CTT = 2;

        var LauNgay = 0, LauNgayNB = 0, NgayCXHT = -1, NgayCXHTNB = -1;
        var NgayCXMB = 0, LauNgayMB = 0, NgayCXHTMB = -1;
        var NgayCX3NB = 0, LauNgay3NB = 0, NgayCXHT3NB = -1;
        var NgayCXT = 0, LauNgayT = 0, NgayCXHTT = -1;
        var NgayCX3D = 0, LauNgay3D = 0, NgayCXHT3D = -1;
        var NgayCXDC = 0, LauNgayDC = 0, NgayCXHTDC = -1;
        var NgayCXDP = 0, LauNgayDP = 0, NgayCXHTDP = -1;
        var NgayCX2D = 0, LauNgay2D = 0, NgayCXHT2D = -1;
        var NgayCX = 0, NgayCXNB = 0, LauKy = 0, KyCXHT = -1, KyCX = 0;
        var LanTuan1C = 0, LanTuan2C = 0, LanTuan4C = 0;
        var LanDai = 0, LanTuan = 0, LanTuan21 = 0;
        var LanTuanD2D = 0, LanNgayD2C = 0, LanTuanD3 = 0, LanNgayD3 = 0, LanKTD = 0;
        var LanTongNgaySinh = 0;
        var LanL2C = 0, LanL3C = 0, LanLB3C = 0;

        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var rowYmd = normalizeLegacyDateYmd(row.ID);
          var flgD = (targetDow >= 0 && getDow(rowYmd) === targetDow);

          var CoNgay = 0, CoNgayB = 0, CoNgayA = 0;
          var CoNgayDC = 0, CoNgayDP = 0, CoNgay2D = 0, CoNgayMB = 0;
          var CoNgayT = 0, CoNgay3D = 0, CoNgayB3C = 0, CoNgayA3 = 0;
          var CoDai = 0, CoD2D = 0;

          // Main count: nested loops to match legacy PHP exactly.
          for (var cl = 0; cl < queryFields.length; cl++) {
            var fn = queryFields[cl];
            for (var c1 = 0; c1 < fieldsLoc.length; c1++) {
              if (!fieldMatchesPrefixLikePhp(fn, fieldsLoc[c1])) continue;
              if (valueMatchesNoiDungLikePhp(NoiDung, row[fn])) {
                count++;
                CoNgay++;
                if (flgD) { CoDai++; countD++; }
              }
            }
          }

          // Sub-group counts: hardcoded prefixes (mirrors PHP second loop)
          for (var c2 = 0; c2 < queryFields.length; c2++) {
            var fn2 = queryFields[c2];
            if (!valueMatchesNoiDungLikePhp(NoiDung, row[fn2])) continue;
            var isD2 = fn2.indexOf("D_") >= 0;
            var isP2 = fn2.indexOf("P_") >= 0;
            var isT2 = fn2.indexOf("T_") >= 0;
            var isB2 = fn2.indexOf("B_") >= 0;
            if (isD2 || isP2) { countA++; CoNgayA++; if (flgD) CoD2D++; }
            if (isB2) { CoNgayB++; if (flgD) countB++; }
            if (isD2 || isP2 || isB2) {
              CoNgayA3++;
              if (isD2) CoNgayDC++;
              if (isP2) CoNgayDP++;
              if (isD2 || isP2) CoNgay2D++;
              if (isB2) CoNgayMB++;
            }
            if (isT2) { countT++; CoNgayT++; }
            if (isD2 || isP2 || isT2) CoNgay3D++;
            if (isD2 || isP2 || isT2 || isB2) CoNgayB3C++;
          }

          // Gap tracking (main filter)
          if (CoNgay === 0) { NgayCX++; } else {
            if (NgayCXHT === -1) NgayCXHT = NgayCX; else if (NgayCX > LauNgay) LauNgay = NgayCX;
            NgayCX = 0;
          }
          if (flgD) {
            if (CoDai === 0) { KyCX++; } else {
              if (KyCXHT === -1) KyCXHT = KyCX; else if (KyCX > LauKy) LauKy = KyCX;
              KyCX = 0;
            }
          }
          // NB (D+P+B) gap
          if (CoNgayA3 === 0) { NgayCXNB++; } else {
            if (NgayCXHTNB === -1) NgayCXHTNB = NgayCXNB; else if (NgayCXNB > LauNgayNB) LauNgayNB = NgayCXNB;
            NgayCXNB = 0;
          }
          if (CoNgayDC === 0) { NgayCXDC++; } else {
            if (NgayCXHTDC === -1) NgayCXHTDC = NgayCXDC; else if (NgayCXDC > LauNgayDC) LauNgayDC = NgayCXDC;
            NgayCXDC = 0;
          }
          if (CoNgayDP === 0) { NgayCXDP++; } else {
            if (NgayCXHTDP === -1) NgayCXHTDP = NgayCXDP; else if (NgayCXDP > LauNgayDP) LauNgayDP = NgayCXDP;
            NgayCXDP = 0;
          }
          if (CoNgayMB === 0) { NgayCXMB++; } else {
            if (NgayCXHTMB === -1) NgayCXHTMB = NgayCXMB; else if (NgayCXMB > LauNgayMB) LauNgayMB = NgayCXMB;
            NgayCXMB = 0;
          }
          if (CoNgayB3C === 0) { NgayCX3NB++; } else {
            if (NgayCXHT3NB === -1) NgayCXHT3NB = NgayCX3NB; else if (NgayCX3NB > LauNgay3NB) LauNgay3NB = NgayCX3NB;
            NgayCX3NB = 0;
          }
          if (CoNgayT === 0) { NgayCXT++; } else {
            if (NgayCXHTT === -1) NgayCXHTT = NgayCXT; else if (NgayCXT > LauNgayT) LauNgayT = NgayCXT;
            NgayCXT = 0;
          }
          if (CoNgay3D === 0) { NgayCX3D++; } else {
            if (NgayCXHT3D === -1) NgayCXHT3D = NgayCX3D; else if (NgayCX3D > LauNgay3D) LauNgay3D = NgayCX3D;
            NgayCX3D = 0;
          }
          if (CoNgay2D === 0) { NgayCX2D++; } else {
            if (NgayCXHT2D === -1) NgayCXHT2D = NgayCX2D; else if (NgayCX2D > LauNgay2D) LauNgay2D = NgayCX2D;
            NgayCX2D = 0;
          }

          // KQD weekly (same weekday only)
          if (flgD) {
            if (CDai < chiTietNgay) kqdArr.unshift(String(CoDai));
            if (CDai < tky) LanDai += CoDai;
            CDai++;
          }

          // CT weekly (6-day weeks; CT=2 start matches PHP $CT=2)
          if (CT === 7) {
            CT = 1;
            if (CTuan === 0) LanTuan1C = count;
            else if (CTuan === 1) LanTuan2C = LanTuan1C + count;
            else if (CTuan === 2) LanTuan4C = LanTuan2C + count;
            else if (CTuan === 3) LanTuan4C += count;
            if (CTuan < chiTietTuan) kqtArr.unshift(String(count));
            if (CTuan < ktn) LanTuan += count;
            if (CTuan < tuan21Sinh) LanTuan21 += count;
            count = 0;
            CTuan++;
          } else { CT++; }

          if (CNgay < chiTietNgay) kqnArr.unshift(String(CoNgay));
          if (CNgayA3 < chiTietNgay) lkd2cArr.unshift(String(CoNgayA3));
          if (CNgayT < chiTietNgay) t2cArr.unshift(String(CoNgayT));
          if (CNgayA4 < chiTietNgay) n3cArr.unshift(String(CoNgay3D));
          if (CNgayA5 < chiTietNgay) b3cArr.unshift(String(CoNgayB3C));
          if (CNgayA4 < chiTietNgay) l3cArr.unshift(String(CoNgay3D));
          if (CNgayA3 < l2c) LanL2C += CoNgayA3;
          if (CNgayA4 < l2c) LanL3C += CoNgay3D;
          if (CNgayA5 < l2c) LanLB3C += CoNgayB3C;
          if (CNgay <= tongNgaySinh) LanTongNgaySinh += CoNgay;
          CNgay++;

          if (CTA === 7) {
            CTA = 1;
            if (CTuanA < chiTietTuan) d2dArr.unshift(String(countA));
            if (CTuanA < tuan2DaiSinh) LanTuanD2D += countA;
            countA = 0;
            CTuanA++;
          } else { CTA++; }

          count3D += CoNgay3D;
          if (CTT === 7) {
            CTT = 1;
            if (CTuanT < chiTietTuan) t2dArr.unshift(String(countT));
            if (CTuanT < chiTietTuan) n3dArr.unshift(String(count3D));
            if (CTuanT < tuanD3Sinh) LanTuanD3 += countT;
            countT = 0;
            count3D = 0;
            CTuanT++;
          } else { CTT++; }

          if (flgD) {
            if (CTD === 7) {
              CTD = 1;
              if (CTuanD < chiTietTuan) ktdArr.unshift(String(countD));
              if (CTuanD < ktd) LanKTD += countD;
              if (CTuanD < chiTietTuan) b2dArr.unshift(String(countB));
              countD = 0;
              countB = 0;
              CTuanD++;
            } else { CTD++; }
          }

          if (CNgayA < chiTietNgay) d2cArr.unshift(String(CoNgayA));
          if (CNgayA < tnd) LanNgayD2C += CoNgayA;
          if (CNgayT < tnd) LanNgayD3 += CoNgayT;
          if (CNgayB < chiTietNgay) b2cArr.unshift(String(CoNgayB));
          CNgayB++;
          CNgayA++;
          CNgayA3++;
          CNgayT++;
          CNgayA4++;
          CNgayA5++;
        }

        // Fix: if never found any occurrence, use current running gap
        if (NgayCXHT === -1) NgayCXHT = NgayCX;
        if (NgayCXHTNB === -1) NgayCXHTNB = NgayCXNB;
        if (NgayCXHTDC === -1) NgayCXHTDC = NgayCXDC;
        if (NgayCXHTDP === -1) NgayCXHTDP = NgayCXDP;
        if (NgayCXHTMB === -1) NgayCXHTMB = NgayCXMB;
        if (NgayCXHT3NB === -1) NgayCXHT3NB = NgayCX3NB;
        if (NgayCXHTT === -1) NgayCXHTT = NgayCXT;
        if (NgayCXHT3D === -1) NgayCXHT3D = NgayCX3D;
        if (NgayCXHT2D === -1) NgayCXHT2D = NgayCX2D;
        if (KyCXHT === -1) KyCXHT = KyCX;

        results.push({
          key: ["th", isTriet ? "tr" : "nm", queryValue || "all", boSoDisplay || (k + 1), k].join("_"),
          boSo: boSoDisplay,
          cach: cachName,
          noiDung: noiDungDisplay,
          autoGroupId: sourceGroupId,
          autoGroupText: sourceGroupText,
          autoQueryTypeValue: queryValue,
          autoQueryTypeText: queryText,
          ketQua: "",
          ngayCXHT: NgayCXHT, kyCXHT: KyCXHT, lauNgay: LauNgay,
          lanL2C: LanL2C, lanL3C: LanL3C, lanLB3C: LanLB3C, lanTuan4C: LanTuan4C,
          lanTongNgaySinh: LanTongNgaySinh,
          lauKy: LauKy,
          lauNgayDC: LauNgayDC, ngayCXHTDC: NgayCXHTDC,
          lauNgayDP: LauNgayDP, ngayCXHTDP: NgayCXHTDP,
          lauNgayT: LauNgayT, ngayCXHTT: NgayCXHTT,
          lauNgay2D: LauNgay2D, ngayCXHT2D: NgayCXHT2D,
          lauNgay3D: LauNgay3D, ngayCXHT3D: NgayCXHT3D,
          lauNgayNB: LauNgayNB, ngayCXHTNB: NgayCXHTNB,
          lauNgay3NB: LauNgay3NB, ngayCXHT3NB: NgayCXHT3NB,
          lauNgayMB: LauNgayMB, ngayCXHTMB: NgayCXHTMB,
          lanTuan1C: LanTuan1C, lanTuan2C: LanTuan2C,
          lanDai: LanDai, lanTuan: LanTuan, lanTuan21: LanTuan21,
          lanTuanD2D: LanTuanD2D, lanNgayD2C: LanNgayD2C,
          lanTuanD3: LanTuanD3, lanNgayD3: LanNgayD3,
          lanKTD: LanKTD,
          serKQT: kqtArr.join(" "), serKQN: kqnArr.join(" "),
          serKTD: ktdArr.join(" "), serKQD: kqdArr.join(" "),
          serD2D: d2dArr.join(" "), serB2D: b2dArr.join(" "),
          serT2D: t2dArr.join(" "), serN3D: n3dArr.join(" "),
          serD2C: d2cArr.join(" "), serB2C: b2cArr.join(" "),
          serT2C: t2cArr.join(" "), serN3C: n3cArr.join(" "),
          serB3C: b3cArr.join(" "), serLKD2C: lkd2cArr.join(" "),
          serL3C: l3cArr.join(" ")
        });
      }

      return results;
    }

    function calcThongKeMetrics(kyCounts, options) {
      var arr = Array.isArray(kyCounts) ? kyCounts.slice() : [];
      var opt = options || {};
      var isThongKeMoiMode = !!opt.isThongKeMoi;
      var sapXepMode = Number(opt.sap_xep || 0);
      // Vue `thong_ke_moi`: duyệt mang_ky theo sap_xep, nên chuỗi tính toán phải đảo khi sap_xep=1.
      // Vue `chay_thong_ke`: luôn tính theo k_1..k_n, không đổi theo sap_xep.
      var metricSeq = (isThongKeMoiMode && sapXepMode === 1) ? arr.slice().reverse() : arr.slice();
      var tong = 0;
      var dem = 0;

      // Tính kxh_thong_ke: kỳ không hiện từ đầu đến lần xuất hiện đầu tiên
      var sawHit = false;
      var kxhThongKe = 0;
      for (var j = 0; j < arr.length; j += 1) {
        var vv = Number(arr[j] || 0);
        if (vv > 0) {
          sawHit = true;
          break;
        }
        if (!sawHit) kxhThongKe += 1;
      }

      // Vue thong_ke_moi logic: dùng chuỗi mang_ky theo đúng thứ tự hiển thị để tính khoi_dong/so_lan/bieu_dien.
      var kxh_ht = 0;
      var kxh_ln = 0;  // Lâu nhất giữa các lần xuất hiện
      var khoi_dong = -1;
      var so_lan = 0;
      var so_lan_trung = 0;
      var xet_tiep = true;
      var ra_tiep = 0;
      var bieu_dien = "";
      var kxh_sc = 0;  // Kỳ chốt (breaking point)

      for (var k = 0; k < metricSeq.length; k += 1) {
        var kq = Number(metricSeq[k] || 0);
        if (kq > 0) {
          tong += kq;
          dem += 1;
          // Cập nhật kxh_ln khi gặp lần xuất hiện
          if (kxh_ht > kxh_ln) kxh_ln = kxh_ht;
          
          // Vue thong_ke_moi: chỉ nút này mới tính khoi_dong/so_lan/bieu_dien.
          if (isThongKeMoiMode) {
            ra_tiep++;
            // Xác định khoi_dong và xet_tiep
            if (kxh_ht === 0 && khoi_dong === -1) xet_tiep = false;
            if (khoi_dong === -1) khoi_dong = kxh_ht;
            // Tính so_lan và so_lan_trung
            if (xet_tiep && kxh_ht > 0) {
              if (kxh_ht <= khoi_dong) {
                so_lan += 1;
                if (kxh_ht === khoi_dong) so_lan_trung += 1;
              } else {
                kxh_sc = kxh_ht;  // Lưu điểm chốt
                xet_tiep = false;
              }
              bieu_dien += (bieu_dien ? "," : "") + kxh_ht;
            }
          }
          kxh_ht = 0;
        } else {
          // Không có kết quả
          if (isThongKeMoiMode && xet_tiep) {
            for (var rt = 0; rt < ra_tiep - 1; rt++) {
              bieu_dien += (bieu_dien ? ",0" : "0");
            }
          }
          if (isThongKeMoiMode) ra_tiep = 0;
          kxh_ht++;
        }
        // Kiểm tra end-of-loop: cập nhật kxh_ln
        if (k === metricSeq.length - 1 && kxh_ht > kxh_ln) kxh_ln = kxh_ht;
      }

      // Vue chỉ dùng thoa_man cho thong_ke_moi.
      var kxh_tu_param = Number(opt.kxh_tu || 0);
      var kxh_den_param = Number(opt.kxh_den || 0);
      var kxh_locsau_param = !!opt.kxh_locsau;
      var thoa_man = false;
      if (isThongKeMoiMode) {
        thoa_man = (khoi_dong >= kxh_tu_param && khoi_dong <= kxh_den_param && so_lan > 1);
        if (kxh_locsau_param && so_lan_trung <= 1) thoa_man = false;
      }

      var kxhThongKeMoi = khoi_dong > 0 ? khoi_dong : 0;

      return {
        tong: tong,
        dem: dem,
        kxh: isThongKeMoiMode ? kxhThongKeMoi : kxhThongKe,
        kxh_thong_ke: kxhThongKe,
        kxh_thong_ke_moi: kxhThongKeMoi,
        max_kxh: kxh_ln,
        khoi_dong: isThongKeMoiMode ? (khoi_dong > 0 ? khoi_dong : 0) : 0,
        so_lan: isThongKeMoiMode ? so_lan : 0,
        so_lan_trung: isThongKeMoiMode ? so_lan_trung : 0,
        thoa_man: isThongKeMoiMode ? thoa_man : false,
        bieu_dien: isThongKeMoiMode ? bieu_dien : "",
        kxh_sc: kxh_sc
      };
    }

    function xayDungNguCanhSoChu(dataMienOverride) {
      if (!(so_chu.length && ds_dai_chon_so_chu.length)) {
        return { allowedDateSet: null, historyRows: [] };
      }

      var denDate = chuyenNgay(String(den_ngay || ""), "dd/mm/yyyy");
      var mapData = dataMienOverride || du_lieu_dai_mien;
      var dsData = (mapData[mien] && mapData[mien].data) || [];
      var mangDlLsSoChu = [];

      (ds_dai_chon_so_chu || []).forEach(function (sttRaw) {
        var stt = String(sttRaw || "").trim();
        var duLieuDaiMien = dsData.filter(function (dm) {
          return String(dm.stt) === stt;
        });
        if (Number(loai_tim || 0) === 1) {
          duLieuDaiMien = dsData.filter(function (dm) {
            return String(dm.stt) === stt && String(dm.thu || "") === String(thu_tuan || "");
          });
        }

        duLieuDaiMien.forEach(function (dlD) {
          var obRow = JSON.parse(JSON.stringify(dlD.data || [])).filter(function (obj) {
            var ngay = String((obj && obj.field_ngay) || "").trim();
            if (!ngay) return false;
            if (Number(loai_tim || 0) === 1 && days[chuyenNgay(ngay, "yyyymmdd").getDay()] !== thu_tuan) {
              return false;
            }
            return chuyenNgay(ngay, "yyyymmdd") < denDate;
          }).sort(function (a, b) {
            return chuyenNgay(String((b && b.field_ngay) || "").trim(), "yyyymmdd") - chuyenNgay(String((a && a.field_ngay) || "").trim(), "yyyymmdd");
          });

          if (Number(loai_tim || 0) === 1) {
            obRow = obRow.filter(function (kq) {
              return String((kq && kq.thu) || "") === String(thu_tuan || "");
            });
          }

          obRow.forEach(function (objRow) {
            var dong = JSON.parse(JSON.stringify(objRow || {}));
            dong.thu = days[chuyenNgay(String((dong && dong.field_ngay) || "").trim(), "yyyymmdd").getDay()];
            var ngay = String((dong && dong.field_ngay) || "").trim();
            if (!ngay) return;
            var chkIDXRow = mangDlLsSoChu.findIndex(function (n) {
              return String((n && n.field_ngay) || "").trim() === ngay;
            });

            if (chkIDXRow !== -1) {
              var objNKQ = JSON.parse(JSON.stringify(mangDlLsSoChu[chkIDXRow] || {}));
              Object.keys(dong).forEach(function (tk) {
                if (String(tk || "").indexOf("_") === 0) return;
                if (tk !== "_id" && tk !== "id" && tk !== "thu" && tk !== "field_ngay") {
                  objNKQ["d_" + stt + "_" + tk] = String(dong[tk] || "").trim();
                }
              });
              mangDlLsSoChu[chkIDXRow] = objNKQ;
            } else {
              var objNKQN = {};
              Object.keys(dong).forEach(function (tk) {
                if (String(tk || "").indexOf("_") === 0) return;
                if (tk !== "_id" && tk !== "id" && tk !== "thu" && tk !== "field_ngay") {
                  objNKQN["d_" + stt + "_" + tk] = String(dong[tk] || "").trim();
                } else {
                  objNKQN[tk] = String(dong[tk] || "").trim();
                }
              });
              mangDlLsSoChu.push(objNKQN);
            }
          });
        });
      });

      function hasSoChuMatchOnSelectedStations(kq) {
        var lay = false;
        Object.keys(kq || {}).forEach(function (tk) {
          if (tk !== "_id" && tk !== "id" && tk !== "thu" && tk !== "field_ngay") {
            (ds_dai_chon || []).forEach(function (sttRaw) {
              var stt = String(sttRaw || "").trim();
              if (String(tk).indexOf("d_" + stt + "_") === 0) {
                if ((so_chu || []).find(function (so) { return String(kq[tk] || "").trim().endsWith(String(so || "").trim()); })) {
                  lay = true;
                }
              }
            });
          }
        });
        return lay;
      }

      function hasSoChuMatchAnyField(kq) {
        var lay = false;
        Object.keys(kq || {}).forEach(function (tk) {
          if (tk !== "_id" && tk !== "id" && tk !== "thu" && tk !== "field_ngay") {
            if ((so_chu || []).find(function (so) { return String(kq[tk] || "").trim().endsWith(String(so || "").trim()); })) {
              lay = true;
            }
          }
        });
        return lay;
      }

      var kqSoChu = mangDlLsSoChu.filter(function (kq) {
        return hasSoChuMatchOnSelectedStations(kq);
      });

      var allowedDateSet = new Set(kqSoChu.map(function (obj) {
        return String((obj && obj.field_ngay) || "").trim();
      }).filter(Boolean));

      var ghls = 0;
      var maxLs = Number(ls_bat_dau || 0);
      var kxhNgCuoi = "";
      var daGioiHan = false;
      var historyRows = [];

      mangDlLsSoChu.sort(function (a, b) {
        return chuyenNgay(String((b && b.field_ngay) || "").trim(), "yyyymmdd") - chuyenNgay(String((a && a.field_ngay) || "").trim(), "yyyymmdd");
      }).forEach(function (kq, idx) {
        var lay = hasSoChuMatchAnyField(kq);

        if (lay) {
          if (ghls >= maxLs) {
            if (maxLs === Number(ls_bat_dau || 0) && !daGioiHan) {
              maxLs = ghls;
              daGioiHan = true;
            }
            historyRows.push({
              id: "ls_" + idx + "_" + String((kq && kq.field_ngay) || "").trim(),
              ngay: (kxhNgCuoi ? kxhNgCuoi + " - " : "") + dateFormat(chuyenNgay(String((kq && kq.field_ngay) || "").trim(), "yyyymmdd"), "dd/mm/yyyy"),
              so_ky: ghls,
              stt: historyRows.length + 1
            });
          }
          // Vue gốc để dòng này comment, giữ nguyên hành vi
          // kxhNgCuoi = String((kq && kq.field_ngay) || "").trim();
          ghls = 0;
        } else {
          ghls += 1;
        }
      });

      return { allowedDateSet: allowedDateSet, historyRows: historyRows };
    }

    function buildThongKeTabItems(dataMienOverride, sourceSttList, includeKqTabs, includeHistoryTab, comboSourceSttList) {
      var cfgMien = String(mien || "");
      var cfgLoaiTim = Number(loai_tim || 0);
      var cfgLoaiTk = Number(loai_tk || 1);
      var cfgThuTuan = String(thu_tuan || "");
      var mapData = dataMienOverride || du_lieu_dai_mien;
      var dsData = (mapData[cfgMien] && mapData[cfgMien].data) || [];
      var sourceList = (sourceSttList || []).map(function (x) { return String(x); });
      var comboSourceList = (comboSourceSttList || sourceList).map(function (x) { return String(x); });

      var ds_dai_chon_local = [];
      var sttSeen = {};
      sourceList.forEach(function (sttRaw) {
        var stt = String(sttRaw || "").trim();
        if (!stt || sttSeen[stt]) return;
        sttSeen[stt] = true;

        if (cfgLoaiTim === 0) {
          ds_dai_chon_local.push({ stt: stt, dai: cfgMien + stt, ten_dai: cfgMien + stt });
          return;
        }

        var dlDT = dsData.find(function (dm) {
          return String(dm.stt) === stt && String(dm.thu || "") === cfgThuTuan;
        });
        if (dlDT) ds_dai_chon_local.push({ stt: stt, dai: dlDT.ten_dai, ten_dai: dlDT.ten_dai });
        else ds_dai_chon_local.push({ stt: stt, dai: cfgMien + stt, ten_dai: cfgMien + stt });
      });

      var ds_dai_chonN = ds_dai_chon_local.slice();
      if (includeKqTabs) {
        var mang_cac_dai = getUniqueCombinations(comboSourceList, cfgLoaiTk);
        mang_cac_dai.forEach(function (lstDai) {
          if (cfgLoaiTim === 0) {
            var stt = lstDai.join("&");
            var dai = cfgMien + " " + lstDai.join("&");
            ds_dai_chonN.push({ stt: stt, dai: dai, ten_dai: dai });
          } else if (lstDai.length > 1) {
            var sttN = lstDai.join("&");
            var daiN = cfgMien + " " + lstDai.join("&");
            var tenDaiN = "";
            lstDai.forEach(function (id) {
              var csdai = ds_dai_chon_local.find(function (d) { return String(d.stt) === String(id); });
              if (!csdai) return;
              tenDaiN += (tenDaiN ? " & " : (cfgMien + " ")) + csdai.ten_dai;
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

    function assertSoChuThongKeTabsVueParity(tabItems, options) {
      var opts = options || {};
      var tabs = Array.isArray(tabItems) ? tabItems : [];
      var includeKqTabs = !!opts.includeKqTabs;
      var includeHistoryTab = !!opts.includeHistoryTab;
      var useSoChuSource = !!opts.useSoChuSource;
      var issues = [];

      if (!useSoChuSource) return;

      if (includeHistoryTab) {
        if (!tabs.length || String((tabs[0] && tabs[0].id) || "") !== "lich_su_so_chu") {
          issues.push("missing_or_misordered_history_tab");
        }
      }

      var baseIds = [];
      tabs.forEach(function (t) {
        var id = String((t && t.id) || "");
        if (!id) return;
        if (id === "lich_su_so_chu") return;
        if (id.indexOf("kq_") === 0) return;
        baseIds.push(id);
      });

      if (includeKqTabs) {
        baseIds.forEach(function (id) {
          var kqId = "kq_" + id;
          var idxBase = tabs.findIndex(function (t) { return String((t && t.id) || "") === id; });
          var idxKq = tabs.findIndex(function (t) { return String((t && t.id) || "") === kqId; });
          if (idxBase === -1 || idxKq === -1) {
            issues.push("missing_pair_for_" + id);
            return;
          }
          if (idxKq !== idxBase + 1) {
            issues.push("wrong_pair_order_for_" + id);
          }
        });
      } else {
        var anyKq = tabs.some(function (t) {
          return String((t && t.id) || "").indexOf("kq_") === 0;
        });
        if (anyKq) issues.push("unexpected_kq_tabs_when_includeKqTabs_false");
      }

      if (issues.length) {
        console.warn("[KQXS][SoChu][TabParity] mismatch with Vue rules", {
          issues: issues,
          includeKqTabs: includeKqTabs,
          includeHistoryTab: includeHistoryTab,
          tabIds: tabs.map(function (t) { return String((t && t.id) || ""); })
        });
      }
    }

    function tao_khoa_cache_ds_dai(dsDaiDaLoc) {
      var dsDai = Array.isArray(dsDaiDaLoc) ? dsDaiDaLoc.slice() : [];
      var dsKey = dsDai.map(function (d) {
        return [String(d.mien || ""), String(d.du_lieu_dai || ""), String(d.thu || ""), String(d.stt || "")].join("#");
      }).sort().join("|");
      return [String(mien || ""), String(tu_ngay || ""), String(den_ngay || ""), dsKey].join("||");
    }

    function chuan_hoa_rows_dai(rows, obj) {
      return rows.filter(function (kq) {
        return Boolean(kq && kq.field_ngay);
      }).map(function (kq) {
        var n = Object.assign({}, kq);
        var ngay = String(n.field_ngay || "").trim();
        n.field_ngay = ngay;
        if (!n.thu && ngay) n.thu = days[chuyenNgay(ngay, "yyyymmdd").getDay()];
        n._source_table = String(obj.du_lieu_dai || "");
        n._mien = String(obj.mien || mien || "");
        n._stt = String(obj.stt || "");
        return n;
      });
    }

    async function lay_ds_dai_core(dsDaiDaLoc, opt) {
      var options = opt || {};
      var shouldAbort = typeof options.shouldAbort === "function" ? options.shouldAbort : function () { return false; };
      var setState = options.setState === true;
      var dsDai = Array.isArray(dsDaiDaLoc) ? dsDaiDaLoc.slice() : [];

      dataFetchIntegrityRef.current.incomplete = false;
      dataFetchIntegrityRef.current.reason = "";

      if (!dsDai.length) {
        var emptyNext = {};
        emptyNext[mien] = { data: [] };
        if (setState && !shouldAbort()) setDuLieuDaiMien(emptyNext);
        return emptyNext;
      }

      var cacheKey = tao_khoa_cache_ds_dai(dsDai);
      if (taiDuLieuCacheRef.current[cacheKey]) {
        var cached = taiDuLieuCacheRef.current[cacheKey];
        if (setState && !shouldAbort()) setDuLieuDaiMien(cached);
        return cached;
      }

      if (!taiDuLieuPendingRef.current[cacheKey]) {
        taiDuLieuPendingRef.current[cacheKey] = (async function () {
          var theoDai = {};
          var dataMien = [];

          for (var i = 0; i < dsDai.length; i += 1) {
            if (shouldAbort()) return null;
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
              if (shouldAbort()) return null;
              theoDai[obj.du_lieu_dai] = chuan_hoa_rows_dai(rows, obj);
            }

            dataMien.push({
              mien: obj.mien,
              stt: obj.stt,
              thu: obj.thu,
              ten_dai: obj.ten_dai,
              dai: obj.du_lieu_dai,
              data: theoDai[obj.du_lieu_dai]
            });
          }

          var next = {};
          dataMien.forEach(function (item) {
            var mienKey = String(item.mien || mien || "");
            if (!next[mienKey]) next[mienKey] = { data: [] };
            next[mienKey].data.push(item);
          });
          taiDuLieuCacheRef.current[cacheKey] = next;
          return next;
        })().finally(function () {
          delete taiDuLieuPendingRef.current[cacheKey];
        });
      }

      var loaded = await taiDuLieuPendingRef.current[cacheKey];
      if (!loaded) return;
      if (setState && !shouldAbort()) setDuLieuDaiMien(loaded);
      return loaded;
    }

    async function lay_ds_dai(dsDaiDaLoc) {
      var reqId = taiDuLieuReqRef.current + 1;
      taiDuLieuReqRef.current = reqId;
      return lay_ds_dai_core(dsDaiDaLoc, {
        setState: true,
        shouldAbort: function () { return reqId !== taiDuLieuReqRef.current; }
      });
    }

    async function lay_ds_dai_xem_kq(dsDaiDaLoc) {
      return lay_ds_dai_core(dsDaiDaLoc, { setState: false });
    }

    async function xem_ket_qua() {
      if (!ds_dai_chon.length) {
        canhbao("Vui lòng Chọn Đài trước");
        return;
      }

      setActiveAction("kq");
      setSubTab("ketqua");
      setIsXemthuong(true);
      setDsDaiChonXemKetQua([]);

      try {
        var loadedDataMien = await lay_ds_dai_xem_kq(dsDaiCanTai);
        if (!ensureDataFetchComplete()) return;
        var dsData = (loadedDataMien[mien] && loadedDataMien[mien].data) || [];
        var ymd = Number(dateFormat(chuyenNgay(den_ngay, "dd/mm/yyyy"), "yyyymmdd"));
        var cards = [];
        var xuLy = [];
        var dsDaiChonSorted = (ds_dai_chon || []).slice().sort(function (a, b) {
          return Number(a) - Number(b);
        });

        for (var s = 0; s < 10; s += 1) {
          xuLy.push({ id: "h_" + s, chuc: s });
        }

        dsDaiChonSorted.forEach(function (sttRaw) {
          var stt = Number(sttRaw);
          var bestMatch = null;

          dsData.filter(function (dm) {
            return Number(dm.stt) === stt && String(dm.thu || "") === String(thu_tuan || "");
          }).forEach(function (dlD) {
            var dataDai = Array.isArray(dlD.data) ? dlD.data.slice().filter(function (d) {
              return String(d.thu || "") === String(dlD.thu || "");
            }) : [];

            if (Number(loai_tim) === 0) {
              dataDai = Array.isArray(dlD.data) ? dlD.data.slice() : [];
            }

            var obRow = dataDai.filter(function (obj) {
              return Number(String((obj && obj.field_ngay) || "").trim()) <= ymd;
            }).sort(function (a, b) {
              return Number(String((b && b.field_ngay) || "").trim()) - Number(String((a && a.field_ngay) || "").trim());
            });

            if (!obRow.length) return;
            var candidate = obRow[0];
            var candidateYmd = Number(String((candidate && candidate.field_ngay) || "").trim());
            if (!bestMatch || candidateYmd > bestMatch.ymd) {
              bestMatch = { row: candidate, ymd: candidateYmd, ten_dai: dlD.ten_dai };
            }
          });

          if (!bestMatch || !bestMatch.row) return;
          var kq = bestMatch.row;
          for (var idx = 0; idx < 10; idx += 1) {
            var rowKey = "dai_" + String(stt);
            if (!xuLy[idx][rowKey]) xuLy[idx][rowKey] = "";
          }

          Object.keys(kq).forEach(function (tk) {
            if (tk === "_id" || tk === "id" || tk === "thu" || tk === "field_ngay") return;
            var val = String(kq[tk] || "").trim();
            if (!val) return;
            var so = val.slice(-2);
            if (!/^\d{2}$/.test(so)) return;
            var chuc = Number(so.slice(0, 1));
            var donvi = so.slice(1);
            var key = "dai_" + String(stt);
            if (!xuLy[chuc][key]) xuLy[chuc][key] = "";
            xuLy[chuc][key] += (xuLy[chuc][key] ? "," : "") + donvi;
          });

          cards.push({
            stt: stt,
            ten_dai: bestMatch.ten_dai,
            ngay: dateFormat(chuyenNgay(kq.field_ngay, "yyyymmdd"), "dd/mm/yyyy"),
            data: kq
          });
        });

        setDsDaiChonXemKetQua(cards);
        setXuLyKetQua(xuLy);
      } catch (e) {
        console.error(e);
        canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
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
      // Bước 2: dedup theo ngày, sort giảm dần, slice đến maxSoKy
      Object.keys(rawByStation).forEach(function (stt) {
        mang_dl_dai[stt] = locVaSapXepNgay(rawByStation[stt]).slice(0, maxSoKy);
      });

      var mang_dai = Object.keys(mang_dl_dai);
      var mang_cac_dai = [];
      mang_dai.forEach(function (stt) {
        mang_cac_dai.push([stt]);
      });
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
          var m = calcThongKeMetrics(row.ky || [], { 
            isThongKeMoi: isThongKeMoi, 
            sap_xep: sap_xep,
            kxh_tu: kxh_tu,
            kxh_den: kxh_den,
            kxh_locsau: kxh_locsau
          });
          for (var kk = 0; kk < maxSoKy; kk += 1) {
            row["k_" + String(kk + 1)] = Number((row.ky && row.ky[kk]) || 0);
          }
          // bám theo Vue/bk: kỳ chốt luôn là k_so_ky (k_n)
          var kSoKy = Number(row["k_" + String(maxSoKy)] || 0);
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
          outRows.push(row);
        });
      }

      outRows.sort(function (a, b) {
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
        if (!ensureDataFetchComplete()) return;
        // Vue chỉ chạy luồng số chủ khi có cả dãy số chủ và danh sách đài số chủ.
        var useSoChuSource = so_chu.length > 0 && ds_dai_chon_so_chu.length > 0;
        var soChuCtx = useSoChuSource ? xayDungNguCanhSoChu(loadedDataMien) : { allowedDateSet: null, historyRows: [] };
        var thongKeSource = useSoChuSource ? ds_dai_chon_so_chu : ds_dai_chon;
        var includeKqTabs = (Number(lay_so_ky || 0) + Number(dem_be_hon || 0) + Number(kxh_phai_lonhon || 0) + Number(dem_nho_hon || 0) > 0)
          || (Number(dem_lon_hon || 0) > 0 && so_chu.length > 0);
        // Vue: nút Thống Kê (chay_thong_ke) dùng logic cơ bản
        var thongKeResult = await buildThongKeData(false, soChuCtx.allowedDateSet, thongKeSource, loadedDataMien);
        var rows = (thongKeResult && Array.isArray(thongKeResult.rows)) ? thongKeResult.rows : [];
        var mangDaiTabs = (thongKeResult && Array.isArray(thongKeResult.mang_dai)) ? thongKeResult.mang_dai : thongKeSource;
        var tabItems = buildThongKeTabItems(loadedDataMien, thongKeSource, includeKqTabs, useSoChuSource, mangDaiTabs);
        assertSoChuThongKeTabsVueParity(tabItems, {
          includeKqTabs: includeKqTabs,
          includeHistoryTab: useSoChuSource,
          useSoChuSource: useSoChuSource
        });
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
        if (!ensureDataFetchComplete()) return;
        // Vue: nút Thống Kê Mới (thong_ke_moi) dùng logic nâng cao (thoa_man/bieu_dien)
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
          // Cache runtime proxy so next cap_nhat calls in the same auto run reuse it.
          window.csmKqxsProxyConfig = Object.assign(
            readJsonObject(window.csmKqxsProxyConfig),
            {
              enabled: true,
              server: tmInfo.server,
              username: tmInfo.username,
              password: tmInfo.password,
              tmproxyApiKey: proxyCfg.tmproxyApiKey,
              tmproxyLocationId: proxyCfg.tmproxyLocationId
            }
          );
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
      setAutoUpdateProgressVisible(true);
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
        setTimeout(function () {
          setProgress(0);
          setAutoUpdateProgressVisible(false);
        }, 800);
      }
    }

    function getLegacyLocList() {
      var out = [];
      Object.keys(legacyLocMap || {}).forEach(function (k) {
        if (legacyLocMap[k]) out.push(k);
      });
      if ((legacyLocMap || {}).B_dau) {
        out.push("B_so2", "B_so3");
        if (Number(legacyHeThong || 2) === 2) out.push("B_so4");
      }
      var unique = {};
      var clean = [];
      out.forEach(function (k) {
        if (!unique[k]) {
          unique[k] = true;
          clean.push(k);
        }
      });
      return clean;
    }

    function setLegacyKttStationEnabled(prefix, enabled) {
      var p = String(prefix || "").toUpperCase();
      var flag = !!enabled;
      setLegacyLocMap(function (prev) {
        var next = Object.assign({}, prev || {});
        if (p === "D") {
          next.D_dau = flag;
          next.D_duoi = flag;
        } else if (p === "P") {
          next.P_dau = flag;
          next.P_duoi = flag;
        } else if (p === "T") {
          next.T_dau = flag;
          next.T_duoi = flag;
        } else if (p === "B") {
          next.B_dau = flag;
          next.B_duoi = flag;
        }
        return next;
      });
    }

    function getLegacyTongHopFieldPrefixes() {
      var prefixMap = { D_dau: "D_", D_duoi: "D_", P_dau: "P_", P_duoi: "P_", T_dau: "T_", T_duoi: "T_", B_dau: "B_", B_duoi: "B_" };
      var seen = {};
      var out = [];
      Object.keys(legacyLocMap || {}).forEach(function (k) {
        if (!legacyLocMap[k]) return;
        var prefix = prefixMap[k];
        if (prefix && !seen[prefix]) {
          seen[prefix] = true;
          out.push(prefix);
        }
      });
      return out.length ? out : ["D_", "P_", "T_", "B_"];
    }

    function getLegacyTongHopFieldPrefixesFromQueryTypes() {
      var selected = Array.isArray(legacyThSelectedQueryTypes) ? legacyThSelectedQueryTypes : [];
      if (!selected.length) return [];
      var raw = String(selected[0] || "");
      if (!raw) return [];
      var parsed = raw.split("-").map(function (s) { return String(s || "").trim(); }).filter(function (s) {
        return s === "D_" || s === "P_" || s === "T_" || s === "B_";
      });
      var unique = {};
      var out = [];
      parsed.forEach(function (p) {
        if (unique[p]) return;
        unique[p] = true;
        out.push(p);
      });
      return out;
    }

    function getLegacyTongHopCachListFromSelectedGroups(useTrietOverride) {
      var useTriet = typeof useTrietOverride === "boolean" ? useTrietOverride : !!legacyThUseTrietSource;
      var sourceGroups = useTriet ? (legacyThGroupTrietOptions || []) : (legacyThGroupOptions || []);
      var selectedIds = useTriet ? (legacyThSelectedGroupsTriet || []) : (legacyThSelectedGroups || []);
      var selectedMap = {};
      selectedIds.forEach(function (id) {
        selectedMap[String(id)] = true;
      });

      var lastNoiDungByKieuTim = {};
      sourceGroups.forEach(function (g) {
        var kt = String((g && g.kieuTim) || "").trim();
        var nd = String((g && (g.searchText || g.noiDungDisplay || g.tCach || g.text)) || "").trim();
        if (!kt || !nd) return;
        // TongHop.php assigns NoiDung in a while-loop, so last row per KieuTim wins.
        lastNoiDungByKieuTim[kt] = nd;
      });

      var out = [];
      var seen = {};
      sourceGroups.forEach(function (g) {
        if (!selectedMap[String(g && g.id)]) return;
        var groupLabel = String((g && g.text) || (g && g.id) || "").trim();
        var kieuTim = String((g && g.kieuTim) || "").trim();
        var noiDung = String((kieuTim && lastNoiDungByKieuTim[kieuTim]) || (g && g.searchText) || (g && g.noiDungDisplay) || (g && g.tCach) || "").trim();
        if (!noiDung) {
          noiDung = String((g && g.cachIds) || "").split(",").map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" ");
        }
        if (!noiDung) return;
        var cachDisplay = String(noiDung || "").replace(/,/g, " ").replace(/\s+/g, " ").trim() || groupLabel || noiDung;
        var sig = String((g && g.id) || groupLabel || noiDung);
        if (seen[sig]) return;
        seen[sig] = true;
        out.push({
          key: sig,
          boSo: String((g && g.noiDungDisplay) || groupLabel || noiDung).trim() || noiDung,
          cachName: cachDisplay,
          searchText: noiDung,
          noiDungDisplay: cachDisplay
        });
      });

      return out;
    }

    function buildLegacyTongHopInputCachList() {
      var raw = String(legacyThSoInput || "").toLowerCase();
      raw = raw.replace(/ /g, ",").replace(/-/g, ",");
      if (!raw.trim()) return [];

      if (!legacyThUseGroupSource) {
        return raw.split(",").map(function (part, idx) {
          var token = String(part || "").trim();
          if (!token) return null;
          return {
            key: "th_input_" + idx + "_" + token,
            boSo: token,
            cachName: token,
            searchText: token,
            noiDungDisplay: token
          };
        }).filter(Boolean);
      }

      return raw.split("@").map(function (part, idx) {
        var token = String(part || "").trim();
        if (!token) return null;
        return {
          key: "th_input_group_" + idx + "_" + token.replace(/\s+/g, "_"),
          boSo: token.replace(/,/g, " "),
          cachName: token,
          searchText: token,
          noiDungDisplay: token.replace(/,/g, " "),
          isManualGroup: true
        };
      }).filter(Boolean);
    }

    function getLegacyTongHopResolvedCachList(useTrietOverride) {
      var inputItems = buildLegacyTongHopInputCachList();
      if (inputItems.length) return inputItems;
      var groupItems = getLegacyTongHopCachListFromSelectedGroups(useTrietOverride);
      return groupItems;
    }

    function getLegacySpecialQueryTypeForTab(tabKey) {
      var tab = String(tabKey || "").toLowerCase();
      var options = (legacyThQueryTypeOptions && legacyThQueryTypeOptions.length)
        ? legacyThQueryTypeOptions
        : buildLegacyThDefaultQueryTypeDefs(legacyHeThong);
      var byValue = {};
      options.forEach(function (item) {
        var k = String((item && item.value) || "").trim();
        if (!k) return;
        byValue[k] = item;
      });

      var selectedTh = getLegacyThSelectedQueryTypeItems();
      var slrRaw = parseLegacyLoaiTimMeta(legacySlrQueryValue, legacyHeThong).rawValue;
      var slrItem = byValue[slrRaw] || null;
      var thItem = (selectedTh && selectedTh.length) ? selectedTh[0] : null;

      var fallback = options[0] || {
        value: getLegacySlrDefaultQueryValue(legacyHeThong),
        text: ""
      };

      var picked = null;
      if (tab === "slr") {
        picked = slrItem || thItem || fallback;
      } else {
        // KTT/NamBac dùng cùng query chính như Tổng Hợp.
        picked = thItem || slrItem || fallback;
      }

      return {
        value: String((picked && picked.value) || fallback.value || ""),
        text: String((picked && picked.text) || "")
      };
    }

    async function loadLegacySpecialDataByQuery(queryValue) {
      var sourceStations = getLegacyTongHopSourceStations(queryValue);
      if (!sourceStations.length) {
        canhbao("Vui lòng chọn miền và đài trước");
        return null;
      }

      var loaded = await lay_ds_dai_xem_kq(sourceStations);
      if (!ensureDataFetchComplete()) return null;

      var dataMien = [];
      Object.keys(loaded || {}).forEach(function (mk) {
        var bucket = loaded[mk];
        if (!bucket || !Array.isArray(bucket.data)) return;
        dataMien = dataMien.concat(bucket.data);
      });

      return dataMien;
    }

    async function runLegacyKiemTraTongHop() {
      setLoading(true);
      setProgress(15);
      try {
        var kttQueryType = getLegacySpecialQueryTypeForTab("ktt");
        var dataMien = await loadLegacySpecialDataByQuery(kttQueryType.value);
        if (!dataMien) return;
        if (!dataMien.length) {
          canhbao("Không có dữ liệu để kiểm tra tổng hợp");
          return;
        }
        var locList = getLegacyLocList();
        var rows = buildLegacyTongHopViewModel({
          dataMien: dataMien,
          fromDate: tu_ngay,
          toDate: den_ngay,
          heThong: legacyHeThong,
          locList: locList,
          stepDays: 1
        });
        var searchLen = legacyHeThong === 3 ? 3 : 2;
        var rawSearch = String(so_chu_input || "").trim().toLowerCase();
        var hasSearch = rawSearch.length > 0;
        var haystack = " " + rawSearch;
        var matchSet = {};
        function tokenMatchedByRawSearch(token) {
          var t = String(token || "").trim().toLowerCase();
          if (!t || t === "?") return false;
          return haystack.indexOf(t) >= 0;
        }
        // PHP logic: countTong đếm số lần B_duoi khớp trong tuần (T3→T2),
        // hiển thị (N) bên cạnh B_duoi của ngày T2 (weekday=1).
        var clickLookup = {};
        if (!hasSearch) {
          try {
            var timkiemtrRows = await fetchRowsFromGetTableData("kqxs_timkiemtr", legacyHeThong);
            clickLookup = buildLegacyKttLookupFromTimKiemTrRows(timkiemtrRows, legacyHeThong);
          } catch (_kttMapErr) {
            clickLookup = {};
          }
        }
        if (hasSearch) {
          var countTong = 0;
          var activeLocListCount = getLegacyLocList();
          for (var ri = 0; ri < rows.length; ri += 1) {
            var r = rows[ri] || {};
            var dow = kttWeekdayFromYmd(normalizeLegacyDateYmd(r.ID));
            for (var fi = 0; fi < activeLocListCount.length; fi += 1) {
              var fieldName = String(activeLocListCount[fi] || "");
              var val = String(r[fieldName] || "").trim();
              var token = val.slice(-searchLen);
              if (!tokenMatchedByRawSearch(token)) continue;
              countTong += 1;
              matchSet[token] = true;
            }
            if (dow === 1) { // Thứ 2 (Monday) = ngày cuối tuần XS Nam
              r.kttMonWeekCount = countTong;
              countTong = 0;
            }
          }
        } else {
          var chronoRows = rows.slice().reverse(); // ASC (cũ → mới)
          var weekCount = 0;
          var tokenRe = new RegExp("^\\\\d{" + searchLen + "}$");
          for (var ri = 0; ri < chronoRows.length; ri += 1) {
            var r = chronoRows[ri];
            var dow = kttWeekdayFromYmd(normalizeLegacyDateYmd(r.ID));
            var bduoiVal = String(r.B_duoi || "").trim();
            var bduoiKey = bduoiVal.slice(-searchLen);
            if (tokenRe.test(bduoiKey) && matchSet[bduoiKey]) weekCount += 1;
            if (dow === 1) { // Thứ 2 (Monday) = ngày cuối tuần XS Nam
              r.kttMonWeekCount = weekCount;
              weekCount = 0;
            }
          }
          // Legacy behavior when no So input:
          // progressively accumulate aliases from timkiemtr and mark already-known tokens per row/field.
          var tokenReNoSearch = new RegExp("^\\\\d{" + searchLen + "}$");
          var activeLocList = getLegacyLocList();
          var allFieldList = getLegacyAllNormalizedFieldKeys();
          var accSet = {};
          for (var nri = 0; nri < rows.length; nri += 1) {
            var rowNs = rows[nri] || {};
            var autoHitMap = {};

            for (var li = 0; li < activeLocList.length; li += 1) {
              var keyNs = String(activeLocList[li] || "");
              var tokenNs = String(rowNs[keyNs] || "").trim().slice(-searchLen);
              if (!tokenReNoSearch.test(tokenNs)) continue;
              if (accSet[tokenNs]) autoHitMap[keyNs] = true;
            }
            rowNs.kttAutoHit = autoHitMap;

            // PHP old code expands So from all data fields in each row, not only checked Loc fields.
            for (var lj = 0; lj < allFieldList.length; lj += 1) {
              var expKey = String(allFieldList[lj] || "");
              var baseToken = String(rowNs[expKey] || "").trim().slice(-searchLen);
              if (!tokenReNoSearch.test(baseToken)) continue;
              var mapped = String((clickLookup && clickLookup[baseToken]) || baseToken || "").trim();
              var expTokens = parseSoChuByHeThong(mapped, legacyHeThong);
              if (!expTokens.length) expTokens = [baseToken];
              for (var ei = 0; ei < expTokens.length; ei += 1) {
                var tk = String(expTokens[ei] || "").trim();
                if (tokenReNoSearch.test(tk)) accSet[tk] = true;
              }
            }
          }
        }
        setLegacyKttMatchSet(matchSet);
        setLegacyKttClickMap(clickLookup);
        setLegacyKttHasSearchInput(hasSearch);
        setLegacyKttRows(rows);
        setActiveAction("legacy_ktt");
        setSubTab("legacy_ktt");
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Không thể chạy KiemTraTongHop");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    function buildLegacySoLauRaRuntimeConfig(dataMien, timkiemRows, queryValueOverride) {
      var slrNgayChay = legacyTheoKy ? legacyNgayChay * 7 : legacyNgayChay;
      var slrStep = (legacyTheoKy && legacyTheoThu) ? 7 : 1;
      var queryValue = String(queryValueOverride || legacySlrQueryValue || "");
      var baseCfg = {
        dataMien: dataMien,
        fromDate: tu_ngay,
        toDate: den_ngay,
        heThong: legacyHeThong,
        queryValue: queryValue,
        mode: legacyCdMode,
        rankFrom: legacyRankFrom,
        rankTo: legacyRankTo,
        ngayChay: slrNgayChay,
        chkHieu: legacyChkHieu,
        theoKy: legacyTheoKy,
        theoThu: legacyTheoThu,
        fixedThuLabel: (legacyTheoKy && legacyTheoThu) ? legacySlrThuLabelFromYmd(normalizeLegacyDateYmd(den_ngay)) : "",
        stepDays: slrStep,
        candidateList: buildLegacySoLauRaCandidatesFromTimKiemRows(timkiemRows, legacyHeThong, legacyCdMode, legacyChkHieu)
      };

      var slrDenAdj = den_ngay;
      if (!legacyTheoKy || !legacyTheoThu) {
        var slrDenDate = chuyenNgay(slrDenAdj, "dd/mm/yyyy");
        var slrDow = slrDenDate ? (slrDenDate.getDay() === 0 ? 7 : slrDenDate.getDay()) : 7;
        slrDenAdj = CongNgay(slrDenAdj, 7 - slrDow, "dd/mm/yyyy");
      }

      var slrTuAdj = tu_ngay;
      var slrTuDate = chuyenNgay(slrTuAdj, "dd/mm/yyyy");
      var slrTuDow = slrTuDate ? (slrTuDate.getDay() === 0 ? 7 : slrTuDate.getDay()) : 1;
      slrTuAdj = CongNgay(slrTuAdj, 1 - slrTuDow, "dd/mm/yyyy");

      var slrBroadFrom = CongNgay(slrTuAdj, -Math.max(0, Number(slrNgayChay || 0)), "dd/mm/yyyy");
      var slrBaseRows = buildLegacyTongHopViewModel(Object.assign({}, baseCfg, {
        fromDate: slrBroadFrom,
        toDate: den_ngay,
        stepDays: 1
      })).filter(function (row) {
        return hasLegacyDrawData(row, legacyHeThong);
      });
      var slrDayRowMap = {};
      for (var sbi = 0; sbi < slrBaseRows.length; sbi += 1) {
        var sbYmd = normalizeLegacyDateYmd(slrBaseRows[sbi] && slrBaseRows[sbi].ID);
        if (sbYmd && !slrDayRowMap[sbYmd]) slrDayRowMap[sbYmd] = slrBaseRows[sbi];
      }

      var rowsCfg = Object.assign({}, baseCfg, {
        fromDate: slrBroadFrom,
        toDate: den_ngay,
        baseRows: slrBaseRows,
        dayRowMap: slrDayRowMap
      });
      var weekCfg = Object.assign({}, baseCfg, {
        fromDate: tu_ngay,
        toDate: den_ngay,
        baseRows: slrBaseRows,
        dayRowMap: slrDayRowMap
      });

      return { rowsCfg: rowsCfg, weekCfg: weekCfg };
    }

    async function runLegacySoLauRa() {
      setLoading(true);
      setProgress(15);
      try {
        var slrQueryType = getLegacySpecialQueryTypeForTab("slr");
        var dataMien = await loadLegacySpecialDataByQuery(slrQueryType.value);
        if (!dataMien) return;
        var timkiemRows = [];
        try {
          timkiemRows = await fetchRowsFromGetTableData("kqxs_timkiem", legacyHeThong);
        } catch (_slrTkErr) {
          timkiemRows = [];
        }

        if (!Array.isArray(timkiemRows) || !timkiemRows.length) {
          setLegacySlrRows([]);
          setLegacySlrWeekRows([]);
          canhbao("Không có dữ liệu timkiem để tính SoLauRaNamBac theo đúng logic PHP");
          return;
        }

        var runtimeCfg = buildLegacySoLauRaRuntimeConfig(dataMien, timkiemRows, slrQueryType.value);
        var rows = buildLegacySoLauRaViewModel(runtimeCfg.rowsCfg);
        var weekRows = buildLegacySoLauRaWeekRows(runtimeCfg.weekCfg);
        setLegacySlrRows(rows);
        setLegacySlrWeekRows(weekRows);
        setActiveAction("legacy_slr");
        setSubTab("legacy_slr");
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Không thể chạy SoLauRaNamBac");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    async function runLegacyNamBac() {
      setLoading(true);
      setProgress(15);
      try {
        // NamBac.php is fixed to MaDuoi=2; keep JS runner identical for strict parity.
        var he = 2;
        setProgress(30);
        
        // Fetch sp_Get2_BL3 data: D_, P_, T_, B_ columns
        // Mirrors PHP query: SELECT sp_Get2_BL3_Fields WHERE ID <= Den AND ID >= Tu ORDER BY ID DESC
        var nbQueryValue = "sp_Get2_BL3,D_-P_-T_-B_";
        var dataMien = await loadLegacySpecialDataByQuery(nbQueryValue);
        
        if (!dataMien || !dataMien.length) {
          canhbao("Không có dữ liệu để chạy Thống Kê Nam-Bắc");
          return;
        }
        setProgress(40);
        
        // Fetch timkiem groups — mirrors PHP: SELECT NoiDung FROM timkiem WHERE (LENGTH(concat(noidung,' '))/3)=NH AND MaDuoi=2
        var timkiemRows = [];
        try {
          timkiemRows = await fetchRowsFromGetTableData("kqxs_timkiem", he);
        } catch (_nbTkErr) { timkiemRows = []; }
        setProgress(60);
        
        var selectedSize = Number(legacyNbGroupSize || 0);
        var boSoSource = [];
        if (Array.isArray(timkiemRows) && timkiemRows.length && selectedSize > 0) {
          for (var _nbi = 0; _nbi < timkiemRows.length; _nbi++) {
            var _nbRow = timkiemRows[_nbi] || {};
            var _nbMaDuoi = Number(_nbRow.ma_duoi || _nbRow.MaDuoi || 0);
            if (_nbMaDuoi && _nbMaDuoi !== 2) continue;
            var _nbNd = String(_nbRow.noi_dung || _nbRow.NoiDung || "").trim();
            if (!_nbNd) continue;
            var _nbNh = ((_nbNd + " ").length) / 3;
            if (_nbNh !== selectedSize) continue;
            boSoSource.push(_nbNd);
          }
        }
        if (!boSoSource.length) {
          canhbao("Không có bộ số cho nhóm " + selectedSize + " số theo dữ liệu timkiem.");
          return;
        }
        setProgress(80);
        
        var rows = buildLegacyNamBacSummary({
          dataMien: dataMien,
          fromDate: tu_ngay,
          toDate: den_ngay,
          heThong: he,
          queryValue: nbQueryValue,
          boSoList: boSoSource,
          theoKy: legacyNbTheoKy,
          stepDays: 1
        });
        setLegacyNbRows(rows);
        setActiveAction("legacy_nb");
        setSubTab("legacy_nb");
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Không thể chạy Thống Kê Nam-Bắc: " + (e && e.message || ""));
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    async function runLegacyTongHop(useTrietOverride) {
      var cachList = getLegacyTongHopResolvedCachList(useTrietOverride);
      if (!cachList.length) {
        canhbao("Vui lòng nhập Số hoặc chọn Nhóm/Cách cần phân tích");
        return;
      }
      setLoading(true);
      setProgress(15);
      try {
        var selectedQueryItems = getLegacyThSelectedQueryTypeItems();
        var queryType = selectedQueryItems.length
          ? selectedQueryItems[0]
          : buildLegacyThDefaultQueryTypeDefs(legacyHeThong)[0];
        var rows = await fetchLegacyTongHopRowsFromApi({
          triet: typeof useTrietOverride === "boolean" ? useTrietOverride : !!legacyThUseTrietSource,
          queryValue: queryType.value,
          queryText: queryType.text,
          cachItems: cachList
        });
        setLegacyThRows(rows);
        legacySortedRowsRef.current["th_main"] = null;
        setLegacyThAutoRows([]);
        legacySortedRowsRef.current["th_auto"] = null;
        setLegacyThAutoPinnedFullAuto(false);
        setLegacyThIntersect("");
        setLegacyThManualSelectedRowKeys([]);
        setLegacyThIntersectManual("");
        setLegacyThParityStatus("");
        setActiveAction("legacy_th");
        setSubTab("legacy_th");
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao(String((e && e.message) || "") === "missing_legacy_station_source" ? "Không tạo được nguồn đài cho Tổng Hợp từ MaQuery đang chọn" : "Không thể chạy Tổng Hợp");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    function buildLegacyTongHopResultMaskCsv() {
      var out = [];
      (legacyThResultItems || []).forEach(function (item) {
        if (!item || !item.key || !item.code) return;
        if (!legacyThResultMask[item.key]) return;
        out.push(item.code);
      });
      return out.join(",");
    }

    var LEGACY_BONG_VARIANTS = [
      { value: "bong", label: "Bóng DV" },
      { value: "bong_chuc", label: "Bóng Chục" },
      { value: "bong_l", label: "Bóng L" },
      { value: "bong_l_chuc", label: "Bóng L Chục" },
      { value: "bong_do_chuc", label: "Bóng Dò Chức" },
      { value: "bong_chuc_do_dv", label: "Bóng Chục Dò ĐV" },
      { value: "bong_l_do_chuc", label: "Bóng L Dò Chức" },
      { value: "bong_l_chuc_do_dv", label: "Bóng L Chục Dò ĐV" }
    ];

    function getLegacyBongVariantMeta(variantValue) {
      var key = String(variantValue || "bong");
      for (var i = 0; i < LEGACY_BONG_VARIANTS.length; i += 1) {
        if (String(LEGACY_BONG_VARIANTS[i].value) === key) return LEGACY_BONG_VARIANTS[i];
      }
      return LEGACY_BONG_VARIANTS[0];
    }

    function formatLegacyBongItemDate(idValue) {
      var id = String(idValue || "").trim();
      if (id === "HT") return "HT";
      if (/^\d{8}$/.test(id)) return id.slice(6, 8) + "/" + id.slice(4, 6) + "/" + id.slice(0, 4);
      return id;
    }

    var LEGACY_BONG_FIELD_NAMES = ["D_dau", "D_duoi", "P_dau", "P_duoi", "B_dau", "B_so2", "B_so3", "B_so4", "B_duoi"];
    var LEGACY_BONG_DIGIT_MAP = [5, 6, 7, 8, 9, 0, 1, 2, 3, 4];
    var LEGACY_BONG_VARIANT_CONFIGS = {
      bong: {
        statsTitle: "Cách 01.Bong Nho DV",
        direction: "min",
        sourceExtractor: "unit",
        compareExtractor: "unit",
        overlayExtractor: "unit",
        headerQuestionFirst: true
      },
      bong_chuc: {
        statsTitle: "Cách 02.Bong Nho Chuc",
        direction: "min",
        sourceExtractor: "tens",
        compareExtractor: "tens",
        overlayExtractor: "tens",
        headerQuestionFirst: false
      },
      bong_l: {
        statsTitle: "Cách 03.Bong Lon DV",
        direction: "max",
        sourceExtractor: "unit",
        compareExtractor: "unit",
        overlayExtractor: "unit",
        headerQuestionFirst: true
      },
      bong_l_chuc: {
        statsTitle: "Cách 04.Bong Lon Chuc",
        direction: "max",
        sourceExtractor: "tens",
        compareExtractor: "tens",
        overlayExtractor: "tens",
        headerQuestionFirst: false
      },
      bong_chuc_do_dv: {
        statsTitle: "Cách 05.Bong Nho Chuc Do DV",
        direction: "min",
        sourceExtractor: "tens",
        compareExtractor: "unit",
        overlayExtractor: "unit",
        headerQuestionFirst: false
      },
      bong_l_chuc_do_dv: {
        statsTitle: "Cách 05.Bong Lon Chuc Do DV",
        direction: "max",
        sourceExtractor: "tens",
        compareExtractor: "unit",
        overlayExtractor: "unit",
        headerQuestionFirst: false
      },
      bong_l_do_chuc: {
        statsTitle: "Cách 07.Bong Lon Don Vi Do Chuc",
        direction: "max",
        sourceExtractor: "unit",
        compareExtractor: "tens",
        overlayExtractor: "tens",
        headerQuestionFirst: true
      },
      bong_do_chuc: {
        statsTitle: "Cách 08.Bong Nho Don Vi Do Chuc",
        direction: "min",
        sourceExtractor: "unit",
        compareExtractor: "tens",
        overlayExtractor: "unit",
        headerQuestionFirst: true
      }
    };

    function getLegacyBongVariantConfig(variantValue) {
      var key = String(variantValue || "bong");
      return LEGACY_BONG_VARIANT_CONFIGS[key] || LEGACY_BONG_VARIANT_CONFIGS.bong;
    }

    function getLegacyBongTailText(value) {
      return String(value || "").trim().slice(-2);
    }

    function extractLegacyBongDigitByMode(value, mode) {
      var tail = getLegacyBongTailText(value);
      if (!tail) return -1;
      var normalizedMode = String(mode || "unit").toLowerCase();
      var charAt = normalizedMode === "tens" ? 0 : (tail.length - 1);
      var digitChar = tail.charAt(charAt);
      return /^\d$/.test(digitChar) ? Number(digitChar) : -1;
    }

    function countLegacyBongDigits(row, mode) {
      var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      LEGACY_BONG_FIELD_NAMES.forEach(function (field) {
        var digit = extractLegacyBongDigitByMode(row && row[field], mode);
        if (digit >= 0 && digit <= 9) counts[digit] += 1;
      });
      return counts;
    }

    function findLegacyBongRepeatedDigit(counts, direction) {
      var arr = Array.isArray(counts) ? counts : [];
      if (String(direction || "min") === "max") {
        var maxDigit = -1;
        for (var i = 0; i < arr.length; i += 1) {
          if (Number(arr[i] || 0) > 1 && i > maxDigit) maxDigit = i;
        }
        return maxDigit;
      }
      for (var j = 0; j < arr.length; j += 1) {
        if (Number(arr[j] || 0) > 1) return j;
      }
      return -1;
    }

    function mapLegacyBongDigit(sourceDigit) {
      var digit = Number(sourceDigit);
      if (!isFinite(digit) || digit < 0 || digit > 9) return -1;
      return Number(LEGACY_BONG_DIGIT_MAP[digit]);
    }

    function buildLegacyBongHeaderHtml(mappedDigit, questionFirst) {
      if (!isFinite(mappedDigit) || mappedDigit < 0) return "<strong>?</strong>";
      if (questionFirst) {
        return "<strong>?<font color=\"red\"  size=\"+1\">" + String(mappedDigit) + "</font></strong>";
      }
      return "<strong><font color=\"red\"  size=\"+1\">" + String(mappedDigit) + "</font>?</strong>";
    }

    function buildLegacyBongWeekMarkerHtml(bucketSouthHits, bucketTotalHits) {
      var totalText = bucketTotalHits <= 2
        ? ("<font color=\"red\"  size=\"+1\" >" + String(bucketTotalHits) + "</font>")
        : String(bucketTotalHits);
      return "<font color=\"black\"  size=\"-5\" >(" + String(bucketSouthHits) + "+" + String(bucketTotalHits - bucketSouthHits) + "=" + totalText + ")</font>";
    }

    function buildLegacyBongCellHtml(rawValue, cfg, mappedDigit, overlayDigit, extraHtml) {
      var tailText = getLegacyBongTailText(rawValue);
      var compareDigit = extractLegacyBongDigitByMode(rawValue, cfg.compareExtractor);
      var overlayMatch = overlayDigit >= 0 && extractLegacyBongDigitByMode(rawValue, cfg.overlayExtractor) === overlayDigit;
      var inner = (overlayMatch ? ("<font color=\"blue\" size=\"-8\">" + String(overlayDigit) + "</font>") : "")
        + tailText
        + String(extraHtml || "");
      var isHit = mappedDigit >= 0 && compareDigit === mappedDigit;
      if (isHit) {
        return {
          html: "<strong><font color=\"red\"  size=\"+1\" >" + inner + "</font></strong>",
          hit: true
        };
      }
      return {
        html: "<strong>" + inner + "</strong>",
        hit: false
      };
    }

    function buildLegacyBongStatsRows(statsTitle, mnCells, mbCells, nbCells, tongCuoi) {
      function makeCell(key, html, extra) {
        return Object.assign({
          key: key,
          html: String(html || ""),
          colSpan: 1,
          rowSpan: 1,
          align: "left",
          width: ""
        }, extra || {});
      }

      function buildWeekCells(cells, prefix, extra) {
        var source = Array.isArray(cells) ? cells.slice(0, 24) : [];
        while (source.length < 24) source.push("");
        return source.map(function (html, idx) {
          return makeCell(prefix + "_" + idx, html, extra);
        });
      }

      return [
        {
          key: "bong_stats_title",
          cells: [makeCell("title", "************************ " + String(statsTitle || "") + " ************************", { colSpan: 25 })]
        },
        {
          key: "bong_stats_mn",
          cells: [makeCell("mn_label", "*Miền Nam:", { width: "150" })].concat(buildWeekCells(mnCells, "mn"))
        },
        {
          key: "bong_stats_mb",
          cells: [makeCell("mb_label", "*Miền Bắc:")].concat(buildWeekCells(mbCells, "mb", { width: "20" }))
        },
        {
          key: "bong_stats_nb",
          cells: [makeCell("nb_label", "*Nam Bắc:")].concat(buildWeekCells(nbCells, "nb"))
        },
        {
          key: "bong_stats_tong",
          cells: [makeCell("tong_label", "Tổng 4 Tuần Cuối:")].concat([makeCell("tong_value", String(tongCuoi || 0), { colSpan: 24 })])
        }
      ];
    }

    function buildLegacyBongRuntimeRows(baseRows, variantValue) {
      var cfg = getLegacyBongVariantConfig(variantValue);
      var rows = Array.isArray(baseRows) ? baseRows.slice() : [];
      var outRows = [];
      var mnCells = [];
      var mbCells = [];
      var nbCells = [];
      var countT = 2;
      var bucketSouthHits = 0;
      var bucketTotalHits = 0;
      var countTongCuoi = 0;
      var tongCuoi = 0;
      var overlayDigit = -1;

      if (rows.length) {
        var headerSourceDigit = findLegacyBongRepeatedDigit(countLegacyBongDigits(rows[0], cfg.sourceExtractor), cfg.direction);
        var mappedHeaderDigit = mapLegacyBongDigit(headerSourceDigit);
        var headerHtml = buildLegacyBongHeaderHtml(mappedHeaderDigit, cfg.headerQuestionFirst);
        var headerRow = {
          key: "HT",
          id: "HT",
          dateLabel: "HT",
          isHeaderPrediction: true
        };
        LEGACY_BONG_FIELD_NAMES.forEach(function (field) {
          headerRow[field] = headerHtml;
        });
        outRows.push(headerRow);
        overlayDigit = headerSourceDigit;
      }

      rows.forEach(function (srcRow, idx) {
        var sourceRow = idx + 1 < rows.length ? rows[idx + 1] : null;
        var sourceDigit = sourceRow ? findLegacyBongRepeatedDigit(countLegacyBongDigits(sourceRow, cfg.sourceExtractor), cfg.direction) : -1;
        var mappedDigit = mapLegacyBongDigit(sourceDigit);
        var row = {
          key: String((srcRow && srcRow.ID) || ("bong_" + idx)),
          id: String((srcRow && srcRow.ID) || ""),
          dateLabel: formatLegacyBongItemDate(srcRow && srcRow.ID),
          isHeaderPrediction: false
        };

        LEGACY_BONG_FIELD_NAMES.forEach(function (field, fieldIdx) {
          var tailText = getLegacyBongTailText(srcRow && srcRow[field]);
          var compareDigit = extractLegacyBongDigitByMode(srcRow && srcRow[field], cfg.compareExtractor);
          var isHit = mappedDigit >= 0 && compareDigit === mappedDigit;
          if (isHit) {
            bucketTotalHits += 1;
            if (fieldIdx < 4) bucketSouthHits += 1;
          }
          var extraHtml = (countT === 7 && field === "B_duoi")
            ? buildLegacyBongWeekMarkerHtml(bucketSouthHits, bucketTotalHits)
            : "";
          row[field] = buildLegacyBongCellHtml(srcRow && srcRow[field], cfg, mappedDigit, overlayDigit, extraHtml).html;
          if (!tailText && !extraHtml && !row[field]) row[field] = "<strong></strong>";
        });

        outRows.push(row);
        overlayDigit = sourceDigit >= 0 ? sourceDigit : -1;

        if (countT === 7) {
          if (mnCells.length < 24) {
            var mnHtml = bucketSouthHits <= 2 ? ("<font color='Red'>" + String(bucketSouthHits) + "</font>") : String(bucketSouthHits);
            var mbCount = bucketTotalHits - bucketSouthHits;
            var mbHtml = mbCount <= 2 ? ("<font color='Red'>" + String(mbCount) + "</font>") : String(mbCount);
            var nbHtml = bucketTotalHits <= 4 ? ("<font color='Red'>" + String(bucketTotalHits) + "</font>") : String(bucketTotalHits);
            mnCells.unshift(mnHtml);
            mbCells.unshift(mbHtml);
            nbCells.unshift(nbHtml);
            countTongCuoi += 1;
            if (countTongCuoi <= 4) tongCuoi += bucketTotalHits;
          }
          countT = 1;
          bucketSouthHits = 0;
          bucketTotalHits = 0;
        } else {
          countT += 1;
        }
      });

      return {
        rows: outRows,
        statsRows: buildLegacyBongStatsRows(cfg.statsTitle, mnCells, mbCells, nbCells, tongCuoi)
      };
    }

    function legacyBongHtmlNode(htmlValue) {
      return h("span", {
        dangerouslySetInnerHTML: { __html: String(htmlValue || "") }
      });
    }

    function legacyBongCardNode(row) {
      var r = row || {};
      var cellStyle = {
        border: "1px solid " + theme.border,
        width: 36,
        minWidth: 36,
        height: 34,
        padding: "2px 4px",
        textAlign: "center",
        verticalAlign: "middle",
        background: theme.cardBg,
        color: theme.text,
        fontSize: 12,
        fontWeight: 600
      };
      return h("table", { style: { borderCollapse: "collapse", margin: "0 auto", background: theme.cardBg } }, [
          h("tbody", null, [
            h("tr", { key: "r1" }, [
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.D_dau)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.D_duoi)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.P_dau)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.P_duoi))
            ]),
            h("tr", { key: "r2" }, [
              h("td", { style: Object.assign({}, cellStyle, { height: 34 }), colSpan: 4 }, legacyBongHtmlNode(r.B_duoi))
            ]),
            h("tr", { key: "r3" }, [
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.B_dau)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.B_so2)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.B_so3)),
              h("td", { style: cellStyle }, legacyBongHtmlNode(r.B_so4))
            ])
          ])
        ]);
    }

    async function runLegacyBong() {
      setLoading(true);
      setProgress(15);
      try {
        var meta = getLegacyBongVariantMeta(legacyBongVariant);
        var fromYmd = normalizeLegacyDateYmd(tu_ngay);
        var toYmd = normalizeLegacyDateYmd(den_ngay);
        if (!fromYmd || !toYmd) {
          canhbao("Ngày bắt đầu/kết thúc không hợp lệ");
          return;
        }

        var queryValue = normalizeLegacyTongHopQueryValue("D_-P_-T_-B_", 2);
        var dataMien = await loadLegacySpecialDataByQuery(queryValue);
        if (!dataMien) return;
        if (!dataMien.length) {
          throw new Error("Không có dữ liệu đầu vào cho Bóng");
        }

        var baseRows = buildLegacyTongHopViewModel({
          dataMien: dataMien,
          fromDate: tu_ngay,
          toDate: den_ngay,
          heThong: 2,
          stepDays: 1
        }).filter(function (row) {
          return hasLegacyDrawData(row, 2);
        });

        if (!baseRows.length) {
          throw new Error("Không đọc được dữ liệu Bóng từ dữ liệu xổ số");
        }

        var computed = buildLegacyBongRuntimeRows(baseRows, legacyBongVariant);
        var rows = (computed && computed.rows) || [];
        var statRows = (computed && computed.statsRows) || [];
        if (!rows.length) {
          throw new Error("Không dựng được dữ liệu Bóng bằng JS");
        }

        setLegacyBongRows(rows);
        setLegacyBongStatsRows(statRows);
        setLegacyBongSummary(meta.label + ": " + rows.length + " dòng");
        setActiveAction("legacy_bong");
        setSubTab("legacy_bong");
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Không thể chạy Bóng: " + String((e && e.message) || e || ""));
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    function normalizeLegacyTongHopCompareKey(value) {
      return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function parseLegacyTongHopPhpRows(xmlText) {
      var text = String(xmlText || "");
      if (!text.trim()) return [];
      var parser = new DOMParser();
      var doc = parser.parseFromString(text, "text/xml");
      if (!doc) return [];
      var rows = doc.getElementsByTagName("row");
      var out = [];
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        var cells = row.getElementsByTagName("cell");
        if (!cells || cells.length < 37) continue;
        var v = [];
        for (var c = 0; c < cells.length; c += 1) {
          v.push(String((cells[c] && cells[c].textContent) || "").trim());
        }
        out.push({
          boSo: v[0],
          ketQua: v[1],
          lanL2C: Number(v[2] || 0),
          lanL3C: Number(v[3] || 0),
          lanLB3C: Number(v[4] || 0),
          lanTongNgaySinh: Number(v[5] || 0),
          lauNgay: Number(v[6] || 0),
          lauKy: Number(v[7] || 0),
          ngayCXHT: Number(v[8] || 0),
          kyCXHT: Number(v[9] || 0),
          lauNgayDC: Number(v[10] || 0),
          ngayCXHTDC: Number(v[11] || 0),
          lauNgayDP: Number(v[12] || 0),
          ngayCXHTDP: Number(v[13] || 0),
          lauNgayT: Number(v[14] || 0),
          ngayCXHTT: Number(v[15] || 0),
          lauNgay2D: Number(v[16] || 0),
          ngayCXHT2D: Number(v[17] || 0),
          lauNgay3D: Number(v[18] || 0),
          ngayCXHT3D: Number(v[19] || 0),
          lauNgayNB: Number(v[20] || 0),
          ngayCXHTNB: Number(v[21] || 0),
          lauNgay3NB: Number(v[22] || 0),
          ngayCXHT3NB: Number(v[23] || 0),
          lauNgayMB: Number(v[24] || 0),
          ngayCXHTMB: Number(v[25] || 0),
          lanTuan1C: Number(v[26] || 0),
          lanTuan2C: Number(v[27] || 0),
          lanDai: Number(v[28] || 0),
          lanTuan: Number(v[29] || 0),
          lanTuanD2D: Number(v[30] || 0),
          lanNgayD2C: Number(v[31] || 0),
          lanTuanD3: Number(v[32] || 0),
          lanNgayD3: Number(v[33] || 0),
          lanKTD: Number(v[34] || 0),
          lanTuan21: Number(v[35] || 0),
          noiDung: v[36]
        });
      }
      return out;
    }



    function runLegacyTongHopAutoFilter(options) {
      options = options || {};
      var silent = !!options.silent;
      if (!silent) {
        // User-triggered auto-filter should switch back to using main TongHop rows as source.
        setLegacyThAutoPinnedFullAuto(false);
      }
      if (!legacyThRows.length) {
        if (!silent) {
          canhbao("Vui lòng chạy Tổng Hợp trước");
        }
        // Keep full-auto results when this function is invoked silently by effects.
        if (!silent || !legacyThAutoRows.length) {
          if (legacyThAutoRows.length) {
            setLegacyThAutoRows([]);
          }
          setLegacyThIntersect("");
          setLegacyThAutoSummary("");
        }
        return;
      }
      var filterCfg = getLegacyThFilterConfig();
      if (!hasLegacyThAutoFilter(filterCfg)) {
        if (!silent) {
          canhbao("Vui lòng nhập ít nhất 1 điều kiện lọc (C1–C6)");
        }
        if (!silent || !legacyThAutoRows.length) {
          if (legacyThAutoRows.length) {
            setLegacyThAutoRows([]);
          }
          setLegacyThIntersect("");
          setLegacyThAutoSummary("");
        }
        return;
      }
      var filtered = filterLegacyThRowsWithConfig(legacyThRows, filterCfg);
      setLegacyThAutoRows(filtered);
      legacySortedRowsRef.current["th_auto"] = null;
      // Keep overlap calculation independent; only compute when user clicks the Auto table actions.
      setLegacyThIntersect("");
      setLegacyThAutoSummary("");
    }

    async function runLegacyTongHopFullAuto() {
      var selectedQueryItems = getLegacyThSelectedQueryTypeItems();
      if (!selectedQueryItems.length) {
        canhbao("Vui lòng chọn ít nhất 1 Loại Tìm");
        return;
      }
      var chosenGroupsNormal = legacyThGroupOptions.filter(function (g) { return legacyThSelectedGroups.indexOf(g.id) >= 0; }).map(function (g) {
        return Object.assign({}, g, { isTriet: false });
      });
      var chosenGroupsTriet = legacyThGroupTrietOptions.filter(function (g) { return legacyThSelectedGroupsTriet.indexOf(g.id) >= 0; }).map(function (g) {
        return Object.assign({}, g, { isTriet: true });
      });
      var chosenGroups = chosenGroupsNormal.concat(chosenGroupsTriet);
      if (!chosenGroups.length) {
        canhbao("Vui lòng chọn ít nhất 1 Nhóm số hoặc Nhóm Triệt");
        return;
      }
      var filterCfg = getLegacyThFilterConfig();
      if (!hasLegacyThAutoFilter(filterCfg)) {
        canhbao("Vui lòng nhập ít nhất 1 điều kiện lọc (C1–C6)");
        return;
      }

      function buildFullAutoGroupBuckets(groups) {
        var src = Array.isArray(groups) ? groups : [];
        var bucketMap = {};
        for (var bi = 0; bi < src.length; bi += 1) {
          var g = src[bi] || {};
          var size = Number(g.groupSize || 0);
          if (!(size > 0)) {
            var fallbackIds = String(g.cachIds || "").split(",").map(function (s) { return String(s || "").trim(); }).filter(Boolean);
            size = fallbackIds.length || 1;
          }
          var key = [g.isTriet ? "tr" : "nm", size].join("_");
          if (!bucketMap[key]) {
            bucketMap[key] = {
              id: key,
              isTriet: !!g.isTriet,
              size: size,
              text: "Nhóm " + size + " số",
              groups: []
            };
          }
          bucketMap[key].groups.push(g);
        }
        return Object.keys(bucketMap).map(function (k) { return bucketMap[k]; }).sort(function (a, b) {
          if (a.isTriet !== b.isTriet) return a.isTriet ? 1 : -1;
          return Number(a.size || 0) - Number(b.size || 0);
        });
      }

      setLoading(true);
      setLegacyThAutoRunning(true);
      setLegacyThAutoPinnedFullAuto(true);
      legacyThAutoStopRef.current = false;
      setProgress(10);
      var resetAutoState = function () {
        legacyThAutoStopRef.current = false;
        setLegacyThAutoRunning(false);
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      };
      var handleAutoError = function (err, msg) {
        console.error(msg || "Auto run error", err);
        canhbao(msg || "Không thể chạy Auto Tổng Hợp");
        setLegacyThAutoStatus((msg || "Lỗi") + ": " + (String(err && err.message) || "").slice(0, 50));
        resetAutoState();
        return false;
      };
      (async function runAutoProcess() {
        try {
          var groupBuckets = buildFullAutoGroupBuckets(chosenGroups);
          var allRows = [];
          var rowSignatures = {};
          var totalTasks = selectedQueryItems.length * Math.max(1, groupBuckets.length);
          var taskStep = 0;
          setLegacyThAutoTaskDone(0);
          setLegacyThAutoTaskTotal(totalTasks);
          setLegacyThAutoStatus("Khởi tạo " + totalTasks + " task...");
          setLegacyThAutoRows([]);
          legacySortedRowsRef.current["th_auto"] = null;
          setLegacyThAutoSummary("");
          setLegacyThIntersect("");

          for (var qi = 0; qi < selectedQueryItems.length; qi += 1) {
            if (legacyThAutoStopRef.current) break;
            var queryType = selectedQueryItems[qi];

            for (var gi = 0; gi < groupBuckets.length; gi += 1) {
              if (legacyThAutoStopRef.current) break;
              try {
                taskStep += 1;
                setLegacyThAutoTaskDone(taskStep);
                setProgress(Math.min(95, 10 + Math.round((taskStep / totalTasks) * 80)));
                var bucket = groupBuckets[gi];
                setLegacyThAutoStatus("Đang chạy " + taskStep + "/" + totalTasks + ": " + queryType.text + " | " + bucket.text + " (" + bucket.groups.length + " cách)");
                var bucketCachItems = (bucket.groups || []).map(function (group) {
                  var groupSearchText = String(group.searchText || group.noiDungDisplay || group.tCach || "").trim() ||
                    String(group.cachIds || "").split(",").map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(" ");
                  return {
                    key: String(group.id || group.text || groupSearchText || ""),
                    groupId: String(group.id || group.text || ""),
                    boSo: String(group.noiDungDisplay || group.text || "").trim() || groupSearchText,
                    searchText: groupSearchText,
                    noiDungDisplay: String(group.noiDungDisplay || groupSearchText || "").trim() || groupSearchText
                  };
                }).filter(function (item) {
                  return !!String(item.searchText || "").trim();
                });
                if (!bucketCachItems.length) {
                  continue;
                }
                var metrics = void 0;
                try {
                  metrics = await fetchLegacyTongHopRowsFromApi({
                    triet: !!bucket.isTriet,
                    queryValue: queryType.value,
                    queryText: queryType.text,
                    cachItems: bucketCachItems
                  });
                } catch (fetchErr) {
                  console.warn("Fetch error for task " + taskStep + ":", fetchErr);
                  metrics = [];
                }
                var filteredRows = filterLegacyThRowsWithConfig(metrics, filterCfg);
                filteredRows.forEach(function (row, rowIdx) {
                  var rowGroupId = String(row.autoGroupId || row.groupId || bucket.id || "").trim() || bucket.id;
                  var rowGroupText = String(row.autoGroupText || row.groupText || row.boSo || bucket.text || "").trim() || bucket.text;
                  var nextRow = Object.assign({}, row, {
                    key: "th_auto_" + qi + "_" + gi + "_" + rowIdx + "_" + String(row.key || row.boSo || row.noiDung || "row"),
                    autoQueryTypeValue: queryType.value,
                    autoQueryTypeText: queryType.text,
                    autoGroupId: rowGroupId,
                    autoGroupText: rowGroupText,
                    noiDung: String(row.noiDung || row.boSo || "").trim()
                  });
                  var signature = [nextRow.autoQueryTypeValue, nextRow.autoGroupId, nextRow.boSo, nextRow.noiDung, nextRow.ngayCXHT, nextRow.kyCXHT].join("||");
                  if (rowSignatures[signature]) return;
                  rowSignatures[signature] = true;
                  allRows.push(nextRow);
                });

                if (taskStep % 4 === 0) {
                  var previewRows = sortLegacyThAutoRowsForDisplay(allRows);
                  setLegacyThAutoRows(previewRows);
                  await sleepMs(0);
                }
              } catch (stepErr) {
                console.error("Step " + taskStep + " error:", stepErr);
                continue;
              }
            }

            if (legacyThAutoStopRef.current) break;
          }

          var finalRows = sortLegacyThAutoRowsForDisplay(allRows);
          setLegacyThAutoRows(finalRows);
          setLegacyThAutoSelectedRowKeys([]);
          setLegacyThIntersect("");
          setLegacyThAutoSummary("");
          setLegacyThAutoStatus(legacyThAutoStopRef.current
            ? (tt.lgThAutoStopped + " " + Math.min(taskStep, totalTasks) + "/" + totalTasks)
            : ("Hoàn tất " + totalTasks + "/" + totalTasks));
          setActiveAction("legacy_th");
          setSubTab("legacy_th");
          setProgress(100);
          resetAutoState();
        } catch (e) {
          handleAutoError(e, "Không thể chạy Auto Tổng Hợp");
        }
      })()
    }

    function switchLegacyMainTab(nextTabRaw) {
      var nextTab = String(nextTabRaw || "slr") === "slr" ? "slr" : "other";
      setLegacyMainTab(nextTab);

      if (nextTab === "slr") {
        setLegacyTool("slr");
        if (activeAction !== "kq" && activeAction !== "tk" && activeAction !== "tkm") {
          setActiveAction("kq");
          setSubTab("ketqua");
        }
        return;
      }

      var nextTool = legacyTool === "slr" ? "th" : legacyTool;
      setLegacyTool(nextTool);
      setLegacySpecialConfigTab(nextTool);
      if (nextTool === "th") {
        setActiveAction("legacy_th");
        setSubTab("legacy_th");
      } else if (nextTool === "bong") {
        setActiveAction("legacy_bong");
        setSubTab("legacy_bong");
      } else if (nextTool === "slrnb") {
        setActiveAction("legacy_slr");
        setSubTab("legacy_slr");
      } else if (nextTool === "nb") {
        setActiveAction("legacy_nb");
        setSubTab("legacy_nb");
      } else {
        setActiveAction("legacy_ktt");
        setSubTab("legacy_ktt");
      }
    }

    function switchLegacySpecialConfigTab(nextConfigTabRaw) {
      var nextConfigTab = String(nextConfigTabRaw || "th");
      setLegacySpecialConfigTab(nextConfigTab);
      setLegacyTool(nextConfigTab);
      
      if (nextConfigTab === "th") {
        setActiveAction("legacy_th");
        setSubTab("legacy_th");
      } else if (nextConfigTab === "bong") {
        setActiveAction("legacy_bong");
        setSubTab("legacy_bong");
      } else if (nextConfigTab === "slrnb") {
        setActiveAction("legacy_slr");
        setSubTab("legacy_slr");
      } else if (nextConfigTab === "nb") {
        setActiveAction("legacy_nb");
        setSubTab("legacy_nb");
      } else {
        setActiveAction("legacy_ktt");
        setSubTab("legacy_ktt");
      }
    }

    useEffect(function () {
      var options = (legacyThQueryTypeOptions && legacyThQueryTypeOptions.length)
        ? legacyThQueryTypeOptions
        : buildLegacyThDefaultQueryTypeDefs(legacyHeThong);
      var current = String(legacySlrQueryValue || "");
      var exists = options.some(function (item) { return String(item && item.value || "") === current; });
      if (!exists && options.length) {
        setLegacySlrQueryValue(getLegacySlrPreferredQueryValue(legacyHeThong, options));
      }
    }, [legacyHeThong, legacyThQueryTypeOptions, legacySlrQueryValue]);

    useEffect(function () {
      var sizeMap = {};
      (legacyThGroupOptions || []).forEach(function (group) {
        var size = Number(group && group.groupSize || 0);
        if (size > 0) sizeMap[String(size)] = true;
      });
      var sizes = Object.keys(sizeMap).sort(function (a, b) { return Number(a) - Number(b); });
      // If no API-loaded sizes, always make sure "1" is selected as the reasonable default (= all 100 single 2-digit numbers)
      var allSizes = sizes.length ? sizes : ["1", "2", "3", "4", "5"];
      var current = String(legacyNbGroupSize || "");
      if (!current || allSizes.indexOf(current) < 0) {
        setLegacyNbGroupSize(allSizes[0]);
      }
    }, [legacyThGroupOptions, legacyNbGroupSize]);

    function buildKyColumns(totalKyInput, sapXepInput) {
      var cols = [];
      var totalKy = Math.max(1, Number(totalKyInput || 1));
      if (Number(sapXepInput) === 0) {
        for (var i = 1; i <= totalKy; i += 1) {
          (function (kyNo) {
            cols.push({
              title: String(kyNo),
              dataIndex: "ky",
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
              dataIndex: "ky",
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

    var kttHasMatch = Object.keys(legacyKttMatchSet).length > 0;
    function kttCellRender(val) {
      var v = String(val || "");
      var tokenLen = legacyHeThong === 3 ? 3 : 2;
      var last2 = v.slice(-tokenLen);
      var hit = kttHasMatch && !!legacyKttMatchSet[last2];
      if (v === "?") return h("span", { style: { color: theme.muted, fontWeight: "bold" } }, "?");
      if (hit) return h("span", { style: { color: theme.error, fontWeight: "bold", fontSize: "1.1em" } }, last2);
      return h("span", null, last2 || v);
    }
    // Lấy thứ trong tuần (0=CN,1=T2,...,6=T7) từ ymd=yyyymmdd
    function kttWeekdayFromYmd(ymd) {
      if (!ymd || ymd.length < 8) return 0;
      var y = parseInt(ymd.substring(0, 4), 10);
      var m = parseInt(ymd.substring(4, 6), 10) - 1;
      var d = parseInt(ymd.substring(6, 8), 10);
      return new Date(y, m, d).getDay();
    }
    var KTT_COLS = [
      { name: "CN", dow: 0 },
      { name: "T7", dow: 6 },
      { name: "T6", dow: 5 },
      { name: "T5", dow: 4 },
      { name: "T4", dow: 3 },
      { name: "T3", dow: 2 },
      { name: "T2", dow: 1 }
    ];
    // Màu ô theo theme: pastel sáng cho light mode, tinted mờ cho dark mode
    var KTT_COLORS = theme.isDark
      ? { D: "rgba(33,150,243,0.18)", P: "rgba(255,193,7,0.18)", T: "rgba(0,188,212,0.18)", B: "rgba(255,152,0,0.18)" }
      : { D: "#E3F2FD", P: "#FFFACD", T: "#E0F7FA", B: "#FFE0B2" };
    var kttMatchBg  = theme.isDark ? "rgba(255,80,80,0.28)" : "#ffcccc";
    var kttMatchClr = theme.isDark ? "#ff8080" : "#cc0000";
    var kttNormalClr = theme.text;
    var kttRowBorder = "1px solid " + (theme.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)");
    var KTT_CARD_WIDTH = 156;
    var KTT_CELL_HEIGHT = 26;
    function kttCellNode(val, bgColor, opts) {
      var tokenLen = legacyHeThong === 3 ? 3 : 2;
      var v = String(val || "");
      var last2 = v === "?" ? "?" : v.slice(-tokenLen);
      var autoHit = !legacyKttHasSearchInput
        && /^\d+$/.test(last2)
        && opts
        && opts.row
        && opts.field
        && opts.row.kttAutoHit
        && opts.row.kttAutoHit[opts.field];
      var hit = (kttHasMatch && !!legacyKttMatchSet[last2]) || !!autoHit;
      var noSearch = !legacyKttHasSearchInput;
      var bg = (kttHasMatch && hit) ? kttMatchBg : bgColor;
      var color = v === "?" ? theme.muted : (kttHasMatch && hit ? kttMatchClr : (autoHit ? theme.primary : (noSearch ? theme.error : kttNormalClr)));
      var fw = v === "?" ? "normal" : "bold";
      var fz = (kttHasMatch && hit) ? 16 : (autoHit ? 12 : (noSearch ? 12 : 14));
      var showLegacyBtn = noSearch && /^\d+$/.test(last2) && !autoHit;
      return h("div", {
        style: {
          flex: 1,
          minHeight: KTT_CELL_HEIGHT,
          textAlign: "center",
          fontSize: fz,
          lineHeight: "20px",
          background: bg, color: color, fontWeight: fw,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: kttRowBorder, overflow: "hidden", whiteSpace: "nowrap"
        }
      }, showLegacyBtn ? h("button", {
        type: "button",
        style: {
          height: 20,
          minWidth: tokenLen === 3 ? 34 : 28,
          padding: "0 2px",
          border: "1px solid #bfbfbf",
          borderRadius: 0,
          background: theme.inputBg,
          color: theme.error,
          fontWeight: "bold",
          fontSize: 12,
          lineHeight: "18px",
          cursor: "pointer"
        },
        onClick: function () {
          setSoChuInput(formatSoChuInputByHe((legacyKttClickMap && legacyKttClickMap[last2]) || last2, legacyHeThong));
        }
      }, last2) : (last2 || ""));
    }
    var kttCardBorder = "1px solid " + theme.border;
    var kttDateHeaderBg = theme.isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0";
    function buildLegacyKttWeekRows(rows) {
      var src = Array.isArray(rows) ? rows.slice() : [];
      if (!src.length) return [];

      src.sort(function (a, b) {
        return String((a && a.ID) || "").localeCompare(String((b && b.ID) || ""));
      });

      var rowMap = {};
      src.forEach(function (r) {
        var ymd = normalizeLegacyDateYmd(r && r.ID);
        if (ymd) rowMap[ymd] = r;
      });

      function parseYmd(ymd) {
        if (!ymd || ymd.length < 8) return null;
        var y = parseInt(ymd.substring(0, 4), 10);
        var m = parseInt(ymd.substring(4, 6), 10) - 1;
        var d = parseInt(ymd.substring(6, 8), 10);
        return new Date(y, m, d);
      }

      function toYmd(dt) {
        if (!dt) return "";
        return [
          String(dt.getFullYear()),
          String(dt.getMonth() + 1).padStart(2, "0"),
          String(dt.getDate()).padStart(2, "0")
        ].join("");
      }

      var locSet = {};
      getLegacyLocList().forEach(function (k) { locSet[String(k)] = true; });
      var allKeys = getLegacyAllNormalizedFieldKeys();
      function placeholderRow(ymd) {
        var rec = {
          ID: ymd,
          Ngay: dateFormat(chuyenNgay(ymd, "yyyymmdd"), "dd/mm/yyyy")
        };
        allKeys.forEach(function (k) {
          rec[k] = locSet[k] ? "?" : "";
        });
        return rec;
      }

      var firstYmd = normalizeLegacyDateYmd(src[0] && src[0].ID);
      var lastYmd = normalizeLegacyDateYmd(src[src.length - 1] && src[src.length - 1].ID);
      var firstDate = parseYmd(firstYmd);
      var lastDate = parseYmd(lastYmd);
      if (!firstDate || !lastDate) return [];

      // Align to full weeks: Monday -> Sunday
      var firstDowMon = (firstDate.getDay() + 6) % 7;
      var lastDowMon = (lastDate.getDay() + 6) % 7;
      firstDate.setDate(firstDate.getDate() - firstDowMon);
      lastDate.setDate(lastDate.getDate() + (6 - lastDowMon));

      var out = [];
      var cursor = new Date(firstDate.getTime());
      var week = [];
      while (cursor.getTime() <= lastDate.getTime()) {
        var ymd = toYmd(cursor);
        week.push(rowMap[ymd] || placeholderRow(ymd));
        if (week.length === 7) {
          out.push({ key: "wk_" + ymd + "_" + out.length, days: week.slice() });
          week = [];
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      // Keep latest week first like legacy screens
      out.reverse();
      return out;
    }
    function kttCardNode(row) {
      var he2 = legacyHeThong !== 3;
      var dow = kttWeekdayFromYmd(normalizeLegacyDateYmd(row.ID));
      var isMonday = dow === 1;
      var thu = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dow] || "";
      var ngayLabel = String(row.Ngay || "");
      if (ngayLabel && ngayLabel.indexOf("(") < 0 && thu) ngayLabel = ngayLabel + " (" + thu + ")";
      // PHP: hiện (N) bên cạnh B_duoi của T2 (Monday) = đếm số lần B_duoi khớp trong tuần
      var monCount = (legacyKttHasSearchInput && isMonday && row.kttMonWeekCount != null) ? row.kttMonWeekCount : null;
      // Hàng B_duoi: tạo cell riêng nếu có monCount thì dùng flex row
      function kttBduoiCell() {
        var tokenLen = legacyHeThong === 3 ? 3 : 2;
        var v = String(row.B_duoi || "");
        var last2 = v === "?" ? "?" : v.slice(-tokenLen);
        var autoHit = !legacyKttHasSearchInput
          && /^\d+$/.test(last2)
          && row
          && row.kttAutoHit
          && row.kttAutoHit.B_duoi;
        var hit = (kttHasMatch && !!legacyKttMatchSet[last2]) || !!autoHit;
        var noSearch = !legacyKttHasSearchInput;
        var bg = (kttHasMatch && hit) ? kttMatchBg : KTT_COLORS.B;
        var color = v === "?" ? theme.muted : (kttHasMatch && hit ? kttMatchClr : (autoHit ? theme.primary : (noSearch ? theme.error : kttNormalClr)));
        var fw = v === "?" ? "normal" : "bold";
        var fz = (kttHasMatch && hit) ? 16 : (autoHit ? 12 : (noSearch ? 12 : 14));
        var showLegacyBtn = noSearch && /^\d+$/.test(last2) && !autoHit;
        var countLabel = monCount != null ? h("span", { style: { color: theme.muted, fontWeight: "normal", fontSize: 11, marginLeft: 3 } }, "(" + monCount + ")") : null;
        return h("div", {
          style: {
            flex: 2,
            minHeight: KTT_CELL_HEIGHT,
            textAlign: "center",
            fontSize: fz,
            lineHeight: "20px",
            background: bg, color: color, fontWeight: fw,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", whiteSpace: "nowrap"
          }
        }, [
          showLegacyBtn ? h("button", {
            type: "button",
            style: {
              height: 20,
              minWidth: tokenLen === 3 ? 34 : 28,
              padding: "0 2px",
              border: "1px solid #bfbfbf",
              borderRadius: 0,
              background: theme.inputBg,
              color: theme.error,
              fontWeight: "bold",
              fontSize: 12,
              lineHeight: "18px",
              cursor: "pointer"
            },
            onClick: function () {
              setSoChuInput(formatSoChuInputByHe((legacyKttClickMap && legacyKttClickMap[last2]) || last2, legacyHeThong));
            }
          }, last2) : (last2 || ""),
          countLabel
        ]);
      }
      return h("div", {
        key: row.ID,
        style: {
          width: KTT_CARD_WIDTH, marginBottom: 2, border: kttCardBorder,
          borderRadius: 3, overflow: "hidden", background: theme.cardBg
        }
      }, [
        // Hàng 1: ngày
        h("div", { style: { textAlign: "center", minHeight: 24, fontSize: 12, color: theme.text, background: kttDateHeaderBg, borderBottom: kttCardBorder, padding: "2px 0" } }, ngayLabel || ""),
        // Hàng 2: D_dau | D_duoi | P_dau | P_duoi
        h("div", { style: { display: "flex", borderBottom: kttRowBorder } }, [
          kttCellNode(row.D_dau, KTT_COLORS.D, { row: row, field: "D_dau" }),
          kttCellNode(row.D_duoi, KTT_COLORS.D, { row: row, field: "D_duoi" }),
          kttCellNode(row.P_dau, KTT_COLORS.P, { row: row, field: "P_dau" }),
          kttCellNode(row.P_duoi, KTT_COLORS.P, { row: row, field: "P_duoi" })
        ]),
        // Hàng 3: T_dau | T_duoi | B_duoi (B_duoi chiếm 50%, T2 hiện số đếm tuần)
        h("div", { style: { display: "flex", borderBottom: kttRowBorder } }, [
          kttCellNode(row.T_dau, KTT_COLORS.T, { row: row, field: "T_dau" }),
          kttCellNode(row.T_duoi, KTT_COLORS.T, { row: row, field: "T_duoi" }),
          kttBduoiCell()
        ]),
        // Hàng 4: B_dau | B_so2 | B_so3 | B_so4 (ẩn B_so4 với Hệ 3)
        h("div", { style: { display: "flex" } }, [
          kttCellNode(row.B_dau, KTT_COLORS.B, { row: row, field: "B_dau" }),
          kttCellNode(row.B_so2, KTT_COLORS.B, { row: row, field: "B_so2" }),
          kttCellNode(row.B_so3, KTT_COLORS.B, { row: row, field: "B_so3" }),
          he2 ? kttCellNode(row.B_so4, KTT_COLORS.B, { row: row, field: "B_so4" }) : kttCellNode("", KTT_COLORS.B, { row: row, field: "B_so4" })
        ])
      ]);
    }

    var legacySlrColumns = [
      { title: tt.lgSlrColSo, dataIndex: "so", key: "so", width: legacySlrColWidths["so"] || 80,
        sorter: { compare: function(a, b) { return Number(a.so||0) - Number(b.so||0); }, multiple: 3 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "80" }; } },
      { title: tt.lgSlrColGap, dataIndex: "gap", key: "gap", width: legacySlrColWidths["gap"] || 160,
        sorter: { compare: function(a, b) { return Number(a.gap||0) - Number(b.gap||0); }, multiple: 2 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: tt.lgSlrColFirst, dataIndex: "first_hit_idx", key: "first_hit_idx", width: legacySlrColWidths["first_hit_idx"] || 160,
        sorter: { compare: function(a, b) { return Number(a.first_hit_idx||0) - Number(b.first_hit_idx||0); }, multiple: 1 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } }
    ];

    function getLegacySlrInnerRowHeight() {
      return 24;
    }

    var LEGACY_SLR_WEEK_SUMMARY_LIMIT = 20;

    function getLegacySlrUniformHeight() {
      var fromRank = Math.max(1, Number(legacyRankFrom || 1));
      var toRank = Math.max(fromRank, Number(legacyRankTo || 10));
      var visibleRows = Math.max(1, toRank - fromRank + 1);
      var rowHeight = getLegacySlrInnerRowHeight();
      var chromeRows = 3;
      var chromeHeight = chromeRows * rowHeight;
      return chromeHeight + (visibleRows * rowHeight);
    }

    function legacySlrWeekCell(data, opts) {
      var d = data || {};
      var cellOpts = opts || {};
      var mode = String(d.mode || "C_D").toUpperCase();
      var rows = Array.isArray(d.rows) ? d.rows : [];
      var showBoth = mode === "C_D";
      var showDao = mode === "D";
      var showPair = mode === "2C";
      var singleTitle = showPair ? "2C" : (showDao ? "D" : "C");
      var thuLabel = legacySlrThuLabelFromYmd(normalizeLegacyDateYmd(d.date));
      var dateLabel = (thuLabel ? (thuLabel + "_") : "") + String(d.date || "").replace(/\//g, "_");
      var headBg = "color-mix(in srgb, " + theme.primary + " 10%, " + theme.cardBg + " 90%)";
      var innerRowHeight = getLegacySlrInnerRowHeight();
      var uniformHeight = cellOpts.fitContent
        ? (3 + rows.length) * innerRowHeight
        : getLegacySlrUniformHeight();
      var fixedCellBase = {
        border: "1px solid " + theme.border,
        textAlign: "center",
        padding: "0 3px",
        height: innerRowHeight,
        minHeight: innerRowHeight,
        lineHeight: (innerRowHeight - 2) + "px",
        verticalAlign: "middle",
        boxSizing: "border-box",
        overflow: "hidden",
        whiteSpace: "nowrap"
      };

      function styleC(r) {
        var hit = Number(r && r.cAll || 0) > 0;
        return {
          color: hit ? theme.error : theme.text,
          fontWeight: hit ? 800 : 650,
          fontSize: hit ? 20 : 14,
          lineHeight: (innerRowHeight - 2) + "px",
          fontStyle: (hit && Number(r && r.cBac || 0) > 0) ? "italic" : "normal",
          textDecoration: (hit && Number(r && r.cBac || 0) > 0) ? "underline" : "none"
        };
      }
      function styleD(r) {
        var hit = Number(r && r.dAll || 0) > 0;
        return {
          color: hit ? theme.error : theme.primary,
          fontWeight: 750,
          fontSize: hit ? 16 : 12,
          lineHeight: (innerRowHeight - 2) + "px",
          fontStyle: (hit && Number(r && r.dBac || 0) > 0) ? "italic" : "normal",
          textDecoration: (hit && Number(r && r.dBac || 0) > 0) ? "underline" : "none"
        };
      }
      function renderPair(r) {
        var tks = Array.isArray(r && r.pairTokens) ? r.pairTokens : [];
        if (!tks.length) return String((r && r.so) || "");
        return h("span", null, tks.map(function (tk, i) {
          var nHit = Number((r && r.pairNamMap && r.pairNamMap[tk]) || 0) > 0;
          var bHit = Number((r && r.pairBacMap && r.pairBacMap[tk]) || 0) > 0;
          return h("span", {
            key: "pair_" + i + "_" + tk,
            style: {
              display: "inline-block",
              color: (nHit || bHit) ? theme.error : theme.text,
              fontWeight: (nHit || bHit) ? 800 : 650,
              fontSize: (nHit || bHit) ? 20 : 14,
              lineHeight: (innerRowHeight - 2) + "px",
              fontStyle: bHit ? "italic" : "normal",
              textDecoration: bHit ? "underline" : "none",
              marginRight: i < tks.length - 1 ? 4 : 0
            }
          }, tk);
        }));
      }

      return h("div", { style: { fontSize: 11, lineHeight: "15px", minHeight: uniformHeight, height: uniformHeight, overflow: "hidden" } }, [
        rows.length ? h("div", { style: { minHeight: uniformHeight, height: uniformHeight, overflow: "hidden" } }, [
          h("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } }, [
          h("tbody", null, [
            h("tr", { key: "slr_date" }, [
              h("td", {
                colSpan: 3,
                style: {
                  border: "1px solid " + theme.border,
                  textAlign: "center",
                  padding: "0 3px",
                  height: innerRowHeight,
                  minHeight: innerRowHeight,
                  lineHeight: (innerRowHeight - 2) + "px",
                  verticalAlign: "middle",
                  boxSizing: "border-box",
                  fontSize: 11,
                  fontWeight: "bold",
                  color: theme.text,
                  background: headBg
                }
              }, dateLabel)
            ]),
            h("tr", { key: "slr_hdr" }, [
              h("td", { style: Object.assign({ width: 24, fontSize: 10, fontWeight: 600, background: headBg }, fixedCellBase) }, "STT"),
              showBoth
                ? h("td", { style: Object.assign({ fontSize: 10, fontWeight: 600, background: headBg }, fixedCellBase) }, "C")
                : null,
              showBoth
                ? h("td", { style: Object.assign({ fontSize: 10, fontWeight: 600, background: headBg }, fixedCellBase) }, "D")
                : null,
              (!showBoth)
                ? h("td", {
                    style: Object.assign({ fontSize: 10, fontWeight: 600, background: headBg }, fixedCellBase),
                    colSpan: 2
                  }, singleTitle)
                : null
            ])
          ].concat(rows.map(function (r) {
            return h("tr", { key: "slr_day_" + String(r.stt) + "_" + String(r.so) }, [
              h("td", { style: Object.assign({ width: 24, fontSize: 10, fontWeight: 600 }, fixedCellBase) }, String(r.stt || "")),
              showBoth
                ? h("td", { style: Object.assign({}, fixedCellBase, styleC(r)) }, String(r.so || ""))
                : null,
              showBoth
                ? h("td", { style: Object.assign({}, fixedCellBase, styleD(r)) }, String(r.dao || ""))
                : null,
              (!showBoth)
                ? h("td", {
                    style: showPair
                      ? fixedCellBase
                      : Object.assign({}, fixedCellBase, (showDao ? styleD(r) : styleC(r))),
                    colSpan: 2
                  }, showPair ? renderPair(r) : String(showDao ? (r.dao || "") : (r.so || "")))
                : null
            ]);
          })).concat([
            h("tr", { key: "slr_total" }, [
              h("td", { style: Object.assign({ fontSize: 10, fontWeight: 700 }, fixedCellBase) }, "Tổng"),
              showBoth
                ? h("td", { style: Object.assign({ fontSize: 13, fontWeight: 800 }, fixedCellBase) }, String(Number(d.c || 0)))
                : null,
              showBoth
                ? h("td", { style: Object.assign({ fontSize: 13, fontWeight: 800 }, fixedCellBase) }, String(Number(d.d || 0)))
                : null,
              (!showBoth)
                ? h("td", { style: Object.assign({ fontSize: 13, fontWeight: 800 }, fixedCellBase), colSpan: 2 }, String(Number(showDao ? (d.d || 0) : (d.c || 0))))
                : null
            ])
          ]))
        ])
        ]) : h("div", {
          style: {
            color: theme.muted,
            minHeight: uniformHeight,
            height: uniformHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }
        }, "-")
      ]);
    }

    var legacySlrWeekColumns = [
      { title: tt.lgSlrWeek || "Tuần", dataIndex: "week", key: "week", width: legacySlrColWidths["week"] || 80, fixed: "left",
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "80" }; },
        render: function(v) {
          var uh = getLegacySlrUniformHeight();
          return h("div", { style: { height: uh, minHeight: uh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: theme.text, wordBreak: "break-all", textAlign: "center", overflow: "hidden" } }, v);
        } },
      { title: "CN", dataIndex: "cn", key: "cn", width: legacySlrColWidths["cn"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T7", dataIndex: "t7", key: "t7", width: legacySlrColWidths["t7"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T6", dataIndex: "t6", key: "t6", width: legacySlrColWidths["t6"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T5", dataIndex: "t5", key: "t5", width: legacySlrColWidths["t5"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T4", dataIndex: "t4", key: "t4", width: legacySlrColWidths["t4"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T3", dataIndex: "t3", key: "t3", width: legacySlrColWidths["t3"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: "T2", dataIndex: "t2", key: "t2", width: legacySlrColWidths["t2"] || 160, render: legacySlrWeekCell,
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "160" }; } },
      { title: tt.lgCdC || "Chính", dataIndex: "chinh", key: "chinh", width: legacySlrColWidths["chinh"] || 90,
        sorter: { compare: function(a, b) { return Number(a.chinh||0) - Number(b.chinh||0); }, multiple: 3 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "90" }; },
        render: function(v, rec) {
          var n = Number(v || 0);
          var clr = n <= 5 ? theme.error : theme.text;
          return h("div", { style: { textAlign: "center", lineHeight: "16px", minHeight: getLegacySlrUniformHeight(), height: getLegacySlrUniformHeight(), display: "flex", flexDirection: "column", justifyContent: "center" } }, [
            h("div", { style: { fontWeight: "bold", fontSize: n <= 5 ? 30 : 20, color: clr } }, n),
            h("div", { style: { fontSize: 12, color: theme.text, fontWeight: "bold" } }, "----"),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Nam:" + (rec.chinhNam || 0)),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Bắc:" + (rec.chinhBac || 0))
          ]);
        } },
      { title: tt.lgCdD || "Đảo", dataIndex: "dao", key: "dao", width: legacySlrColWidths["dao"] || 90,
        sorter: { compare: function(a, b) { return Number(a.dao||0) - Number(b.dao||0); }, multiple: 2 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "90" }; },
        render: function(v, rec) {
          if (String(legacyCdMode || "").toUpperCase() === "2C") return "";
          var n = Number(v || 0);
          var clr = n <= 5 ? theme.error : theme.text;
          return h("div", { style: { textAlign: "center", lineHeight: "16px", minHeight: getLegacySlrUniformHeight(), height: getLegacySlrUniformHeight(), display: "flex", flexDirection: "column", justifyContent: "center" } }, [
            h("div", { style: { fontWeight: "bold", fontSize: n <= 5 ? 30 : 20, color: clr } }, n),
            h("div", { style: { fontSize: 12, color: theme.text, fontWeight: "bold" } }, "----"),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Nam:" + (rec.daoNam || 0)),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Bắc:" + (rec.daoBac || 0))
          ]);
        } },
      { title: tt.colTong || "Tổng", dataIndex: "tong", key: "tong", width: legacySlrColWidths["tong"] || 90,
        sorter: { compare: function(a, b) { return Number(a.tong||0) - Number(b.tong||0); }, multiple: 1 },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": "90" }; },
        render: function(v, rec) {
          if (String(legacyCdMode || "").toUpperCase() === "2C") return "";
          var n = Number(v || 0);
          var clr = n <= 11 ? theme.error : theme.text;
          return h("div", { style: { textAlign: "center", lineHeight: "16px", minHeight: getLegacySlrUniformHeight(), height: getLegacySlrUniformHeight(), display: "flex", flexDirection: "column", justifyContent: "center" } }, [
            h("div", { style: { fontWeight: "bold", fontSize: n <= 11 ? 30 : 20, color: clr } }, n),
            h("div", { style: { fontSize: 12, color: theme.text, fontWeight: "bold" } }, "----"),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Nam:" + (rec.tongNam || 0)),
            h("div", { style: { fontSize: 20, color: theme.text, fontWeight: "bold" } }, "Bắc:" + (rec.tongBac || 0))
          ]);
        } }
    ];

    legacySlrWeekColumns = legacySlrWeekColumns.map(function (col) {
      var prevOnCell = col.onCell;
      return Object.assign({}, col, {
        onCell: function () {
          var prev = typeof prevOnCell === "function" ? prevOnCell.apply(this, arguments) : null;
          var prevStyle = prev && prev.style ? prev.style : null;
          return Object.assign({}, prev || {}, {
            style: Object.assign({
              padding: 0,
              verticalAlign: "top",
              boxSizing: "border-box"
            }, prevStyle || {})
          });
        }
      });
    });

    function buildLegacySlrWeekSummaryRows(mode, weekRows) {
      var m = String(mode || "C_D").toUpperCase();
      var source = (Array.isArray(weekRows) ? weekRows : []).slice(0, LEGACY_SLR_WEEK_SUMMARY_LIMIT).slice().reverse();
      if (!source.length) return [];

      if (m === "2C") {
        return [
          { key: "pair_bac", label: "Tổng Cặp Bắc", limit: 3, values: source.map(function (r) { return Number(r.chinhBac || 0); }) },
          { key: "pair_nam", label: "Tổng Cặp Nam", limit: 2, values: source.map(function (r) { return Number(r.chinhNam || 0); }) },
          { key: "pair_all", label: "Tổng Cặp Nam Bắc", limit: 5, values: source.map(function (r) { return Number(r.chinh || 0); }) }
        ];
      }

      return [
        { key: "c_bac", label: "Chính Bắc", limit: 3, values: source.map(function (r) { return Number(r.chinhBac || 0); }) },
        { key: "c_nam", label: "Chính Nam", limit: 2, values: source.map(function (r) { return Number(r.chinhNam || 0); }) },
        { key: "c_all", label: "Chính Nam Bắc", limit: 5, values: source.map(function (r) { return Number(r.chinh || 0); }) },
        { key: "d_bac", label: "Đảo Bắc", limit: 3, values: source.map(function (r) { return Number(r.daoBac || 0); }) },
        { key: "d_nam", label: "Đảo Nam", limit: 2, values: source.map(function (r) { return Number(r.daoNam || 0); }) },
        { key: "d_all", label: "Đảo Nam Bắc", limit: 5, values: source.map(function (r) { return Number(r.dao || 0); }) },
        { key: "t_bac", label: "Tổng Bắc", limit: 3, values: source.map(function (r) { return Number(r.tongBac || 0); }) },
        { key: "t_nam", label: "Tổng Nam", limit: 2, values: source.map(function (r) { return Number(r.tongNam || 0); }) },
        { key: "t_all", label: "Tổng Nam Bắc", limit: 10, values: source.map(function (r) { return Number(r.tong || 0); }) }
      ];
    }

    // Build weekly summary for Auto rows using precomputed per-STT-range totals from cell cache
    // weekCNam/weekDNam/weekCBac/weekDBac: maps of weekIdx -> hit count for the specific sttFrom-sttTo range
    function buildLegacySlrAutoWeekSummaryFromTotals(mode, numWeeks, weekCNam, weekDNam, weekCBac, weekDBac) {
      var m = String(mode || "C_D").toUpperCase();
      var limit = Math.min(LEGACY_SLR_WEEK_SUMMARY_LIMIT, Math.max(0, Number(numWeeks || 0)));
      if (!limit) return [];
      // wri=0 is the most recent week; display oldest first (reversed, like buildLegacySlrWeekSummaryRows)
      var wriList = [];
      for (var i = limit - 1; i >= 0; i -= 1) wriList.push(i);
      var getV = function (map, wri) { return Number(map[wri] || 0); };
      if (m === "2C") {
        return [
          { key: "pair_bac", label: "Tổng Cặp Bắc", limit: 3, values: wriList.map(function (wri) { return getV(weekCBac, wri); }) },
          { key: "pair_nam", label: "Tổng Cặp Nam", limit: 2, values: wriList.map(function (wri) { return getV(weekCNam, wri); }) },
          { key: "pair_all", label: "Tổng Cặp Nam Bắc", limit: 5, values: wriList.map(function (wri) { return getV(weekCNam, wri) + getV(weekCBac, wri); }) }
        ];
      }
      return [
        { key: "c_bac", label: "Chính Bắc", limit: 3, values: wriList.map(function (wri) { return getV(weekCBac, wri); }) },
        { key: "c_nam", label: "Chính Nam", limit: 2, values: wriList.map(function (wri) { return getV(weekCNam, wri); }) },
        { key: "c_all", label: "Chính Nam Bắc", limit: 5, values: wriList.map(function (wri) { return getV(weekCNam, wri) + getV(weekCBac, wri); }) },
        { key: "d_bac", label: "Đảo Bắc", limit: 3, values: wriList.map(function (wri) { return getV(weekDBac, wri); }) },
        { key: "d_nam", label: "Đảo Nam", limit: 2, values: wriList.map(function (wri) { return getV(weekDNam, wri); }) },
        { key: "d_all", label: "Đảo Nam Bắc", limit: 5, values: wriList.map(function (wri) { return getV(weekDNam, wri) + getV(weekDBac, wri); }) },
        { key: "t_bac", label: "Tổng Bắc", limit: 3, values: wriList.map(function (wri) { return getV(weekCBac, wri) + getV(weekDBac, wri); }) },
        { key: "t_nam", label: "Tổng Nam", limit: 2, values: wriList.map(function (wri) { return getV(weekCNam, wri) + getV(weekDNam, wri); }) },
        { key: "t_all", label: "Tổng Nam Bắc", limit: 10, values: wriList.map(function (wri) { return getV(weekCNam, wri) + getV(weekDNam, wri) + getV(weekCBac, wri) + getV(weekDBac, wri); }) }
      ];
    }

    async function exportLegacySlrAutoRows() {
      var rows = legacySortedRowsRef.current["slr_auto"] || (Array.isArray(legacySlrAutoRows) ? legacySlrAutoRows : []);
      if (!rows.length) { canhbao(tt.exportNoData || "Không có dữ liệu để xuất"); return; }
      var header = ["Loại Tìm", "Từ STT", "Đến STT", "Chuỗi (ngày)", "Từ ngày (hiện tại)", "Đến ngày (ngày xổ)", "Tổng Nam 0 (tuần)", "Số chính", "Số đảo", "Dãy Tổng Bắc", "Dãy Tổng Nam"];
      var aoa = [header];
      for (var ri3 = 0; ri3 < rows.length; ri3 += 1) {
        var r = rows[ri3] || {};
        var m2 = String(r.mode || "C_D").toUpperCase();
        // Dùng latestCellStats (từ prefix sum cache) cho tất cả rows, vì nó chính xác
        var cNamText = buildLegacySlrAutoNumberTextFromStats(r && r.latestCellStats, "c");
        var dNamText = m2 === "2C" 
          ? "-" 
          : buildLegacySlrAutoNumberTextFromStats(r && r.latestCellStats, "d");
        var line = [
          String(r.queryLabel || ""),
          Number(r.sttFrom || 0),
          Number(r.sttTo || 0),
          Number(r.noHitDays || 0),
          String(r.fromDate || ""),
          String(r.toDate || ""),
          Number(r.tongNamZeroWeekStreak || 0),
          cNamText,
          dNamText,
          buildLegacySlrAutoWeekSeriesText(r && r.weekSummaryRows, m2, "bac"),
          buildLegacySlrAutoWeekSeriesText(r && r.weekSummaryRows, m2, "nam")
        ];
        aoa.push(line);
      }
      await exportPayloadToFile({ fileName: "SLR_Auto", sheets: [{ name: "SLR Auto", aoa: aoa }] });
    }

    function buildLegacySlrAutoLatestCellText(cellData) {
      var cell = cellData || {};
      var rows = Array.isArray(cell.rows) ? cell.rows : [];
      if (!rows.length) return "-";
      var lines = [];
      var dateText = String(cell.date || "").trim();
      if (dateText) lines.push(dateText);
      rows.forEach(function (r) {
        lines.push(String(r.stt || "") + ": C=" + String(r.so || "") + " D=" + String(r.dao || ""));
      });
      lines.push("Tong: C=" + String(Number(cell.c || 0)) + " D=" + String(Number(cell.d || 0)));
      return lines.join("\n");
    }

    function buildLegacySlrAutoNumberText(cellData, kind) {
      var cell = cellData || {};
      var rows = Array.isArray(cell.rows) ? cell.rows : [];
      var target = String(kind || "c").toLowerCase() === "d" ? "dao" : "so";
      var out = [];
      for (var i = 0; i < rows.length; i += 1) {
        var value = String((rows[i] && rows[i][target]) || "").trim();
        if (!value) continue;
        out.push(value);
      }
      return out.length ? out.join(" ") : "-";
    }

    function buildLegacySlrAutoNumberTextFromStats(stats, kind, rowCount) {
      // Dùng khi là merged row: hiển thị "[count] số" thay vì liệt kê từng số
      var stat = stats || {};
      var kind2 = String(kind || "c").toLowerCase();
      var cnt = kind2 === "d" ? Number(stat.dNam || 0) : Number(stat.cNam || 0);
      // DEBUG: Log stats để xem giá trị
      if (typeof console !== 'undefined') {
        console.log('[DISPLAY] kind=' + kind2 + ', cnt=' + cnt + ', stat=' + JSON.stringify({cNam: stat.cNam, dNam: stat.dNam}));
      }
      // Nếu rowCount được truyền (số row trong range), hiển thị count riêng
      // Ngược lại nếu count từ stats là 0, trả "-"
      return cnt > 0 ? String(cnt) : "-";
    }

    function buildLegacySlrAutoWeekSummaryText(summaryRows) {
      var rows = Array.isArray(summaryRows) ? summaryRows : [];
      if (!rows.length) return "-";
      return rows.map(function (sr) {
        var label = String(sr && sr.label || "");
        var vals = Array.isArray(sr && sr.values) ? sr.values : [];
        return label + ": " + vals.map(function (v) { return String(Number(v || 0)); }).join(" ");
      }).join("\n");
    }

    function buildLegacySlrAutoWeekSeriesText(summaryRows, mode, region) {
      var rows = Array.isArray(summaryRows) ? summaryRows : [];
      var m = String(mode || "C_D").toUpperCase();
      var r = String(region || "nam").toLowerCase() === "bac" ? "bac" : "nam";
      var targetKey = m === "2C"
        ? (r === "bac" ? "pair_bac" : "pair_nam")
        : (r === "bac" ? "t_bac" : "t_nam");
      var found = rows.find(function (sr) {
        return String((sr && sr.key) || "") === targetKey;
      });
      if (!found || !Array.isArray(found.values) || !found.values.length) return "-";
      return found.values.map(function (v) { return String(Number(v || 0)); }).join(" ");
    }

    function buildLegacySlrAutoPreviewGroups(rows, maxPerGroup) {
      var src = Array.isArray(rows) ? rows.slice() : [];
      var cap = Number(maxPerGroup || 0);
      var hasCap = cap > 0;
      var grouped = {};
      var order = [];

      src.forEach(function (r) {
        var label = String((r && r.queryLabel) || (r && r.queryValue) || "?").trim() || "?";
        var key = label.toLowerCase();
        if (!grouped[key]) {
          grouped[key] = { label: label, rows: [] };
          order.push(key);
        }
        grouped[key].rows.push(r || {});
      });

      var groups = [];
      var totalRaw = 0;
      var totalMerged = 0;
      var totalShown = 0;

      order.forEach(function (k) {
        var bucket = grouped[k] || { label: "?", rows: [] };
        var gRows = Array.isArray(bucket.rows) ? bucket.rows.slice() : [];
        totalRaw += gRows.length;
        if (!gRows.length) return;

        gRows.sort(function (a, b) {
          var df = Number((a && a.sttFrom) || 0) - Number((b && b.sttFrom) || 0);
          if (df) return df;
          return Number((a && a.sttTo) || 0) - Number((b && b.sttTo) || 0);
        });

        var mergedRows = [];
        var start = gRows[0];
        var end = gRows[0];
        var mergedCount = 1;
        var segmentRows = [gRows[0]];

        function isLegacySlrRowKeepByNamZeroWeek(row) {
          var streak = Number((row && row.tongNamZeroWeekStreak) || 0);
          var needed = Math.max(1, Number((row && row.tongNamWeeks) || 0));
          return streak > needed;
        }

        function flushMerged() {
          if (!start) return;
          var base = Object.assign({}, start, {
            sttFrom: Number((start && start.sttFrom) || 0),
            sttTo: Number((end && end.sttTo) || (start && start.sttTo) || 0),
            key: String((start && start.key) || "") + "_pv_" + String((end && end.key) || ""),
            isPreviewMerged: mergedCount > 1,
            previewMergedCount: mergedCount
          });
          mergedRows.push(base);

          if (mergedCount > 1) {
            for (var sri = 0; sri < segmentRows.length; sri += 1) {
              var childRow = segmentRows[sri] || {};
              if (!isLegacySlrRowKeepByNamZeroWeek(childRow)) continue;
              mergedRows.push(Object.assign({}, childRow, {
                isPreviewMergedChild: true,
                key: String((childRow && childRow.key) || "") + "_pv_child"
              }));
            }
          }
        }

        for (var i = 1; i < gRows.length; i += 1) {
          var cur = gRows[i] || {};
          // Auto rows were already merged once with full recomputation.
          // Do not merge them again in preview, otherwise STT range is expanded
          // but latestCellData stays from the first segment and numbers become too few.
          var hasPreMerged = !!(cur.isMergedAuto || (end && end.isMergedAuto) || cur.isMergedFallbackAuto || (end && end.isMergedFallbackAuto));
          var contiguous = !hasPreMerged
            && Number(cur.sttFrom || 0) === Number((end && end.sttFrom) || 0) + 1
            && Number(cur.sttTo || 0) === Number((end && end.sttTo) || 0) + 1;
          if (contiguous) {
            end = cur;
            mergedCount += 1;
            segmentRows.push(cur);
          } else {
            flushMerged();
            start = cur;
            end = cur;
            mergedCount = 1;
            segmentRows = [cur];
          }
        }
        flushMerged();

        totalMerged += mergedRows.length;
        var shownRows = hasCap ? mergedRows.slice(0, cap) : mergedRows.slice();
        totalShown += shownRows.length;
        groups.push({
          key: k,
          label: bucket.label,
          rows: shownRows,
          rawCount: gRows.length,
          mergedCount: mergedRows.length,
          shownCount: shownRows.length
        });
      });

      return {
        groups: groups,
        totalRaw: totalRaw,
        totalMerged: totalMerged,
        totalShown: totalShown
      };
    }

    async function exportLegacySlrAutoSelectedRows() {
      var selectedKeys = legacySlrAutoSelectedRowKeys || [];
      if (!selectedKeys.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }

      var selectedMap = {};
      selectedKeys.forEach(function (k) { selectedMap[String(k)] = true; });
      var rows = (legacySlrAutoFilteredRows || []).filter(function (row, idx) {
        var key = String((row && row.key) || (String((row && row.queryValue) || "") + "_" + String((row && row.sttFrom) || "") + "_" + String((row && row.sttTo) || "") + "_" + idx));
        return !!selectedMap[key];
      });

      if (!rows.length) {
        canhbao(tt.lgThSelectRowsToExport || "Vui lòng chọn ít nhất 1 dòng để xuất Excel");
        return;
      }

      var aoa = [[
        tt.searchType || "Loại Tìm",
        "Từ STT",
        "Đến STT",
        "Chuỗi không trúng",
        "Tổng Nam không xổ LT",
        "Số chính",
        "Số đảo",
        "Dãy Tổng Bắc",
        "Dãy Tổng Nam"
      ]];

      rows.forEach(function (r) {
        var noHitDaysCurrent = Number((r && r.noHitDaysCurrent) || (r && r.noHitDays) || 0);
        // Dùng latestCellStats (từ prefix sum cache) cho tất cả rows
        var cNamText = buildLegacySlrAutoNumberTextFromStats(r && r.latestCellStats, "c");
        var dNamText = String((r && r.mode) || "").toUpperCase() === "2C" 
          ? "-" 
          : buildLegacySlrAutoNumberTextFromStats(r && r.latestCellStats, "d");
        aoa.push([
          String((r && r.queryLabel) || ""),
          Number((r && r.sttFrom) || 0),
          Number((r && r.sttTo) || 0),
          String(noHitDaysCurrent) + " ngày (" + String((r && r.fromDate) || "") + " -> " + String((r && r.toDate) || "") + ")"
            + (r && r.noHitHintText ? ("\n" + String(r.noHitHintText)) : ""),
          String(Number((r && r.tongNamZeroWeekStreak) || 0)) + " tuần (yêu cầu > " + String(Number((r && r.tongNamWeeks) || 0)) + ")",
          cNamText,
          dNamText,
          buildLegacySlrAutoWeekSeriesText(r && r.weekSummaryRows, r && r.mode, "bac"),
          buildLegacySlrAutoWeekSeriesText(r && r.weekSummaryRows, r && r.mode, "nam")
        ]);
      });

      await exportPayloadToFile({
        fileName: "legacy_slr_auto_selected",
        sheets: [{ name: "SLR_Auto", aoa: aoa }]
      });
    }

    function applyLegacySlrAutoRowToManual(rec) {
      var row = rec || {};
      var sttFrom = Math.max(1, Number(row.sttFrom || 1));
      var sttTo = Math.max(sttFrom, Number(row.sttTo || sttFrom));
      var targetRaw = parseLegacyLoaiTimMeta(row.queryValue, legacyHeThong).rawValue;
      var matchedOption = (legacySlrQueryTypeOptions || []).find(function (item) {
        var optionRaw = parseLegacyLoaiTimMeta(item && item.value, legacyHeThong).rawValue;
        return String(optionRaw || "") === String(targetRaw || "");
      });
      var applyQueryValue = String((matchedOption && matchedOption.value) || targetRaw || row.queryValue || "");
      if (applyQueryValue) setLegacySlrQueryValue(applyQueryValue);
      setLegacyRankFrom(sttFrom);
      setLegacyRankTo(sttTo);
      setLegacySpecialConfigTab("slrnb");
      setLegacyTool("slrnb");
      setActiveAction("legacy_slr");
      setSubTab("legacy_slr");
      thongbao("Đã áp dụng: " + String(row.queryLabel || applyQueryValue || "Loại Tìm") + " | STT " + sttFrom + "-" + sttTo + " vào Khu vực thủ công");
    }

    var legacySlrAutoColumns = [
      {
        title: tt.searchType || "Loại Tìm",
        dataIndex: "queryLabel",
        key: "queryLabel",
        width: 220,
        fixed: "left",
        sorter: function (a, b) {
          return String((a && a.queryLabel) || "").localeCompare(String((b && b.queryLabel) || ""), "vi", { numeric: true, sensitivity: "base" });
        }
      },
      {
        title: "Từ STT",
        dataIndex: "sttFrom",
        key: "sttFrom",
        width: 90,
        sorter: function (a, b) { return Number((a && a.sttFrom) || 0) - Number((b && b.sttFrom) || 0); }
      },
      {
        title: "Đến STT",
        dataIndex: "sttTo",
        key: "sttTo",
        width: 90,
        sorter: function (a, b) { return Number((a && a.sttTo) || 0) - Number((b && b.sttTo) || 0); }
      },
      {
        title: "Chuỗi không trúng",
        dataIndex: "noHitDays",
        key: "noHitDays",
        width: 180,
        render: function (v, rec) {
          var hintText = String((rec && rec.noHitHintText) || "").trim();
          var noHitDaysCurrent = Number((rec && rec.noHitDaysCurrent) || v || 0);
          return h("div", null, [
            hintText ? h("div", { style: { fontSize: 13, color: theme.error, fontWeight: 800, lineHeight: 1.35 } }, hintText) : null,
            h("div", null, String(noHitDaysCurrent) + " ngày (" + String((rec && rec.fromDate) || "") + " -> " + String((rec && rec.toDate) || "") + ")")
          ]);
        }
      },
      {
        title: "Tổng Nam không xổ LT",
        dataIndex: "tongNamZeroWeekStreak",
        key: "tongNamZeroWeekStreak",
        width: 180,
        sorter: function (a, b) { return Number((a && a.tongNamZeroWeekStreak) || 0) - Number((b && b.tongNamZeroWeekStreak) || 0); },
        render: function (v, rec) {
          return String(Number(v || 0)) + " tuần (yêu cầu > " + String(Number((rec && rec.tongNamWeeks) || 0)) + ")";
        }
      },
      {
        title: "Số chính",
        dataIndex: "latestCellData",
        key: "slrAutoMainNumbers",
        width: 150,
        render: function (v, rec) {
          // Dùng latestCellStats (từ prefix sum cache) cho tất cả rows
          var text = buildLegacySlrAutoNumberTextFromStats(rec && rec.latestCellStats, "c");
          return h("span", {
            style: {
              color: text === "-" ? theme.muted : theme.text,
              fontWeight: 700,
              lineHeight: 1.5,
              wordBreak: "break-word"
            }
          }, text);
        }
      },
      {
        title: "Số đảo",
        dataIndex: "latestCellData",
        key: "slrAutoDaoNumbers",
        width: 150,
        render: function (v, rec) {
          var mode = String((rec && rec.mode) || "C_D").toUpperCase();
          // Dùng latestCellStats (từ prefix sum cache) cho tất cả rows
          var text = mode === "2C" 
            ? "-" 
            : buildLegacySlrAutoNumberTextFromStats(rec && rec.latestCellStats, "d");
          return h("span", {
            style: {
              color: text === "-" ? theme.muted : theme.primary,
              fontWeight: 700,
              lineHeight: 1.5,
              wordBreak: "break-word"
            }
          }, text);
        }
      },
      {
        title: "Dãy Tổng Bắc",
        dataIndex: "weekSummaryRows",
        key: "slrAutoTongBacSeries",
        width: 240,
        render: function (v, rec) {
          var text = buildLegacySlrAutoWeekSeriesText(v, rec && rec.mode, "bac");
          return h("span", {
            style: {
              color: text === "-" ? theme.muted : theme.text,
              fontWeight: 700,
              lineHeight: 1.5,
              wordBreak: "break-word"
            }
          }, text);
        }
      },
      {
        title: "Dãy Tổng Nam",
        dataIndex: "weekSummaryRows",
        key: "slrAutoTongNamSeries",
        width: 240,
        render: function (v, rec) {
          var text = buildLegacySlrAutoWeekSeriesText(v, rec && rec.mode, "nam");
          return h("span", {
            style: {
              color: text === "-" ? theme.muted : theme.text,
              fontWeight: 700,
              lineHeight: 1.5,
              wordBreak: "break-word"
            }
          }, text);
        }
      },
      {
        title: "Áp dụng",
        key: "applyManual",
        width: 128,
        fixed: "right",
        render: function (_v, rec) {
          return h(Button, {
            size: "small",
            type: "primary",
            onClick: function () { applyLegacySlrAutoRowToManual(rec); }
          }, "Dùng thủ công");
        }
      }
    ];

    function makeNbCol(title, di, dw, mp) {
      return { title: title, dataIndex: di, key: di, width: legacyNbColWidths[di] || dw,
        sorter: { compare: function(a, b) { return Number(a[di]||0) - Number(b[di]||0); }, multiple: mp },
        onHeaderCell: function(col) { return { "data-rk": col.key, "data-dw": String(dw) }; } };
    }

    var legacyNbColumns = [
      makeNbCol(tt.lgNbColSo,         "so",             80,  31),
      makeNbCol(tt.lgNbColDauCp,      "DAU_CP",        100,  30),
      makeNbCol(tt.lgNbColDauC,       "DAU_C",          90,  29),
      makeNbCol(tt.lgNbColDauP,       "DAU_P",          90,  28),
      makeNbCol(tt.lgNbColDauT,       "DAU_T",          90,  27),
      makeNbCol(tt.lgNbColDauB,       "DAU_B",          90,  26),
      makeNbCol(tt.lgNbColDuoiCp,     "DUOI_CP",       110,  25),
      makeNbCol(tt.lgNbColDuoiC,      "DUOI_C",         90,  24),
      makeNbCol(tt.lgNbColDuoiP,      "DUOI_P",         90,  23),
      makeNbCol(tt.lgNbColDuoiT,      "DUOI_T",         90,  22),
      makeNbCol(tt.lgNbColDuoiB,      "DUOI_B",         90,  21),
      makeNbCol(tt.lgNbColDauCDuoiP,  "DAU_C_DUOI_P",  120,  20),
      makeNbCol(tt.lgNbColDauPDuoiC,  "DAU_P_DUOI_C",  120,  19),
      makeNbCol(tt.lgNbColDd4Nhom,    "DD_4_NHOM",     160,  18),
      makeNbCol(tt.lgNbColDd3NamBdau, "DD_3_NAM_B_DAU",180,  17),
      makeNbCol(tt.lgNbColDd3Nam,     "DD_3_NAM",      150,  16),
      makeNbCol(tt.lgNbColDd3Nb,      "DD_3_NB",       150,  15),
      makeNbCol(tt.lgNbColDd2NamBdau, "DD_2_NAM_B_DAU",180,  14),
      makeNbCol(tt.lgNbColDd2Nam,     "DD_2_NAM",      150,  13),
      makeNbCol(tt.lgNbColDdC,        "DD_C",          120,  12),
      makeNbCol(tt.lgNbColDdP,        "DD_P",          120,  11),
      makeNbCol(tt.lgNbColDdT,        "DD_T",          120,  10),
      makeNbCol(tt.lgNbColDdB,        "DD_B",          120,   9),
      makeNbCol(tt.lgNbColBl4Nhom,    "BL_4_NHOM",     160,   8),
      makeNbCol(tt.lgNbColBl3Nam,     "BL_3_NAM",      150,   7),
      makeNbCol(tt.lgNbColBl3Nb,      "BL_3_NB",       150,   6),
      makeNbCol(tt.lgNbColBl2Nam,     "BL_2_NAM",      150,   5),
      makeNbCol(tt.lgNbColBlC,        "BL_C",          120,   4),
      makeNbCol(tt.lgNbColBlP,        "BL_P",          120,   3),
      makeNbCol(tt.lgNbColBlT,        "BL_T",          130,   2),
      makeNbCol(tt.lgNbColBlB,        "BL_B",          120,   1)
    ];


    var legacySlrQueryTypeOptions = (legacyThQueryTypeOptions && legacyThQueryTypeOptions.length)
      ? legacyThQueryTypeOptions
      : buildLegacyThDefaultQueryTypeDefs(legacyHeThong);

    // --- SLR Multi-select Loại Tìm state ---
    var _slr_qt = useState([]), legacySlrSelectedQueryTypes = _slr_qt[0], setLegacySlrSelectedQueryTypes = _slr_qt[1];

    // --- SLR Auto-run state ---
    var _slr_autoRunning = useState(false), legacySlrAutoRunning = _slr_autoRunning[0], setLegacySlrAutoRunning = _slr_autoRunning[1];

    var legacyNbGroupSizeOptions = (function () {
      var apiSizes = Object.keys((legacyThGroupOptions || []).reduce(function (acc, group) {
        var size = Number(group && group.groupSize || 0);
        if (size > 0) acc[String(size)] = true;
        return acc;
      }, {})).sort(function (a, b) { return Number(a) - Number(b); });
      // Fallback: show default sizes 1–5 when API groups have not been loaded yet
      var sizeKeys = apiSizes.length ? apiSizes : ["1", "2", "3", "4", "5"];
      return sizeKeys.map(function (size) {
        return { value: String(size), label: String(size) + " số" };
      });
    })();

    var sinhThKtn = toSinhThreshold(legacyThKtn, 12);
    var sinhThKtd = toSinhThreshold(legacyThKtd, 12);
    var sinhThL2c = toSinhThreshold(legacyThL2c, 12);
    var sinhThTky = toSinhThreshold(legacyThTky, 52);
    var sinhThTnd = toSinhThreshold(legacyThTnd, 7);
    var sinhTongNgay = toSinhThreshold(28, 28);
    var sinhTuan2Dai = toSinhThreshold(7, 7);
    var sinhTuanD3 = toSinhThreshold(7, 7);
    var legacyThInputItems = buildLegacyTongHopInputCachList();
    var legacyThManualGroupNormalItems = getLegacyTongHopCachListFromSelectedGroups(false);
    var legacyThManualGroupTrietItems = getLegacyTongHopCachListFromSelectedGroups(true);
    var legacyThManualNormalCount = legacyThInputItems.length || legacyThManualGroupNormalItems.length;
    var legacyThManualTrietCount = legacyThInputItems.length || legacyThManualGroupTrietItems.length;
    var legacyThManualResolvedCount = legacyThUseTrietSource ? legacyThManualTrietCount : legacyThManualNormalCount;
    var legacyThManualHasInput = legacyThInputItems.length > 0;
    var legacyThManualHasNormalGroup = legacyThManualGroupNormalItems.length > 0;
    var legacyThManualHasTrietGroup = legacyThManualGroupTrietItems.length > 0;
    var legacyThManualHasGroup = legacyThManualHasNormalGroup || legacyThManualHasTrietGroup;
    var legacyThManualUsesInputSource = legacyThManualHasInput;
    var legacyThManualUsesGroupSource = !legacyThManualUsesInputSource && legacyThManualHasGroup;
    var legacyThManualHasQueryType = !!((legacyThSelectedQueryTypes && legacyThSelectedQueryTypes[0]) || (legacyThQueryTypeOptions[0] && legacyThQueryTypeOptions[0].value));
    var legacyThManualCanRunNormal = legacyThManualNormalCount > 0 && legacyThManualHasQueryType;
    var legacyThManualCanRunTriet = legacyThManualTrietCount > 0 && legacyThManualHasQueryType;
    var legacyThManualSearchHint = (!legacyThManualHasInput && !legacyThManualHasGroup) ? tt.lgThManualNeedInput : (!legacyThManualHasQueryType ? tt.lgThManualNeedQueryType : "");
    var legacyThResolvedQueryTypeItems = getLegacyThSelectedQueryTypeItems();

    function legacyTongHopTextSorter(field) {
      return function (a, b) {
        return String((a && a[field]) || "").localeCompare(String((b && b[field]) || ""), "vi", { numeric: true, sensitivity: "base" });
      };
    }

    function legacyTongHopNumberSorter(field) {
      return function (a, b) {
        return Number((a && a[field]) || 0) - Number((b && b[field]) || 0);
      };
    }

    var legacyThColumns = [
      { title: "Các Số", dataIndex: "boSo", key: "boSo", width: 220, fixed: "left", sorter: legacyTongHopTextSorter("boSo"),
        render: function (v) { return h("b", null, v); } },
      { title: "Kết quả", dataIndex: "ketQua", key: "ketQua", width: 320,
        sorter: function (a, b) {
          return buildLegacyThResultText(a).localeCompare(buildLegacyThResultText(b), "vi", { numeric: true, sensitivity: "base" });
        },
        render: function (v, rec) {
          return h("div", { style: { fontSize: 11, whiteSpace: "pre", lineHeight: "1.4" } }, buildLegacyThResultText(rec));
        }
      },
      { title: "Tổng 21 tuần", dataIndex: "lanTuan21", key: "lanTuan21", width: 92, sorter: legacyTongHopNumberSorter("lanTuan21") },
      { title: "Ngày CX", dataIndex: "ngayCXHT", key: "ngayCXHT", width: 60, sorter: legacyTongHopNumberSorter("ngayCXHT"), defaultSortOrder: "descend",
        render: function (v, rec) {
          var over = rec.lauNgay > 0 && v >= rec.lauNgay;
          return h("span", { style: { color: over ? theme.error : theme.text, fontWeight: over ? "bold" : "normal" } }, v);
        }
      },
      { title: "Kỳ CX", dataIndex: "kyCXHT", key: "kyCXHT", width: 60, sorter: legacyTongHopNumberSorter("kyCXHT"),
        render: function (v, rec) {
          var over = rec.lauKy > 0 && v >= rec.lauKy;
          return h("span", { style: { color: over ? theme.warning : theme.text, fontWeight: over ? "bold" : "normal" } }, v);
        }
      },
      { title: "Lâu Ngày", dataIndex: "lauNgay", key: "lauNgay", width: 70, sorter: legacyTongHopNumberSorter("lauNgay") },
      { title: "Ngày CX 3 NB", dataIndex: "ngayCXHT3NB", key: "ngayCXHT3NB", width: 60, sorter: legacyTongHopNumberSorter("ngayCXHT3NB") },
      { title: "Ngày CX 2Đ", dataIndex: "ngayCXHT2D", key: "ngayCXHT2D", width: 70, sorter: legacyTongHopNumberSorter("ngayCXHT2D") },
      { title: "Ngày CX 3Đ", dataIndex: "ngayCXHT3D", key: "ngayCXHT3D", width: 70, sorter: legacyTongHopNumberSorter("ngayCXHT3D") },
      { title: "Ngày CX Đ3", dataIndex: "ngayCXHTT", key: "ngayCXHTT", width: 80, sorter: legacyTongHopNumberSorter("ngayCXHTT") },
      { title: "Ngày CX MB", dataIndex: "ngayCXHTMB", key: "ngayCXHTMB", width: 80, sorter: legacyTongHopNumberSorter("ngayCXHTMB") },
      { title: "Ngày CX ĐC", dataIndex: "ngayCXHTDC", key: "ngayCXHTDC", width: 70, sorter: legacyTongHopNumberSorter("ngayCXHTDC") },
      { title: "Ngày CX ĐP", dataIndex: "ngayCXHTDP", key: "ngayCXHTDP", width: 70, sorter: legacyTongHopNumberSorter("ngayCXHTDP") },
      { title: "Ngày CX NB", dataIndex: "ngayCXHTNB", key: "ngayCXHTNB", width: 70, sorter: legacyTongHopNumberSorter("ngayCXHTNB") },
      { title: "Lâu Kỳ", dataIndex: "lauKy", key: "lauKy", width: 70, sorter: legacyTongHopNumberSorter("lauKy") },
      { title: "Lâu ngày NB", dataIndex: "lauNgayNB", key: "lauNgayNB", width: 70, sorter: legacyTongHopNumberSorter("lauNgayNB") },
      { title: "Lâu ngày 3 NB", dataIndex: "lauNgay3NB", key: "lauNgay3NB", width: 70, sorter: legacyTongHopNumberSorter("lauNgay3NB") },
      { title: "Lâu ngày 2Đ", dataIndex: "lauNgay2D", key: "lauNgay2D", width: 70, sorter: legacyTongHopNumberSorter("lauNgay2D") },
      { title: "Lâu ngày 3Đ", dataIndex: "lauNgay3D", key: "lauNgay3D", width: 70, sorter: legacyTongHopNumberSorter("lauNgay3D") },
      { title: "Lâu ngày Đ3", dataIndex: "lauNgayT", key: "lauNgayT", width: 70, sorter: legacyTongHopNumberSorter("lauNgayT") },
      { title: "Lâu ngày MB", dataIndex: "lauNgayMB", key: "lauNgayMB", width: 70, sorter: legacyTongHopNumberSorter("lauNgayMB") },
      { title: "Lâu ngày ĐC", dataIndex: "lauNgayDC", key: "lauNgayDC", width: 70, sorter: legacyTongHopNumberSorter("lauNgayDC") },
      { title: "Lâu ngày ĐP", dataIndex: "lauNgayDP", key: "lauNgayDP", width: 70, sorter: legacyTongHopNumberSorter("lauNgayDP") },
      { title: "L2C", dataIndex: "lanL2C", key: "lanL2C", width: 55, sorter: legacyTongHopNumberSorter("lanL2C") },
      { title: "L3C", dataIndex: "lanL3C", key: "lanL3C", width: 55, sorter: legacyTongHopNumberSorter("lanL3C") },
      { title: "LB3C", dataIndex: "lanLB3C", key: "lanLB3C", width: 60, sorter: legacyTongHopNumberSorter("lanLB3C") },
      { title: "Tổng " + sinhTongNgay + " ngày", dataIndex: "lanTongNgaySinh", key: "lanTongNgaySinh", width: 70, sorter: legacyTongHopNumberSorter("lanTongNgaySinh") },
      { title: "Tuần Gần Nhất", dataIndex: "lanTuan1C", key: "lanTuan1C", width: 70, sorter: legacyTongHopNumberSorter("lanTuan1C") },
      { title: "Lần 2 Tuần cuối", dataIndex: "lanTuan2C", key: "lanTuan2C", width: 80, sorter: legacyTongHopNumberSorter("lanTuan2C") },
      { title: "Tổng " + sinhThTky + " kỳ", dataIndex: "lanDai", key: "lanDai", width: 90, sorter: legacyTongHopNumberSorter("lanDai") },
      { title: "Tổng " + sinhThKtn + " tuần", dataIndex: "lanTuan", key: "lanTuan", width: 90, sorter: legacyTongHopNumberSorter("lanTuan") },
      { title: sinhTuan2Dai + " tuần 2 đài", dataIndex: "lanTuanD2D", key: "lanTuanD2D", width: 80, sorter: legacyTongHopNumberSorter("lanTuanD2D") },
      { title: sinhThTnd + " ngày 2 đài", dataIndex: "lanNgayD2C", key: "lanNgayD2C", width: 90, sorter: legacyTongHopNumberSorter("lanNgayD2C") },
      { title: sinhTuanD3 + " tuần Đ3", dataIndex: "lanTuanD3", key: "lanTuanD3", width: 80, sorter: legacyTongHopNumberSorter("lanTuanD3") },
      { title: sinhThTnd + " ngày Đ3", dataIndex: "lanNgayD3", key: "lanNgayD3", width: 90, sorter: legacyTongHopNumberSorter("lanNgayD3") },
      { title: sinhThKtd + " KTD", dataIndex: "lanKTD", key: "lanKTD", width: 70, sorter: legacyTongHopNumberSorter("lanKTD") },
      { title: "Cách", dataIndex: "cach", key: "cach", width: 200, sorter: legacyTongHopTextSorter("cach") }
    ];

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
        var rec = src || {};
        var nums = [];
        Object.keys(rec).forEach(function (k) {
          if (String(k || "").indexOf("k_") !== 0) return;
          var n = parseInt(String(k).substring(2), 10);
          if (isNaN(n) || n <= 0) return;
          nums.push(n);
        });

        nums.sort(function (a, b) {
          return Number(appliedThongKe.sap_xep) === 0 ? (a - b) : (b - a);
        });

        var vals = [];
        var cot = 0;
        for (var i = 0; i < nums.length; i += 1) {
          var key = "k_" + String(nums[i]);
          var v = Number(rec[key] || 0);
          if (v > 0 && cot < maxCot) {
            cot += 1;
            vals.push(v);
          }
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
        if (activeAction === "tk" && Number(appliedThongKe.dem_lon_hon) > 0 && Number(appliedThongKe.sap_xep) === 0) {
          // Yêu cầu nghiệp vụ cho nhánh 1-56-3: tô block khi SL <= ngưỡng và chỉ áp dụng khi ngày mới đứng trước.
          var demVal = Number(obj.dem || 0);
          var passNguong = demVal <= Number(appliedThongKe.dem_lon_hon || 0);
          rec["hl" + group] = passNguong;
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

    function buildMatrixColumns(_groupCount, middleTitle, rightTitle) {
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
            if (rec && rec["hl" + groupIndex]) {
              c = (c ? c + " " : "") + "to_mau_zone";
            }
            return c ? { className: c } : {};
          },
          render: function (v) {
            if (field === "so") return v ? String(v) : "";
            return v;
          }
        };
      }

      // Vue matrix layout is fixed to 5 blocks (100 numbers / 20 rows):
      // [1] so1,tong1,dem1,kxh1
      // [2] vach_a,so2,tong2,dem2,kxh2
      // [3] vach_b,so3,tong3,dem3,kxh3,vach_c,so4
      // [4] tong4,dem4,kxh4
      // [5] vach_d,so5,tong5,dem5,kxh5
      return [
        makeLeaf(1, "so", "STT", 60, true),
        makeLeaf(1, "tong", "Tổng", 60, false),
        makeLeaf(1, "dem", "SL", 60, false),
        makeLeaf(1, "kxh", "KXH", 60, false),
        {
          title: "",
          key: "matrix_block_2",
          children: [
            makeSepCol("vach_a"),
            makeLeaf(2, "so", "", 55, true),
            makeLeaf(2, "tong", "", 55, false),
            makeLeaf(2, "dem", "", 55, false),
            makeLeaf(2, "kxh", "", 55, false)
          ]
        },
        {
          title: String(middleTitle || ""),
          key: "matrix_middle_block",
          children: [
            makeSepCol("vach_b"),
            makeLeaf(3, "so", "", 55, true),
            makeLeaf(3, "tong", "", 55, false),
            makeLeaf(3, "dem", "", 55, false),
            makeLeaf(3, "kxh", "", 55, false),
            makeSepCol("vach_c"),
            makeLeaf(4, "so", "", 55, true)
          ]
        },
        {
          title: String((appliedThongKe.so_chu || []).join("-") || ""),
          key: "matrix_so_chu_block",
          children: [
            makeLeaf(4, "tong", "", 55, false),
            makeLeaf(4, "dem", "", 55, false),
            makeLeaf(4, "kxh", "", 55, false)
          ]
        },
        {
          title: String(rightTitle || ""),
          key: "matrix_right_block",
          children: [
            makeSepCol("vach_d"),
            makeLeaf(5, "so", "", 55, true),
            makeLeaf(5, "tong", "", 55, false),
            makeLeaf(5, "dem", "", 55, false),
            makeLeaf(5, "kxh", "", 55, false)
          ]
        }
      ];
    }

    function gridAoaFromColumns(columns, rows) {
      return buildGenericExportAoa(columns, rows);
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
              columns: withMultiSortColumns(lichSuSoChuColumns),
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
                columns: withMultiSortColumns(thongkeComboColumns),
                dataSource: grp.rows,
                size: "small",
                pagination: false,
                scroll: { x: 1200 },
                rowClassName: function (rec) {
                  if (!rec) return "";
                  if (activeAction === "tkm") {
                    // Vue thong_ke_moi: bôi màu theo thoa_man
                    if (rec.thoa_man) return "to_mau";
                    return "";
                  }
                  // Vue chay_thong_ke: bôi màu khi số nằm trong số chủ và đang bật lọc dem_lon_hon
                  var soChuList = (appliedThongKe.so_chu || []).map(function (s) { return String(s || "").trim(); }).filter(Boolean);
                  if (Number(appliedThongKe.dem_lon_hon || 0) > 0 && soChuList.length > 0) {
                    var soVal = String(rec.so || "").trim();
                    if (soChuList.indexOf(soVal) >= 0) return "to_mau";
                  }
                  return "";
                }
              })
            ))
          });
          return;
        }

        var kqChildren;
        // Vue chay_thong_ke logic: KQ tab có các filter nâng cao
        if (activeAction === "tk") {
          if (Number(appliedThongKe.dem_lon_hon || 0) > 0 && Number(appliedThongKe.sap_xep) === 0) {
            var matrixTitle = buildMatrixTitle(comboTenDai);
            // Vue: cột cuối cùng luôn là tiêu đề thứ + ngày, còn block trước đó mới là so_chu.join('-').
            var rightTitle = String((appliedThongKe.thu_tuan || "") + " " + (appliedThongKe.den_ngay || "")).trim();
            var matrixCols = buildMatrixColumns(grp.matrixGroupCount || 0, matrixTitle, rightTitle);
            kqChildren = h("div", { className: "kqxs-kq-pane" },
              h("div", { key: "mx_" + grp.combo, className: "kqxs-kq-zone" },
                h(Table, {
                  rowKey: "id",
                  columns: withMultiSortColumns(matrixCols),
                  dataSource: grp.matrixRows || [],
                  size: "small",
                  pagination: false,
                  scroll: { x: "max-content" },
                  title: function () {
                    return renderTableTitleWithExport(matrixTitle, function (evt) {
                      captureTableFromActionEvent(evt, "kqxs_matrix_" + String(grp.combo || ""));
                    });
                  }
                })
              )
            );
          } else {
            var mainNode = null;
            var sideNodes = [];

            if (Number(appliedThongKe.lay_so_ky) > 0) {
              var layCols = buildLaySoKyColumns();
              var layTitle = buildLaySoKyTitle(comboTenDai);
              mainNode = h("div", { key: "lsk_" + grp.combo, className: "kqxs-kq-zone" },
                h(Table, {
                  rowKey: "id",
                  columns: withMultiSortColumns(layCols),
                  dataSource: grp.laySoKyRows || [],
                  size: "small",
                  pagination: false,
                  scroll: { x: "max-content" },
                  title: function () {
                    return renderTableTitleWithExport(layTitle, function (evt) {
                      captureTableFromActionEvent(evt, "kqxs_lay_so_ky_" + String(grp.combo || ""));
                    });
                  }
                })
              );
            }

            if (Number(appliedThongKe.kxh_phai_lonhon) > 0) {
              var kxhTitle = buildKxhTitle(comboTenDai);
              sideNodes.push(
                h("div", { key: "kxh_" + grp.combo, className: "kqxs-kq-zone" },
                  h(Table, {
                    rowKey: "id",
                    columns: withMultiSortColumns(pairColumns),
                    dataSource: grp.kxhPairRows || [],
                    size: "small",
                    pagination: false,
                    scroll: { x: "max-content" },
                    title: function () {
                      return renderTableTitleWithExport(kxhTitle, function (evt) {
                        captureTableFromActionEvent(evt, "kqxs_kxh_" + String(grp.combo || ""));
                      });
                    }
                  })
                )
              );
            }

            if (Number(appliedThongKe.dem_nho_hon) > 0) {
              var demTitle = buildDemNhoHonTitle(comboTenDai);
              sideNodes.push(
                h("div", { key: "dem_" + grp.combo, className: "kqxs-kq-zone" },
                  h(Table, {
                    rowKey: "id",
                    columns: withMultiSortColumns(pairColumns),
                    dataSource: grp.demNhoPairRows || [],
                    size: "small",
                    pagination: false,
                    scroll: { x: "max-content" },
                    title: function () {
                      return renderTableTitleWithExport(demTitle, function (evt) {
                        captureTableFromActionEvent(evt, "kqxs_dem_" + String(grp.combo || ""));
                      });
                    }
                  })
                )
              );
            }

            var rowNodes = [];
            if (mainNode) {
              rowNodes.push(h("div", { key: "main_" + grp.combo, className: "kqxs-kq-col kqxs-kq-col-main" }, [mainNode]));
            }
            sideNodes.forEach(function (node, idx) {
              rowNodes.push(h("div", { key: "side_" + grp.combo + "_" + idx, className: "kqxs-kq-col kqxs-kq-col-side" }, [node]));
            });

            kqChildren = h("div", { className: "kqxs-kq-pane" },
              rowNodes.length
                ? h("div", { className: "kqxs-kq-row" }, rowNodes)
                : h("div", {}, "Không có dữ liệu")
            );
          }
        } else {
          // Vue thong_ke_moi: KQ tab chỉ lọc thoa_man=true
          var kqRows = (grp.rows || []).filter(function (r) { return !!(r && r.thoa_man); });
          kqChildren = h("div", { className: "kqxs-kq-pane" }, h(Table, {
            rowKey: "id",
            columns: withMultiSortColumns(thongkeMoiKqCols),
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
    var legacyPanelTab = legacyMainTab;

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
      var maxCot = Math.max(1, Number(appliedThongKe.lay_so_ky || 1));
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
          // Parity with KQ runtime: matrix export chỉ áp cho chế độ ngày mới đứng trước.
          if (Number(appliedThongKe.dem_lon_hon || 0) > 0 && Number(appliedThongKe.sap_xep) === 0) {
            var matrixTitleExport = buildMatrixTitle(combo.replace(/,/g, "&"));
            // Vue export-equivalent title: cột cuối là thứ + ngày.
            var rightTitleExport = String((appliedThongKe.thu_tuan || "") + " " + (appliedThongKe.den_ngay || "")).trim();
            var matrixColsExport = buildMatrixColumns(grp.matrixGroupCount || 0, matrixTitleExport, rightTitleExport);
            var aoaMatrix = gridAoaFromColumns(matrixColsExport, grp.matrixRows || []);
            if (aoaMatrix.length > 1) payload.sheets.push({ name: "KQ matrix", aoa: aoaMatrix });
          } else {
            if (Number(appliedThongKe.lay_so_ky || 0) > 0 && (grp.laySoKyRows || []).length) {
              var layCols = buildLaySoKyColumns();
              var aoaLaySoKy = gridAoaFromColumns(layCols, grp.laySoKyRows || []);
              if (aoaLaySoKy.length > 1) payload.sheets.push({ name: "Lay so ky", aoa: aoaLaySoKy });
            }

            if (Number(appliedThongKe.kxh_phai_lonhon || 0) > 0) {
              var aoaKxh = gridAoaFromColumns(pairColumns, grp.kxhPairRows || []);
              payload.sheets.push({ name: "KQ KXH", aoa: aoaKxh });
            }

            if (Number(appliedThongKe.dem_nho_hon || 0) > 0) {
              var aoaDem = gridAoaFromColumns(pairColumns, grp.demNhoPairRows || []);
              payload.sheets.push({ name: "KQ dem", aoa: aoaDem });
            }
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

      // Prefer shared dynamic-grid export engine to keep behavior consistent across screens.
      var sharedExporter = window.csmDynamicGridExport;
      if (typeof sharedExporter === "function") {
        try {
          await sharedExporter({
            fileName: baseName,
            sheets: payload.sheets
          });
          thongbao(tt.exportDone);
          return;
        } catch (sharedErr) {
          // Keep legacy fallback path for resilience in runtime-injected environments.
        }
      }

      var XLSX = window.XLSX;

      if (!canWriteXlsx(XLSX)) {
        try {
          XLSX = await ensureXlsxLibrary();
        } catch (err) {
          XLSX = null;
        }
      }

      if (isUsableXlsx(XLSX)) {
        var hasBookApi = !!(XLSX && XLSX.utils
          && typeof XLSX.utils.book_new === "function"
          && typeof XLSX.utils.book_append_sheet === "function"
          && typeof XLSX.utils.aoa_to_sheet === "function");
        var wb = hasBookApi ? XLSX.utils.book_new() : { SheetNames: [], Sheets: {} };
        payload.sheets.forEach(function (sheet, idx) {
          var sheetName = sanitizeSheetName(sheet && sheet.name ? sheet.name : ("Sheet" + (idx + 1)));
          var aoa = (sheet && sheet.aoa) || [[""]];
          var ws = hasBookApi ? XLSX.utils.aoa_to_sheet(aoa) : makeWorksheetFromAoa(aoa, XLSX);
          tryApplyWorksheetVisuals(ws, aoa, XLSX);
          if (hasBookApi) {
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
          } else {
            wb.SheetNames.push(sheetName);
            wb.Sheets[sheetName] = ws;
          }
        });
        try {
          XLSX.writeFile(wb, baseName + ".xlsx", { bookType: "xlsx" });
          thongbao(tt.exportDone);
          return;
        } catch (e) {
          try {
            if (typeof XLSX.write === "function") {
              var xlsxBytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
              if (xlsxBytes) {
                downloadArrayBufferAsFile(baseName + ".xlsx", xlsxBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                thongbao(tt.exportDone);
                return;
              }
            }
          } catch (_xlsxWriteErr) {
            // keep retry branch
          }

          // Try one forced reload cycle for environments where XLSX bound JSZip too early.
          try {
            XLSX = await ensureXlsxLibrary();
            var hasBookApiRetry = !!(XLSX && XLSX.utils
              && typeof XLSX.utils.book_new === "function"
              && typeof XLSX.utils.book_append_sheet === "function"
              && typeof XLSX.utils.aoa_to_sheet === "function");
            var wbRetry = hasBookApiRetry ? XLSX.utils.book_new() : { SheetNames: [], Sheets: {} };
            payload.sheets.forEach(function (sheet, idx) {
              var sheetNameRetry = sanitizeSheetName(sheet && sheet.name ? sheet.name : ("Sheet" + (idx + 1)));
              var aoaRetry = (sheet && sheet.aoa) || [[""]];
              var wsRetry = hasBookApiRetry ? XLSX.utils.aoa_to_sheet(aoaRetry) : makeWorksheetFromAoa(aoaRetry, XLSX);
              tryApplyWorksheetVisuals(wsRetry, aoaRetry, XLSX);
              if (hasBookApiRetry) {
                XLSX.utils.book_append_sheet(wbRetry, wsRetry, sheetNameRetry);
              } else {
                wbRetry.SheetNames.push(sheetNameRetry);
                wbRetry.Sheets[sheetNameRetry] = wsRetry;
              }
            });
            try {
              XLSX.writeFile(wbRetry, baseName + ".xlsx", { bookType: "xlsx" });
            } catch (_xlsxWriteRetryErr) {
              if (typeof XLSX.write === "function") {
                var xlsxBytesRetry = XLSX.write(wbRetry, { bookType: "xlsx", type: "array" });
                if (xlsxBytesRetry) {
                  downloadArrayBufferAsFile(baseName + ".xlsx", xlsxBytesRetry, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                  thongbao(tt.exportDone);
                  return;
                }
              }
              throw _xlsxWriteRetryErr;
            }
            thongbao(tt.exportDone);
            return;
          } catch (e2) {
            // Fall through to CSV fallback
          }
        }
      }

      canhbao(tt.exportXlsxOnlyFailed || "Xuất Excel .xlsx thất bại. Vui lòng thử lại hoặc tải lại trang.");
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

    function themedNumberProps(extra) {
      var opts = extra || {};
      var userOnKeyDown = typeof opts.onKeyDown === "function" ? opts.onKeyDown : null;
      var userParser = typeof opts.parser === "function" ? opts.parser : null;

      function sanitizeDigits(raw) {
        return String(raw == null ? "" : raw).replace(/[^\d]/g, "");
      }

      function handleNumericKeyDown(e) {
        var key = String((e && e.key) || "");
        var ctrlMeta = !!(e && (e.ctrlKey || e.metaKey));
        if (ctrlMeta && /^[acvxzy]$/i.test(key)) {
          if (userOnKeyDown) userOnKeyDown(e);
          return;
        }

        var allowNav = {
          Backspace: true,
          Delete: true,
          Tab: true,
          Enter: true,
          ArrowLeft: true,
          ArrowRight: true,
          ArrowUp: true,
          ArrowDown: true,
          Home: true,
          End: true
        };
        if (/^\d$/.test(key) || allowNav[key]) {
          if (userOnKeyDown) userOnKeyDown(e);
          return;
        }

        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (userOnKeyDown) userOnKeyDown(e);
      }

      function parseNumeric(raw) {
        var cleaned = sanitizeDigits(raw);
        if (userParser) return userParser(cleaned);
        return cleaned;
      }

      var base = {
        style: { width: "100%" },
        controls: false,
        inputMode: "numeric",
        parser: parseNumeric,
        onKeyDown: handleNumericKeyDown
      };

      var merged = Object.assign({}, base, opts);
      merged.parser = parseNumeric;
      merged.onKeyDown = handleNumericKeyDown;
      return merged;
    }

    function renderDateField(value, onChange, options) {
      var opts = options || {};
      var currentText = String(value || "").trim();
      var minText = String(opts.minDate || "").trim();
      var maxText = String(opts.maxDate || "").trim();

      function toInputDate(dmy) {
        var s = String(dmy || "").trim();
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return "";
        var p = s.split("/");
        return p[2] + "-" + p[1] + "-" + p[0];
      }

      function fromInputDate(ymd) {
        var s = String(ymd || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
        var p = s.split("-");
        return p[2] + "/" + p[1] + "/" + p[0];
      }

      if (DatePicker && dayjsRef) {
        var valDay = dayjsRef(currentText, "DD/MM/YYYY", true);
        var minDay = minText ? dayjsRef(minText, "DD/MM/YYYY", true) : null;
        var maxDay = maxText ? dayjsRef(maxText, "DD/MM/YYYY", true) : null;
        var pickerValue = (valDay && valDay.isValid && valDay.isValid()) ? valDay : null;
        var pickerMin = (minDay && minDay.isValid && minDay.isValid()) ? minDay : null;
        var pickerMax = (maxDay && maxDay.isValid && maxDay.isValid()) ? maxDay : null;

        return h(DatePicker, {
          value: pickerValue,
          format: "DD/MM/YYYY",
          allowClear: false,
          style: { width: "100%" },
          popupClassName: "kqxs-react-auto-date-popup",
          dropdownClassName: "kqxs-react-auto-date-popup",
          disabledDate: function (current) {
            if (!current) return false;
            if (pickerMin && current.isBefore(pickerMin, "day")) return true;
            if (pickerMax && current.isAfter(pickerMax, "day")) return true;
            return false;
          },
          onChange: function (next) {
            if (!next || !next.isValid || !next.isValid()) {
              if (typeof onChange === "function") onChange("");
              return;
            }
            if (typeof onChange === "function") onChange(next.format("DD/MM/YYYY"));
          }
        });
      }

      return h("input", {
        type: "date",
        className: "ant-input",
        style: { width: "100%" },
        value: toInputDate(currentText),
        min: toInputDate(minText) || undefined,
        max: toInputDate(maxText) || undefined,
        onChange: function (e) {
          var raw = e && e.target ? e.target.value : "";
          if (typeof onChange === "function") onChange(fromInputDate(raw));
        }
      });
    }

    function themedSelectProps(extra) {
      var base = {
        style: { width: "100%" },
        showSearch: true,
        filterOption: function (input, option) {
          var label = String((option && (option.label != null ? option.label : option.children)) || "");
          return label.toLowerCase().indexOf(input.toLowerCase()) >= 0;
        },
        popupClassName: "kqxs-react-auto-popup",
        dropdownClassName: "kqxs-react-auto-popup",
        placement: "bottomLeft"
      };
      return Object.assign(base, extra || {});
    }

    var runtimeCss = ""
      + ".kqxs-react-auto { background: var(--kqxs-page-bg, #f5f7fb) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-card, .kqxs-react-auto .ant-card-head, .kqxs-react-auto .ant-card-body { background: var(--kqxs-card-bg, #fff) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-tabs-tab-btn, .kqxs-react-auto .ant-tabs-tab-btn:focus, .kqxs-react-auto .ant-tabs-tab-btn:active { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-tabs-tab:hover .ant-tabs-tab-btn, .kqxs-react-auto .ant-tabs-tab-active .ant-tabs-tab-btn { color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tabs-ink-bar { background: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .ant-tabs-nav::before { border-bottom-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-input, .kqxs-react-auto .ant-input-affix-wrapper, .kqxs-react-auto .ant-input-number, .kqxs-react-auto .ant-select-selector { background: var(--kqxs-input-bg, #fff) !important; color: var(--kqxs-input-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-input-number-input, .kqxs-react-auto .ant-select-selection-item, .kqxs-react-auto .ant-select-selection-search-input { color: var(--kqxs-input-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-input-number .ant-input-number-handler-wrap { display: none !important; }"
      + ".kqxs-react-auto .ant-input-number-input-wrap { padding-left: 0 !important; padding-right: 0 !important; }"
      + ".kqxs-react-auto .ant-input-number-input { height: auto !important; line-height: normal !important; padding: 0 !important; }"
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
      + ".kqxs-react-auto input[type='checkbox'] { accent-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto input[type='checkbox'] + span, .kqxs-react-auto label { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-checkbox-wrapper, .kqxs-react-auto .ant-checkbox-wrapper span, .kqxs-react-auto .ant-checkbox + span { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-card-head-title { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-tag { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 14%, transparent) !important; color: var(--kqxs-text, #1f1f1f) !important; border-color: color-mix(in srgb, var(--kqxs-primary, #1677ff) 35%, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .ant-progress-text, .kqxs-react-auto .ant-progress-outer { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-empty-description { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto-popup, .kqxs-react-auto-date-popup, .kqxs-react-auto-popup * , .kqxs-react-auto-date-popup * { color: var(--kqxs-text, #1f1f1f); }"
      + ".kqxs-react-auto-popup.ant-select-dropdown { background: var(--kqxs-card-bg, #fff) !important; border: 1px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item { color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item-option-active:not(.ant-select-item-option-disabled) { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 10%, transparent) !important; }"
      + ".kqxs-react-auto-popup .ant-select-item-option-selected:not(.ant-select-item-option-disabled) { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, transparent) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-panel-container { background: var(--kqxs-card-bg, #fff) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto-date-popup .ant-picker-header, .kqxs-react-auto-date-popup .ant-picker-header-view button, .kqxs-react-auto-date-popup .ant-picker-header button, .kqxs-react-auto-date-popup .ant-picker-body, .kqxs-react-auto-date-popup .ant-picker-cell, .kqxs-react-auto-date-popup .ant-picker-content { background: var(--kqxs-card-bg, #fff) !important; color: var(--kqxs-text, #1f1f1f) !important; }"
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
      + ".kqxs-react-auto .kqxs-kq-row { display: flex; flex-wrap: nowrap; gap: 12px; align-items: flex-start; overflow-x: auto; width: 100%; padding-bottom: 2px; }"
      + ".kqxs-react-auto .kqxs-kq-col { min-width: 0; }"
      + ".kqxs-react-auto .kqxs-kq-col-main { flex: 1 1 602px; min-width: 560px; max-width: 100%; }"
      + ".kqxs-react-auto .kqxs-kq-col-side { flex: 0 1 230px; min-width: 220px; max-width: 260px; width: 230px; }"
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
      + ".kqxs-react-auto .ant-tree { background: transparent !important; color: var(--kqxs-text, #1f1f1f) !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-node-content-wrapper { color: var(--kqxs-text, #1f1f1f) !important; border-radius: 4px !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-node-content-wrapper:hover { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 10%, transparent) !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-node-selected, .kqxs-react-auto .ant-tree .ant-tree-node-content-wrapper.ant-tree-node-selected { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 14%, transparent) !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-switcher, .kqxs-react-auto .ant-tree .ant-tree-switcher-icon { color: var(--kqxs-muted, #666) !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-checkbox-inner { background: var(--kqxs-input-bg, #fff) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .ant-tree .ant-tree-checkbox-checked .ant-tree-checkbox-inner { background: var(--kqxs-primary, #1677ff) !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + "@media (max-width: 1200px) {"
      + ".kqxs-react-auto .kqxs-kq-col-main, .kqxs-react-auto .kqxs-kq-col-side { flex: 1 1 100%; max-width: 100%; min-width: 0; }"
      + ".kqxs-react-auto .kqxs-capture-toolbar { position: static; margin-bottom: 6px; display: flex; justify-content: flex-end; }"
      + "}"
      + ".kqxs-react-auto .kqxs-sticky-filters { position: sticky; top: 8px; z-index: 25; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }"
      + ".kqxs-react-auto .kqxs-slr-layout { margin: 0 !important; }"
      + ".kqxs-react-auto .kqxs-slr-col { border: 1px solid var(--kqxs-border, #d9d9d9); border-radius: 6px; padding: 8px; min-height: 100%; background: var(--kqxs-card-bg, #fff); box-shadow: none; }"
      + ".kqxs-react-auto .kqxs-slr-field { margin-bottom: 8px; }"
      + ".kqxs-react-auto .kqxs-slr-label { margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--kqxs-text, #1f1f1f); }"
      + ".kqxs-react-auto .kqxs-slr-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }"
      + ".kqxs-react-auto .kqxs-loc-sau-zone { border: 1px solid var(--kqxs-border, #d9d9d9); border-radius: 6px; padding: 8px; margin-top: 2px; background: var(--kqxs-card-bg, #fff); box-shadow: none; }"
      + ".kqxs-react-auto .kqxs-loc-sau-zone .kqxs-slr-label { color: var(--kqxs-text, #1f1f1f); }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input, .kqxs-react-auto .kqxs-slr-col .ant-select-selector, .kqxs-react-auto .kqxs-slr-col .ant-input-number, .kqxs-react-auto .kqxs-slr-col .ant-picker { border-radius: 6px !important; box-shadow: none !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number, .kqxs-react-auto .kqxs-slr-col .ant-select-selector, .kqxs-react-auto .kqxs-slr-col .ant-picker { border-color: var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number.ant-input-number-outlined { width: 100% !important; display: block !important; overflow: hidden !important; padding-inline: 0 !important; border: 1px solid var(--kqxs-border, #d9d9d9) !important; border-radius: 6px !important; background: var(--kqxs-input-bg, #fff) !important; min-height: 32px !important; height: 32px !important; box-sizing: border-box !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number.ant-input-number-outlined .ant-input-number-input-wrap { height: 100% !important; padding-left: 11px !important; padding-right: 11px !important; box-sizing: border-box !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number.ant-input-number-outlined .ant-input-number-input { height: 100% !important; line-height: 30px !important; padding: 0 !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number.ant-input-number-outlined:hover { border-color: var(--kqxs-primary, #1677ff) !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input-number.ant-input-number-outlined.ant-input-number-focused { border-color: var(--kqxs-primary, #1677ff) !important; box-shadow: none !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input:hover, .kqxs-react-auto .kqxs-slr-col .ant-input-number:hover, .kqxs-react-auto .kqxs-slr-col .ant-select:not(.ant-select-disabled):hover .ant-select-selector, .kqxs-react-auto .kqxs-slr-col .ant-picker:hover { box-shadow: none !important; }"
      + ".kqxs-react-auto .kqxs-slr-col .ant-input:focus, .kqxs-react-auto .kqxs-slr-col .ant-input-focused, .kqxs-react-auto .kqxs-slr-col .ant-input-number-focused, .kqxs-react-auto .kqxs-slr-col .ant-select-focused .ant-select-selector, .kqxs-react-auto .kqxs-slr-col .ant-picker-focused { box-shadow: none !important; border-color: var(--kqxs-primary, #1677ff) !important; }"
      + "@media (max-width: 768px) { .kqxs-react-auto .kqxs-sticky-filters { top: 0; border-radius: 0 !important; } }";

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
      h(Tabs, {
        key: "legacy-main-tabs",
        activeKey: legacyMainTab,
        onChange: switchLegacyMainTab,
        size: "small",
        items: [
          {
            key: "slr",
            label: "Thống Kê Lô",
            children: h("div", null)
          },
          {
            key: "other",
            label: "Đặc Biệt",
            children: h("div", null, [
              h(Tabs, {
                key: "legacy-other-tabs",
                activeKey: legacySpecialConfigTab,
                onChange: switchLegacySpecialConfigTab,
                size: "small",
                items: [
                  {
                    key: "th",
                    label: tt.lgSubTabTh || "① Tổng Hợp",
                    children: h("div", null, [
                      h("div", { style: { marginTop: 8 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
                    ])
                  },
                  {
                    key: "slrnb",
                    label: tt.lgSubTabSlr || tt.lgToolSlr,
                    children: h("div", { style: { paddingTop: 4 } }, [
                      h(Row, { gutter: [12, 10], align: "stretch" }, [
                        h(Col, { xs: 24, lg: 15, key: "slrnb_manual_panel" }, [
                          h(Card, {
                            size: "small",
                            title: "Khu vực thủ công",
                            style: { height: "100%", background: theme.cardBg, color: theme.text, borderColor: theme.border }
                          }, [
                            h(Row, { gutter: [10, 8] }, [
                              h(Col, { xs: 24, md: 12, key: "slrnb_from" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.fromDate),
                                renderDateField(tu_ngay, function (next) { setTuNgay(next); }, { maxDate: den_ngay })
                              ]),
                              h(Col, { xs: 24, md: 12, key: "slrnb_to" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
                                renderDateField(den_ngay, function (next) { setDenNgay(next); }, { minDate: tu_ngay })
                              ]),
                              h(Col, { xs: 12, md: 8, key: "slrnb_he" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgHeThong),
                                h(Select, themedSelectProps({
                                  value: legacyHeThong,
                                  options: [{ value: 2, label: "Hệ 2 số" }, { value: 3, label: "Hệ 3 số" }],
                                  onChange: function (v) { setLegacyHeThong(toNumberSafe(v, 2)); }
                                }))
                              ]),
                              h(Col, { xs: 12, md: 16, key: "slrnb_loai" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.searchType),
                                h(Select, themedSelectProps({
                                  value: legacySlrQueryValue,
                                  options: (legacySlrQueryTypeOptions || []).map(function (item) {
                                    return { value: item.value, label: item.text || item.value };
                                  }),
                                  onChange: function (v) { setLegacySlrQueryValue(String(v || "")); }
                                }))
                              ]),
                              h(Col, { xs: 12, md: 8, key: "slrnb_mode" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgCdMode),
                                h(Select, themedSelectProps({
                                  value: legacyCdMode,
                                  options: [
                                    { value: "C_D", label: tt.lgCdAll },
                                    { value: "C", label: tt.lgCdC },
                                    { value: "D", label: tt.lgCdD },
                                    { value: "2C", label: tt.lgCdPair }
                                  ],
                                  onChange: function (v) {
                                    var next = String(v || "C_D");
                                    setLegacyCdMode(next);
                                    setLegacyRankTo(next === "2C" ? 5 : 20);
                                  }
                                }))
                              ]),
                              h(Col, { xs: 12, md: 5, key: "slrnb_from_rank" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgGhTu),
                                h(InputNumber, themedNumberProps({ value: legacyRankFrom, min: 1, max: 60, onChange: function (v) { setLegacyRankFrom(toNumberSafe(v, 1)); } }))
                              ]),
                              h(Col, { xs: 12, md: 5, key: "slrnb_to_rank" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgGhDen),
                                h(InputNumber, themedNumberProps({ value: legacyRankTo, min: 1, max: 60, onChange: function (v) { setLegacyRankTo(toNumberSafe(v, 20)); } }))
                              ]),
                              h(Col, { xs: 12, md: 6, key: "slrnb_ngay" }, [
                                h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgNgayChay),
                                h(InputNumber, themedNumberProps({
                                  value: legacyNgayChay,
                                  min: 0,
                                  max: 1000,
                                  onChange: function (v) { setLegacyNgayChay(toNumberSafe(v, 0)); }
                                }))
                              ]),
                              h(Col, { xs: 24, md: 24, key: "slrnb_actions" }, [
                                h("div", { style: { marginTop: 2, padding: "8px 10px", border: "1px solid " + theme.border, borderRadius: 6, background: "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)" } }, [
                                  h(Row, { gutter: [10, 8], align: "middle" }, [
                                    h(Col, { xs: 24, md: 17, key: "slrnb_flags" }, [
                                      h(Space, { wrap: true }, [
                                        h(Checkbox, { checked: !!legacyTheoKy, onChange: function (e) { setLegacyTheoKy(!!(e && e.target && e.target.checked)); } }, tt.lgTheoKy),
                                        h(Checkbox, { checked: !!legacyTheoThu, onChange: function (e) {
                                          var checked = !!(e && e.target && e.target.checked);
                                          setLegacyTheoThu(checked);
                                          if (checked) setLegacyTheoKy(true);
                                        } }, tt.lgTheoThu),
                                        h(Checkbox, { checked: !!legacyChkHieu, onChange: function (e) { setLegacyChkHieu(!!(e && e.target && e.target.checked)); } }, tt.lgChkHieu)
                                      ])
                                    ]),
                                    h(Col, { xs: 24, md: 7, key: "slrnb_run", style: { textAlign: "right" } }, [
                                      h(Button, { type: "primary", onClick: runLegacySoLauRa, loading: loading }, "Tìm")
                                    ])
                                  ])
                                ])
                              ])
                            ])
                          ])
                        ]),
                        h(Col, { xs: 24, lg: 9, key: "slrnb_auto_panel" }, [
                          h(Card, {
                            size: "small",
                            title: "Khu vực chạy tự động (Auto)",
                            style: { height: "100%", background: theme.cardBg, color: theme.text, borderColor: theme.border }
                          }, [
                            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, "Điều kiện chạy tự động"),
                            h(Row, { gutter: [8, 8], style: { marginBottom: 10 } }, [
                              h(Col, { xs: 12, sm: 8 }, [
                                h("div", { style: { fontSize: 12, color: theme.muted, marginBottom: 4 } }, "STT liên tiếp"),
                                h(InputNumber, themedNumberProps({
                                  min: 1,
                                  max: 30,
                                  value: legacySlrAutoSttRange,
                                  style: { width: "100%" },
                                  onChange: function (v) { setLegacySlrAutoSttRange(Math.max(1, Number(v) || 1)); }
                                }))
                              ]),
                              h(Col, { xs: 12, sm: 8 }, [
                                h("div", { style: { fontSize: 12, color: theme.muted, marginBottom: 4 } }, "Ngày không trúng LT"),
                                h(InputNumber, themedNumberProps({
                                  min: 1,
                                  max: 120,
                                  value: legacySlrAutoNoHitDays,
                                  style: { width: "100%" },
                                  onChange: function (v) { setLegacySlrAutoNoHitDays(Math.max(1, Number(v) || 1)); }
                                }))
                              ]),
                              h(Col, { xs: 24, sm: 8 }, [
                                h("div", { style: { fontSize: 12, color: theme.muted, marginBottom: 4 } }, "Nam 0/tuần LT"),
                                h(InputNumber, themedNumberProps({
                                  min: 1,
                                  max: 20,
                                  value: legacySlrAutoNamWeeks,
                                  style: { width: "100%" },
                                  onChange: function (v) { setLegacySlrAutoNamWeeks(Math.max(1, Number(v) || 1)); }
                                }))
                              ])
                            ]),
                            h(Space, { wrap: true, style: { marginBottom: 10 } }, [
                              h(Button, {
                                type: "primary",
                                className: "kqxs-action-btn kqxs-action-btn-primary",
                                loading: !!legacySlrAutoRunning,
                                disabled: !!legacySlrAutoRunning,
                                onClick: function () { runLegacySlrAutoFilter(); }
                              }, "Chạy lọc tự động")
                            ]),
                            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, (tt.lgThAutoQueryTypes || "Loại Tìm") + " (" + ((legacySlrSelectedQueryTypes && legacySlrSelectedQueryTypes.length) || 0) + "/" + ((legacySlrQueryTypeOptions && legacySlrQueryTypeOptions.length) || 0) + ")"),
                            h("div", { style: { maxHeight: 180, overflow: "auto", border: "1px solid " + theme.border, borderRadius: 4, background: theme.cardBg, padding: "4px 0", marginBottom: 10 } },
                              (legacySlrQueryTypeOptions || []).length
                                ? (legacySlrQueryTypeOptions || []).map(function (item, idx) {
                                    return h("label", { key: "slr_auto_q_" + idx, style: { display: "flex", alignItems: "center", fontSize: 12, color: theme.text, padding: "3px 8px", gap: 6, cursor: "pointer" } }, [
                                      h("input", {
                                        type: "checkbox",
                                        checked: Array.isArray(legacySlrSelectedQueryTypes) && legacySlrSelectedQueryTypes.indexOf(item.value) >= 0,
                                        onChange: function (e) {
                                          var c = !!(e && e.target && e.target.checked);
                                          setLegacySlrSelectedQueryTypes(function (p) { return toggleLegacyThSelection(p, item.value, c); });
                                        },
                                        style: { cursor: "pointer", margin: 0 }
                                      }),
                                      item.text || item.value
                                    ]);
                                  })
                                : h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Chưa có dữ liệu")
                            ),
                            h("div", { style: { padding: "8px 10px", border: "1px dashed " + theme.border, borderRadius: 4, background: "color-mix(in srgb, " + theme.cardBg + " 92%, " + theme.pageBg + " 8%)" } }, [
                              (function () {
                                var allRows = (legacySlrAutoFilteredRows && legacySlrAutoFilteredRows.length) ? legacySlrAutoFilteredRows : null;
                                if (!allRows) return h("span", { style: { color: theme.muted } }, "Chưa có kết quả tự động");
                                var preview = buildLegacySlrAutoPreviewGroups(allRows, 0);
                                var groups = Array.isArray(preview.groups) ? preview.groups : [];
                                return h("div", null, [
                                  h("div", { style: { fontWeight: 600, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
                                    h("span", { style: { color: theme.primary } }, preview.totalShown + " dòng hiển thị sau gộp / " + groups.length + " loại tìm"),
                                    h("span", { style: { fontSize: 11, color: theme.muted } }, "(không giới hạn số dòng/loại)")
                                  ]),
                                  (preview.totalRaw !== preview.totalMerged)
                                    ? h("div", { style: { fontSize: 11, color: theme.muted, marginBottom: 6 } }, "Gốc: " + preview.totalRaw + " dòng, sau gộp: " + preview.totalMerged + " dòng")
                                    : null,
                                  h("div", { style: { maxHeight: 280, overflow: "auto" } },
                                    groups.map(function (g) {
                                      var gk = String((g && g.label) || "?");
                                      var gRows = (g && g.rows) || [];
                                      return h("div", { key: "slr_ag_" + gk, style: { marginBottom: 8 } }, [
                                        h("div", { style: { fontSize: 11, fontWeight: 700, color: theme.text, background: "color-mix(in srgb, " + theme.primary + " 12%, " + theme.cardBg + ")", padding: "3px 6px", borderRadius: 3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, gk),
                                        gRows.map(function (r, ri) {
                                          var namZeroWeeks = Number((r && r.tongNamZeroWeekStreak) || 0);
                                          var namZeroDays = Math.max(0, namZeroWeeks * 7);
                                          var noHitDaysCurrent = Number((r && r.noHitDaysCurrent) || (r && r.noHitDays) || 0);
                                          return h("div", {
                                            key: "slr_auto_apply_" + String((r && r.key) || ri),
                                            style: {
                                              display: "grid",
                                              gridTemplateColumns: "1fr auto auto auto",
                                              alignItems: "center",
                                              gap: 6,
                                              padding: "4px 4px",
                                              borderBottom: ri < gRows.length - 1 ? ("1px dashed " + theme.border) : "none"
                                            }
                                          }, [
                                            h("span", { style: { fontSize: 12, color: theme.muted } }, [
                                              String((r && r.noHitHintText) || "").trim()
                                                ? h("div", { style: { fontSize: 13, color: theme.error, fontWeight: 800, lineHeight: 1.35 } }, String(r.noHitHintText || ""))
                                                : null,
                                              h("div", null, "STT " + String(r.sttFrom || "") + "–" + String(r.sttTo || ""))
                                            ]),
                                            h("span", { style: { fontSize: 12, color: theme.text, whiteSpace: "nowrap" } }, String(noHitDaysCurrent) + "ng"),
                                            h("span", {
                                              style: {
                                                fontSize: 12,
                                                color: theme.primary,
                                                whiteSpace: "nowrap",
                                                fontWeight: 700,
                                                textAlign: "right"
                                              }
                                            }, String(namZeroWeeks) + " tuần / " + String(namZeroDays) + "ng"),
                                            h(Button, {
                                              size: "small",
                                              type: "primary",
                                              onClick: function () { applyLegacySlrAutoRowToManual(r); }
                                            }, "Dùng")
                                          ]);
                                        })
                                      ]);
                                    })
                                  )
                                ]);
                              })()
                            ]),
                          ])
                        ])
                      ]),
                      h("div", { style: { marginTop: 10 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
                    ])
                  },
                  {
                    key: "ktt",
                    label: tt.lgSubTabKtt || tt.lgToolKtt,
                    children: h("div", { style: { paddingTop: 4 } }, [
                      h(Row, { gutter: [12, 10], align: "middle" }, [
                        h(Col, { xs: 24, md: 8, key: "ktt_so" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.soChu || "Số Dự Đoán"),
                          h(Input, {
                            value: so_chu_input,
                            inputMode: "text",
                            onChange: function (e) {
                              var raw = e && e.target ? e.target.value : "";
                              setSoChuInput(raw);
                            },
                            placeholder: legacyHeThong === 3 ? "Ví dụ: 123 456 789" : "Ví dụ: 12 34 56"
                          })
                        ]),
                        h(Col, { xs: 12, md: 4, key: "ktt_from" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.fromDate),
                          renderDateField(tu_ngay, function (next) { setTuNgay(next); }, { maxDate: den_ngay })
                        ]),
                        h(Col, { xs: 12, md: 4, key: "ktt_to" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
                          renderDateField(den_ngay, function (next) { setDenNgay(next); }, { minDate: tu_ngay })
                        ]),
                        h(Col, { xs: 12, md: 4, key: "ktt_system" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgHeThong),
                          h(Select, themedSelectProps({
                            value: legacyHeThong,
                            options: [{ value: 2, label: "Hệ 2 số" }, { value: 3, label: "Hệ 3 số" }],
                            onChange: function (v) {
                              var nextHe = toNumberSafe(v, 2);
                              setLegacyHeThong(nextHe);
                            }
                          }))
                        ]),
                        h(Col, { xs: 12, md: 4, key: "ktt_run", style: { textAlign: "right" } }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600, visibility: "hidden" } }, "_"),
                          h(Button, { type: "primary", onClick: runLegacyKiemTraTongHop, loading: loading }, "Xem")
                        ]),
                        h(Col, { xs: 24, md: 24, key: "ktt_fields", style: { padding: "8px 10px", border: "1px solid " + theme.border, borderRadius: 6, background: "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)" } }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgKttFields),
                          h(Space, { wrap: true, style: { marginBottom: 6 } }, [
                            h("label", { key: "ktt_station_D", style: { marginRight: 10, fontWeight: 600 } }, [
                              h("input", {
                                type: "checkbox",
                                checked: !!legacyLocMap.D_dau && !!legacyLocMap.D_duoi,
                                onChange: function (e) { setLegacyKttStationEnabled("D", !!(e && e.target && e.target.checked)); }
                              }),
                              " D - Đài Chính"
                            ]),
                            h("label", { key: "ktt_station_P", style: { marginRight: 10, fontWeight: 600 } }, [
                              h("input", {
                                type: "checkbox",
                                checked: !!legacyLocMap.P_dau && !!legacyLocMap.P_duoi,
                                onChange: function (e) { setLegacyKttStationEnabled("P", !!(e && e.target && e.target.checked)); }
                              }),
                              " P - Đài Phụ"
                            ]),
                            h("label", { key: "ktt_station_T", style: { marginRight: 10, fontWeight: 600 } }, [
                              h("input", {
                                type: "checkbox",
                                checked: !!legacyLocMap.T_dau && !!legacyLocMap.T_duoi,
                                onChange: function (e) { setLegacyKttStationEnabled("T", !!(e && e.target && e.target.checked)); }
                              }),
                              " T - Đài Nam 3"
                            ]),
                            h("label", { key: "ktt_station_B", style: { marginRight: 10, fontWeight: 600 } }, [
                              h("input", {
                                type: "checkbox",
                                checked: !!legacyLocMap.B_dau && !!legacyLocMap.B_duoi,
                                onChange: function (e) { setLegacyKttStationEnabled("B", !!(e && e.target && e.target.checked)); }
                              }),
                              " B - Đài Bắc"
                            ])
                          ]),
                          h(Space, { wrap: true }, ["D_dau", "D_duoi", "P_dau", "P_duoi", "T_dau", "T_duoi", "B_dau", "B_duoi"].map(function (k) {
                            return h("label", { key: k, style: { marginRight: 8 } }, [
                              h("input", {
                                type: "checkbox",
                                checked: !!legacyLocMap[k],
                                onChange: function (e) {
                                  var checked = !!(e && e.target && e.target.checked);
                                  setLegacyLocMap(function (prev) {
                                    var next = Object.assign({}, prev || {});
                                    next[k] = checked;
                                    return next;
                                  });
                                }
                              }),
                              " ",
                              legacyKttFieldLabels[k] || k
                            ]);
                          }))
                        ])
                      ]),
                      h("div", { style: { marginTop: 10 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
                    ])
                  },
                  {
                    key: "nb",
                    label: tt.lgSubTabNb || tt.lgToolNb,
                    children: h("div", { style: { paddingTop: 4 } }, [
                      h(Row, { gutter: [12, 10] }, [
                        h(Col, { xs: 24, md: 6, key: "nb_from" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.fromDate),
                          renderDateField(tu_ngay, function (next) { setTuNgay(next); }, { maxDate: den_ngay })
                        ]),
                        h(Col, { xs: 24, md: 6, key: "nb_to" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
                          renderDateField(den_ngay, function (next) { setDenNgay(next); }, { minDate: tu_ngay })
                        ]),
                        h(Col, { xs: 12, md: 4, key: "nb_he" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgHeThong),
                          h(Select, themedSelectProps({
                            value: legacyHeThong,
                            options: [{ value: 2, label: "Hệ 2 số" }, { value: 3, label: "Hệ 3 số" }],
                            onChange: function (v) { setLegacyHeThong(toNumberSafe(v, 2)); }
                          }))
                        ]),
                        h(Col, { xs: 12, md: 4, key: "nb_group" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.lgNbGroupSize),
                          h(Select, themedSelectProps({
                            value: legacyNbGroupSize || undefined,
                            options: legacyNbGroupSizeOptions,
                            onChange: function (v) { setLegacyNbGroupSize(String(v || "")); }
                          }))
                        ]),
                        h(Col, { xs: 24, md: 8, key: "nb_actions" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.theoKy),
                          h("div", { style: { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "7px 10px", border: "1px solid " + theme.border, borderRadius: 6, background: "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)" } }, [
                            h(Checkbox, { checked: !!legacyNbTheoKy, onChange: function (e) { setLegacyNbTheoKy(!!(e && e.target && e.target.checked)); } }, tt.theoKy),
                            h(Button, { type: "primary", onClick: runLegacyNamBac, loading: loading }, "Xem")
                          ])
                        ])
                      ]),
                      h("div", { style: { marginTop: 10 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
                    ])
                  },
                  {
                    key: "bong",
                    label: "⑤ Bóng",
                    children: h("div", { style: { paddingTop: 4 } }, [
                      h(Row, { gutter: [12, 10], align: "end" }, [
                        h(Col, { xs: 24, md: 6, key: "bong_from" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.fromDate),
                          renderDateField(tu_ngay, function (next) { setTuNgay(next); }, { maxDate: den_ngay })
                        ]),
                        h(Col, { xs: 24, md: 6, key: "bong_to" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
                          renderDateField(den_ngay, function (next) { setDenNgay(next); }, { minDate: tu_ngay })
                        ]),
                        h(Col, { xs: 24, md: 8, key: "bong_variant" }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600 } }, "Biến thể Bóng"),
                          h(Select, themedSelectProps({
                            value: legacyBongVariant,
                            options: LEGACY_BONG_VARIANTS.map(function (item) {
                              return { value: item.value, label: item.label };
                            }),
                            onChange: function (v) { setLegacyBongVariant(String(v || "bong")); }
                          }))
                        ]),
                        h(Col, { xs: 24, md: 4, key: "bong_run", style: { textAlign: "right" } }, [
                          h("div", { style: { marginBottom: 6, fontWeight: 600, visibility: "hidden" } }, "_"),
                          h(Button, { type: "primary", onClick: runLegacyBong, loading: loading }, "Xem")
                        ])
                      ]),
                      h("div", { style: { marginTop: 10 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
                    ])
                  }
                ]
              })
            ])
          }
        ],
        style: { marginTop: 12, marginBottom: 8 }
      }),

      legacyMainTab === "slr" ? h(Card, { key: "cfg", className: "kqxs-sticky-filters", size: "small", title: tt.title, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
        h("div", { key: "slr_filters" }, [
              h(Row, { gutter: [10, 10], className: "kqxs-slr-layout" }, [
                h(Col, { xs: 24, lg: 6, key: "slr_left" }, [
                  h("div", { className: "kqxs-slr-col" }, [
                    h("div", { className: "kqxs-slr-field" }, [h("div", { className: "kqxs-slr-label" }, tt.fromDate), renderDateField(tu_ngay, function (next) { setTuNgay(next); }, { maxDate: den_ngay })]),
                    h("div", { className: "kqxs-slr-field" }, [h("div", { className: "kqxs-slr-label" }, tt.toDate), renderDateField(den_ngay, function (next) { setDenNgay(next); }, { minDate: tu_ngay })]),
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.region),
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
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.color),
                      h(ColorPicker, {
                        value: chon_mau,
                        presets: [{ label: "Gợi ý", colors: ["#f0bb41", "#cc9108", "#ff4d4f", "#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#08979c", "#eb2f96"] }],
                        onChangeComplete: function (color) { setChonMau("#" + color.toHex()); }
                      })
                    ]),
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.weekday),
                      h(Select, themedSelectProps({
                        value: thu_tuan,
                        disabled: true,
                        options: ds_thu.map(function (x) { return { value: x.ma, label: x.ten }; })
                      }))
                    ]),
                    allowUpdateActions ? h(Button, { key: "up", block: true, className: "kqxs-action-btn", onClick: chay_cap_nhat, loading: loading }, tt.btnUpdate) : null
                  ])
                ]),
                h(Col, { xs: 24, lg: 10, key: "slr_mid" }, [
                  h("div", { className: "kqxs-slr-col" }, [
                    h(Row, { gutter: [8, 8] }, [
                      h(Col, { xs: 12, key: "m_tk_type" }, [h("div", { className: "kqxs-slr-label" }, tt.tkType), h(Select, themedSelectProps({ value: loai_tk, options: [{ value: 1, label: tt.tk1 }, { value: 2, label: tt.tk2 }, { value: 3, label: tt.tk3 }], onChange: setLoaiTk }))]),
                      h(Col, { xs: 12, key: "m_search_type" }, [h("div", { className: "kqxs-slr-label" }, tt.searchType), h(Select, themedSelectProps({ value: loai_tim, options: [{ value: 0, label: tt.theoNgay }, { value: 1, label: tt.theoKy }], onChange: setLoaiTim }))]),
                      h(Col, { xs: 12, key: "m_so_ky" }, [h("div", { className: "kqxs-slr-label" }, tt.soKy), h(InputNumber, themedNumberProps({ value: so_ky, onChange: function (v) { setSoKy(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 12, key: "m_lay_so_ky" }, [h("div", { className: "kqxs-slr-label" }, tt.laySoKy), h(InputNumber, themedNumberProps({ value: lay_so_ky, onChange: function (v) { setLaySoKy(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 12, key: "m_dem_le" }, [h("div", { className: "kqxs-slr-label" }, tt.demLe), h(InputNumber, themedNumberProps({ value: dem_be_hon, onChange: function (v) { setDemBeHon(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 12, key: "m_kxh_min" }, [h("div", { className: "kqxs-slr-label" }, tt.kxhMin), h(InputNumber, themedNumberProps({ value: kxh_phai_lonhon, onChange: function (v) { setKxhPhaiLonhon(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 12, key: "m_dem_kq3" }, [h("div", { className: "kqxs-slr-label" }, tt.demKq3Le), h(InputNumber, themedNumberProps({ value: dem_nho_hon, onChange: function (v) { setDemNhoHon(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 24, key: "m_loc_sau_zone" }, [
                        h("div", { className: "kqxs-loc-sau-zone" }, [
                          h(Row, { gutter: [8, 8] }, [
                            h(Col, { xs: 12, key: "m_kxh_tu" }, [h("div", { className: "kqxs-slr-label" }, tt.kxhTu), h(InputNumber, themedNumberProps({ value: kxh_tu, onChange: function (v) { setKxhTu(toNumberSafe(v, 0)); } }))]),
                            h(Col, { xs: 12, key: "m_kxh_den" }, [h("div", { className: "kqxs-slr-label" }, tt.kxhDen), h(InputNumber, themedNumberProps({ value: kxh_den, onChange: function (v) { setKxhDen(toNumberSafe(v, 0)); } }))]),
                            h(Col, { xs: 12, key: "m_loc_sau" }, [h("div", { className: "kqxs-slr-label" }, tt.locSau), h(Switch, { checked: !!kxh_locsau, onChange: setKxhLocSau })])
                          ])
                        ])
                      ])
                    ])
                  ])
                ]),
                h(Col, { xs: 24, lg: 8, key: "slr_right" }, [
                  h("div", { className: "kqxs-slr-col" }, [
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.selectStation),
                      h(Select, themedSelectProps({
                        mode: "multiple",
                        value: ds_dai_chon,
                        options: dsDaiThu.map(function (d) { return { value: String(d.stt), label: d.label || d.ten_dai }; }),
                        onChange: function (vals) { setDsDaiChon(vals || []); }
                      }))
                    ]),
                    h("div", { className: "kqxs-slr-field" }, [h("div", { className: "kqxs-slr-label" }, tt.sapXep), h(Select, themedSelectProps({ value: sap_xep, options: [{ value: 0, label: tt.sxMoi }, { value: 1, label: tt.sxCu }], onChange: setSapXep }))]),
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.selectStationSoChu),
                      h(Select, themedSelectProps({
                        mode: "multiple",
                        value: ds_dai_chon_so_chu,
                        options: dsDaiThu.map(function (d) { return { value: String(d.stt), label: d.label || d.ten_dai }; }),
                        onChange: function (vals) { setDsDaiChonSoChu(vals || []); }
                      }))
                    ]),
                    h("div", { className: "kqxs-slr-field" }, [
                      h("div", { className: "kqxs-slr-label" }, tt.soChu),
                      h(Input, {
                        value: so_chu_input,
                        inputMode: "numeric",
                        onKeyDown: function (e) {
                          var key = e && e.key ? e.key : "";
                          var allow = /[0-9]|Backspace|Delete|Tab|ArrowLeft|ArrowRight|Home|End|Enter|-/.test(key);
                          if (!allow) e.preventDefault();
                        },
                        onChange: function (e) {
                          var raw = e && e.target ? e.target.value : "";
                          setSoChuInput(formatSoChuInput(raw));
                        },
                        placeholder: "- - - - - - - - -"
                      })
                    ]),
                    h(Row, { gutter: [8, 8] }, [
                      h(Col, { xs: 12, key: "r_dem_ge" }, [h("div", { className: "kqxs-slr-label" }, tt.demGe), h(InputNumber, themedNumberProps({ value: dem_lon_hon, onChange: function (v) { setDemLonHon(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 12, key: "r_dem_tnh" }, [h("div", { className: "kqxs-slr-label" }, tt.demToNhoHon), h(InputNumber, themedNumberProps({ value: dem_to_nho_hon, onChange: function (v) { setDemToNhoHon(toNumberSafe(v, 0)); } }))]),
                      h(Col, { xs: 24, key: "r_ls_bat_dau" }, [h("div", { className: "kqxs-slr-label" }, tt.lsBatDau), h(InputNumber, themedNumberProps({ value: ls_bat_dau, onChange: function (v) { setLsBatDau(toNumberSafe(v, 0)); } }))])
                    ])
                  ])
                ])
              ]),

              h("div", { className: "kqxs-slr-actions" }, [
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

              autoUpdateProgressVisible ? h("div", { style: { marginTop: 8 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" })) : null
            ])
            ]) : null,

      h(Card, { key: "tabs", size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
        h("div", { className: "kqxs-tab-shell", style: { position: "relative" } }, [
          h("div", { className: "kqxs-tab-capture-root" },
        legacyMainTab === "slr" && activeAction === "kq"
          ? h("div", null, [
              ds_dai_chon_xem_ket_qua.length
                ? h(Row, { gutter: 12, className: "kqxs-result-row" }, ds_dai_chon_xem_ket_qua.map(function (dai, daiIdx) {
                    var prizeRows = getPrizeRowsForCard(dai);

                    var colSpan = 24;
                    var daiCount = Math.max(1, ds_dai_chon_xem_ket_qua.length);
                    if (daiCount >= 2) colSpan = 12;

                    return h(Col, { xs: 24, md: colSpan, className: "kqxs-result-col", key: String(dai.stt) + "_" + String(dai.ten_dai || "") + "_" + String(dai.ngay || "") + "_" + String(daiIdx) },
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
                ? h(Card, { size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border }, title: tt.kqByChuc }, [
                    h("div", { key: "kq_by_chuc_actions", style: { marginBottom: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } }, [
                      h(Button, {
                        size: "small",
                        onClick: function () { setLegacyKetQuaSelectedRowKeys((xu_ly_ket_qua || []).map(function (r) { return r.id; })); }
                      }, tt.lgThAutoSelectAll || "Chọn hết"),
                      h(Button, {
                        size: "small",
                        onClick: function () { setLegacyKetQuaSelectedRowKeys([]); }
                      }, tt.lgThAutoClearAll || "Bỏ chọn"),
                      h(Button, {
                        size: "small",
                        type: "default",
                        onClick: function () {
                          exportSelectedRowsByConfig({
                            selectedKeys: legacyKetQuaSelectedRowKeys,
                            sourceRows: legacySortedRowsRef.current["ketqua"] || xu_ly_ket_qua,
                            keyGetter: function (row) { return row && row.id; },
                            columns: ketquaColumns,
                            fileName: "kq_by_chuc_selected",
                            sheetName: "KetQuaByChuc"
                          });
                        }
                      }, "💾 Xuất đã chọn"),
                      h("span", { style: { fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacyKetQuaSelectedRowKeys || []).length)
                    ]),
                    h(Table, {
                      rowKey: "id",
                      rowSelection: {
                        type: "checkbox",
                        columnTitle: tt.lgThSelect || "Chọn",
                        columnWidth: 32,
                        selectedRowKeys: legacyKetQuaSelectedRowKeys,
                        onChange: function (keys) { setLegacyKetQuaSelectedRowKeys(keys); }
                      },
                      columns: withMultiSortColumns(ketquaColumns),
                      dataSource: xu_ly_ket_qua,
                      pagination: false,
                      size: "small",
                      scroll: { x: 900 },
                      onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["ketqua"] = extra.currentDataSource; }
                    })
                  ])
                : null
            ])
          : legacyMainTab === "other" && activeAction === "legacy_bong"
            ? h(Card, { size: "small", title: "Bóng - " + getLegacyBongVariantMeta(legacyBongVariant).label, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
                legacyBongSummary
                  ? h("div", { style: { marginBottom: 8, fontSize: 12, color: theme.muted } }, legacyBongSummary)
                  : null,
                legacyBongRows.length
                  ? h("div", { style: { border: "1px solid " + theme.border, borderRadius: 6, padding: 8, marginBottom: 10, background: "color-mix(in srgb, " + theme.cardBg + " 92%, " + theme.pageBg + " 8%)" } }, [
                      (function () {
                        var list = Array.isArray(legacyBongRows) ? legacyBongRows : [];
                        var gridCols = 7;
                        var cardWidth = 150;
                        var gridGap = 8;
                        var gridWidth = gridCols * cardWidth + (gridCols - 1) * gridGap;

                        function renderCard(row, key) {
                          return h("div", {
                            key: key,
                            title: String((row && row.dateLabel) || (row && row.id) || ""),
                            style: {
                              width: cardWidth,
                              minWidth: cardWidth,
                              height: 106,
                              border: "1px solid " + theme.border,
                              borderRadius: 2,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: theme.cardBg,
                              overflow: "hidden"
                            }
                          }, legacyBongCardNode(row));
                        }

                        return h("div", {
                          key: "bong_days_scroll",
                          style: {
                            overflowX: "auto",
                            paddingBottom: 2
                          }
                        }, [
                          h("div", {
                            key: "bong_days_center",
                            style: {
                              width: "fit-content",
                              minWidth: gridWidth,
                              margin: "0 auto"
                            }
                          }, [
                            h("div", {
                              key: "bong_days_grid",
                              style: {
                                display: "grid",
                                gridTemplateColumns: "repeat(" + gridCols + ", " + cardWidth + "px)",
                                justifyContent: "start",
                                gap: gridGap,
                                alignItems: "start"
                              }
                            }, list.map(function (row, idx) {
                              var rowKey = String((row && row.key) || (row && row.id) || idx);
                              return renderCard(row, rowKey);
                            }))
                          ])
                        ]);
                      })()
                    ])
                  : h("div", { style: { marginBottom: 10, color: theme.muted } }, "Chưa có dữ liệu Bóng"),
                legacyBongStatsRows.length
                  ? h("div", { style: { overflowX: "auto" } }, [
                      h("table", { style: { borderCollapse: "collapse", width: "fit-content", margin: "0 auto", minWidth: 760, background: theme.cardBg, fontWeight: 700 } }, [
                        h("tbody", null, legacyBongStatsRows.map(function (row) {
                          return h("tr", { key: row.key }, (row.cells || []).map(function (cell) {
                            return h("td", {
                              key: cell.key,
                              colSpan: cell.colSpan,
                              rowSpan: cell.rowSpan,
                              style: {
                                border: "1px solid " + theme.border,
                                padding: "4px 8px",
                                textAlign: cell.align || "left",
                                whiteSpace: "nowrap",
                                color: theme.text,
                                minWidth: cell.width ? Number(cell.width) : undefined
                              },
                              dangerouslySetInnerHTML: { __html: String(cell.html || "") }
                            });
                          }));
                        }))
                      ])
                    ])
                  : null
              ])
          : legacyMainTab === "other" && activeAction === "legacy_ktt"
            ? h(Card, { size: "small", title: tt.lgToolKtt + " – " + tt.lgHeThong + ": " + legacyHeThong, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
                // Legend màu
                h("div", { style: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" } }, [
                  h("span", { style: { background: KTT_COLORS.D, color: theme.text, padding: "2px 8px", border: "1px solid " + theme.border, fontSize: 12 } }, tt.lgKttLegendD),
                  h("span", { style: { background: KTT_COLORS.P, color: theme.text, padding: "2px 8px", border: "1px solid " + theme.border, fontSize: 12 } }, tt.lgKttLegendP),
                  h("span", { style: { background: KTT_COLORS.T, color: theme.text, padding: "2px 8px", border: "1px solid " + theme.border, fontSize: 12 } }, tt.lgKttLegendT),
                  h("span", { style: { background: KTT_COLORS.B, color: theme.text, padding: "2px 8px", border: "1px solid " + theme.border, fontSize: 12 } }, tt.lgKttLegendB),
                  h("span", { style: { background: kttMatchBg, color: kttMatchClr, padding: "2px 8px", border: "1px solid " + theme.border, fontSize: 12, fontWeight: "bold" } }, tt.lgKttLegendMatch)
                ]),
                (function () {
                  var weekRows = buildLegacyKttWeekRows(legacyKttRows);
                  var weekHeaders = ["CN", "T7", "T6", "T5", "T4", "T3", "T2"];
                  var weekHeaderDow = [0, 6, 5, 4, 3, 2, 1];
                  return h("div", { style: { overflowX: "auto" } }, [
                    h("div", { style: { display: "flex", gap: 6, marginBottom: 6 } }, weekHeaders.map(function (label) {
                      return h("div", {
                        key: "ktt_h_" + label,
                        style: {
                          width: KTT_CARD_WIDTH,
                          textAlign: "center",
                          fontWeight: "bold",
                          fontSize: 13,
                          background: kttDateHeaderBg,
                          color: theme.text,
                          borderRadius: 3,
                          padding: "2px 0"
                        }
                      }, label);
                    })),
                    weekRows.map(function (wk) {
                      var byDow = {};
                      (wk.days || []).forEach(function (day) {
                        byDow[kttWeekdayFromYmd(normalizeLegacyDateYmd(day && day.ID))] = day;
                      });
                      return h("div", { key: wk.key, style: { display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-start" } },
                        weekHeaderDow.map(function (dow) {
                          var day = byDow[dow] || { ID: "", Ngay: "", D_dau: "?", D_duoi: "?", P_dau: "?", P_duoi: "?", T_dau: "?", T_duoi: "?", B_dau: "?", B_so2: "?", B_so3: "?", B_so4: "?", B_duoi: "?" };
                          return h("div", { key: "ktt_d_" + String((day && day.ID) || randomId("ktt_day")), style: { width: KTT_CARD_WIDTH, flex: "0 0 " + KTT_CARD_WIDTH + "px" } }, kttCardNode(day));
                        })
                      );
                    })
                  ]);
                })()
              ])
          : legacyMainTab === "other" && activeAction === "legacy_slr"
            ? h(Card, { size: "small", title: tt.lgToolSlr, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
              legacySlrWeekRows.length ? h("div", { style: { marginBottom: 10 } }, [
                h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 6 } }, "Bảng tuần (CN → T2)"),
                h("div", { style: { marginBottom: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } }, [
                  h(Button, {
                    size: "small",
                    onClick: function () { setLegacySlrWeekSelectedRowKeys((legacySlrWeekRows || []).map(function (r) { return r.key; })); }
                  }, tt.lgThAutoSelectAll || "Chọn hết"),
                  h(Button, {
                    size: "small",
                    onClick: function () { setLegacySlrWeekSelectedRowKeys([]); }
                  }, tt.lgThAutoClearAll || "Bỏ chọn"),
                  h(Button, {
                    size: "small",
                    type: "default",
                    onClick: function () {
                      exportSelectedRowsByConfig({
                        selectedKeys: legacySlrWeekSelectedRowKeys,
                        sourceRows: legacySortedRowsRef.current["slr_week"] || legacySlrWeekRows,
                        keyGetter: function (row) { return row && row.key; },
                        columns: legacySlrWeekColumns,
                        fileName: "legacy_slr_week_selected",
                        sheetName: "SLR_Week"
                      });
                    }
                  }, "💾 Xuất đã chọn"),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacySlrWeekSelectedRowKeys || []).length)
                ]),
                h("div", { style: { maxHeight: 460, overflow: "hidden", border: "1px solid " + theme.border, borderRadius: 6 } }, [
                  h(Table, {
                    rowKey: "key",
                    rowSelection: {
                      type: "checkbox",
                      columnTitle: tt.lgThSelect || "Chọn",
                      columnWidth: 32,
                      selectedRowKeys: legacySlrWeekSelectedRowKeys,
                      onChange: function (keys) { setLegacySlrWeekSelectedRowKeys(keys); }
                    },
                    columns: withMultiSortColumns(legacySlrWeekColumns),
                    dataSource: legacySlrWeekRows,
                    pagination: false,
                    size: "small",
                    scroll: { x: 1240, y: 460 },
                    showSorterTooltip: false,
                    components: legacySlrResizableComponents,
                    onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["slr_week"] = extra.currentDataSource; }
                  })
                ])
              ]) : null,
              legacySlrWeekRows.length ? (function () {
                var sumRows = buildLegacySlrWeekSummaryRows(legacyCdMode, legacySlrWeekRows);
                if (!sumRows.length) return null;
                return h("div", { style: { marginBottom: 10, overflowX: "auto" } }, [
                  h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 6 } }, "Thống kê tuần (tối đa " + LEGACY_SLR_WEEK_SUMMARY_LIMIT + " cột)"),
                  h("table", { style: { borderCollapse: "collapse", minWidth: 760, background: theme.cardBg } }, [
                    h("tbody", null, sumRows.map(function (sr) {
                      return h("tr", { key: "slr_sum_" + sr.key }, [
                        h("td", { style: { border: "1px solid " + theme.border, padding: "4px 8px", fontWeight: 600, whiteSpace: "nowrap", background: "color-mix(in srgb, " + theme.cardBg + " 86%, " + theme.pageBg + " 14%)" } }, sr.label + ":"),
                        (sr.values || []).map(function (v, idx) {
                          var low = Number(v || 0) <= Number(sr.limit || 0);
                          return h("td", {
                            key: sr.key + "_" + idx,
                            style: {
                              border: "1px solid " + theme.border,
                              minWidth: 40,
                              textAlign: "center",
                              padding: "4px 7px",
                              color: low ? theme.error : theme.text,
                              fontWeight: 800,
                              fontSize: 15,
                              lineHeight: "18px"
                            }
                          }, String(Number(v || 0)));
                        })
                      ]);
                    }))
                  ])
                ]);
              })() : null,
              legacySlrAutoRows.length ? h("div", { style: { marginBottom: 10 } }, [
                h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } }, [
                  h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text } }, "Bảng tự động (tách biệt vùng thủ công)"),
                  h(Button, {
                    size: "small",
                    onClick: function () {
                      setLegacySlrAutoSelectedRowKeys((legacySlrAutoFilteredRows || []).map(function (r, idx) {
                        return String((r && r.key) || (String((r && r.queryValue) || "") + "_" + String((r && r.sttFrom) || "") + "_" + String((r && r.sttTo) || "") + "_" + idx));
                      }));
                    }
                  }, tt.lgThAutoSelectAll || "Chọn hết"),
                  h(Button, {
                    size: "small",
                    onClick: function () { setLegacySlrAutoSelectedRowKeys([]); }
                  }, tt.lgThAutoClearAll || "Bỏ chọn"),
                  h(Button, {
                    size: "small",
                    type: "default",
                    onClick: function () {
                      exportSelectedRowsByConfig({
                        selectedKeys: legacySlrAutoSelectedRowKeys,
                        sourceRows: legacySortedRowsRef.current["slr_auto"] || legacySlrAutoFilteredRows,
                        keyGetter: function (row, idx) {
                          return String((row && row.key) || (String((row && row.queryValue) || "") + "_" + String((row && row.sttFrom) || "") + "_" + String((row && row.sttTo) || "") + "_" + idx));
                        },
                        columns: legacySlrAutoColumns,
                        fileName: "legacy_slr_auto_selected",
                        sheetName: "SLR_Auto"
                      });
                    }
                  }, "💾 Xuất đã chọn"),
                  h(Button, {
                    size: "small",
                    onClick: function () { exportLegacySlrAutoRows(); }
                  }, tt.btnExportExcel || "Xuất Excel")
                ]),
                h("div", { style: { marginBottom: 6, fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacySlrAutoSelectedRowKeys || []).length),
                legacySlrAutoSummary ? h("div", { style: { marginBottom: 6, fontSize: 12, color: theme.muted } }, legacySlrAutoSummary) : null,
                h("div", { style: { border: "1px solid " + theme.border, borderRadius: 6 } }, [
                  h(Table, {
                    rowKey: function (r) {
                      return String((r && r.key) || (String((r && r.queryValue) || "") + "_" + String((r && r.sttFrom) || "") + "_" + String((r && r.sttTo) || "")));
                    },
                    rowSelection: {
                      type: "checkbox",
                      columnTitle: tt.lgThSelect || "Chọn",
                      columnWidth: 32,
                      selectedRowKeys: legacySlrAutoSelectedRowKeys,
                      onChange: function (keys) { setLegacySlrAutoSelectedRowKeys(keys); }
                    },
                    columns: withMultiSortColumns(legacySlrAutoColumns),
                    dataSource: legacySlrAutoFilteredRows,
                    pagination: false,
                    size: "small",
                    scroll: { x: 2000 },
                    showSorterTooltip: false,
                    components: legacySlrResizableComponents,
                    onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["slr_auto"] = extra.currentDataSource; }
                  })
                ])
              ]) : null
            ])
          : legacyMainTab === "other" && activeAction === "legacy_nb"
            ? h(Card, { size: "small", title: tt.lgToolNb, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
              h("div", { style: { marginBottom: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } }, [
                h(Button, {
                  size: "small",
                  onClick: function () {
                    setLegacyNbSelectedRowKeys((legacyNbRows || []).map(function (r, idx) { return String((r && r.so) || idx); }));
                  }
                }, tt.lgThAutoSelectAll || "Chọn hết"),
                h(Button, {
                  size: "small",
                  onClick: function () { setLegacyNbSelectedRowKeys([]); }
                }, tt.lgThAutoClearAll || "Bỏ chọn"),
                h(Button, {
                  size: "small",
                  type: "default",
                  onClick: function () {
                    exportSelectedRowsByConfig({
                      selectedKeys: legacyNbSelectedRowKeys,
                      sourceRows: legacySortedRowsRef.current["nb"] || legacyNbRows,
                      keyGetter: function (row, idx) { return String((row && row.so) || idx); },
                      columns: legacyNbColumns,
                      fileName: "legacy_nb_selected",
                      sheetName: "NamBac"
                    });
                  }
                }, "💾 Xuất đã chọn"),
                h("span", { style: { fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacyNbSelectedRowKeys || []).length)
              ]),
              h(Table, {
                rowKey: function (r) { return String((r && r.so) || randomId("legacy_nb")); },
                rowSelection: {
                  type: "checkbox",
                  columnTitle: tt.lgThSelect || "Chọn",
                  columnWidth: 32,
                  selectedRowKeys: legacyNbSelectedRowKeys,
                  onChange: function (keys) { setLegacyNbSelectedRowKeys(keys); }
                },
                columns: withMultiSortColumns(legacyNbColumns),
                dataSource: legacyNbRows,
                pagination: { pageSize: 50, showSizeChanger: true },
                size: "small",
                scroll: { x: 1200 },
                showSorterTooltip: false,
                components: legacyNbResizableComponents,
                onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["nb"] = extra.currentDataSource; }
              })
            ])
          : legacyMainTab === "other" && activeAction === "legacy_th"
            ? h(Card, { size: "small", title: tt.lgToolTh, style: { background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
                h("div", { key: "th-manual", style: { marginBottom: 10, padding: "8px 10px", background: theme.cardBg, color: theme.text, border: "1px solid " + theme.border, borderRadius: 4 } }, [
                  h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 } }, [
                    h("span", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, whiteSpace: "nowrap" } }, tt.lgThManualSetup + ":"),
                    h("span", { style: { fontSize: 12, color: theme.muted, whiteSpace: "nowrap" } }, tt.lgHeThong + ":"),
                    h(Select, themedSelectProps({
                      value: legacyHeThong,
                      style: { width: 90 },
                      options: [{ value: 2, label: "Hệ 2" }, { value: 3, label: "Hệ 3" }],
                      onChange: function (v) { setLegacyHeThong(toNumberSafe(v, 2)); }
                    })),
                    h("span", { style: { fontSize: 12, color: theme.muted, whiteSpace: "nowrap" } }, tt.lgThAutoQueryTypes + ":"),
                    h(Select, themedSelectProps({
                      value: legacyThSelectedQueryTypes[0] || (legacyThQueryTypeOptions[0] && legacyThQueryTypeOptions[0].value),
                      style: { width: 200 },
                      options: (legacyThQueryTypeOptions || []).map(function (item) {
                        return { value: item.value, label: item.text || item.value };
                      }),
                      onChange: function (v) { setLegacyThSelectedQueryTypes(v ? [String(v)] : []); }
                    })),
                    h(Checkbox, {
                      checked: !!legacyThUseGroupSource,
                      style: { color: theme.text },
                      onChange: function (e) { setLegacyThUseGroupSource(!!(e && e.target && e.target.checked)); }
                    }, h("span", { style: { color: theme.text } }, tt.lgThManualGroup + " (Nhom)")),
                    h(Checkbox, {
                      checked: !!legacyThTkEnabled,
                      style: { color: theme.text },
                      onChange: function (e) { setLegacyThTkEnabled(!!(e && e.target && e.target.checked)); }
                    }, h("span", { style: { color: theme.text } }, "TK")),
                    h(Checkbox, {
                      checked: !!legacyThUseTrietSource,
                      style: { color: theme.text },
                      onChange: function (e) { setLegacyThUseTrietSource(!!(e && e.target && e.target.checked)); }
                    }, h("span", { style: { color: theme.text } }, tt.lgThManualTriet)),
                    h(Checkbox, {
                      checked: !!legacyThShowKetQua,
                      style: { color: theme.text },
                      onChange: function (e) { setLegacyThShowKetQua(!!(e && e.target && e.target.checked)); }
                    }, h("span", { style: { color: theme.text } }, tt.lgThManualShowTk))
                  ]),
                  h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 } }, [
                    h("span", { style: { fontSize: 12, color: theme.muted, whiteSpace: "nowrap" } }, tt.lgThManualNumber + ":"),
                    h(Input, {
                      size: "small",
                      value: legacyThSoInput,
                      placeholder: tt.lgThManualPlaceholder,
                      style: { flex: "1 1 260px", maxWidth: 380 },
                      onChange: function (e) {
                        var raw = e && e.target ? e.target.value : "";
                        setLegacyThSoInput(formatSoChuInput(raw));
                      }
                    }),
                    h(Button, {
                      size: "small",
                      type: "primary",
                      disabled: loading || !legacyThManualCanRunNormal,
                      onClick: function () { setLegacyThUseTrietSource(false); runLegacyTongHop(false); }
                    }, tt.lgThManualSearch),
                    h(Button, {
                      size: "small",
                      type: "default",
                      disabled: loading || !legacyThManualCanRunTriet,
                      onClick: function () { setLegacyThUseTrietSource(true); runLegacyTongHop(true); }
                    }, tt.lgThManualSearchTriet),

                    (!legacyThManualCanRunNormal || !legacyThManualCanRunTriet) && legacyThManualSearchHint
                      ? h("span", { style: { fontSize: 11, color: theme.muted } }, legacyThManualSearchHint)
                      : null
                  ]),

                  !legacyThUseApiSource ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", marginBottom: 8, padding: "8px 10px", background: "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)", border: "1px solid " + theme.border, borderRadius: 4 } }, [
                    h("span", { style: { fontSize: 12, color: theme.muted, paddingTop: 6 } }, tt.lgThAutoSourceMode + ":"),
                    h(Select, themedSelectProps({
                      value: legacyThGroupSourceMode,
                      style: { width: 180 },
                      options: [
                        { value: "single", label: tt.lgThAutoSingle },
                        { value: "dao", label: tt.lgThAutoDao },
                        { value: "band", label: tt.lgThAutoBand },
                        { value: "custom", label: tt.lgThAutoCustom }
                      ],
                      onChange: function (v) { setLegacyThGroupSourceMode(String(v || "dao")); }
                    })),
                    legacyThGroupSourceMode === "custom"
                      ? h("textarea", {
                          value: legacyThCustomGroupsText,
                          placeholder: "12 21\n34 43\n56 65",
                          rows: 3,
                          style: { flex: "1 1 280px", minWidth: 280, padding: 8, borderRadius: 6, border: "1px solid " + theme.border, background: theme.inputBg, color: theme.inputText },
                          onChange: function (e) { setLegacyThCustomGroupsText(e && e.target ? e.target.value : ""); }
                        })
                      : null
                  ]) : null,
                  h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, [
                    h(Tag, { style: { background: "color-mix(in srgb, " + theme.primary + " 14%, " + theme.cardBg + " 86%)", color: theme.text, borderColor: theme.border } }, legacyThManualUsesGroupSource ? tt.lgThSourceGroup : (legacyThManualUsesInputSource ? tt.lgThSourceManual : tt.lgThManualFlow)),
                    h(Tag, null, tt.lgThManualInputCount + ": " + legacyThInputItems.length),
                    h(Tag, null, tt.lgThManualGroupCount + ": " + legacyThManualGroupNormalItems.length),
                    h(Tag, null, tt.lgThManualTrietCount + ": " + legacyThManualGroupTrietItems.length),
                    h(Tag, { style: { background: legacyThManualResolvedCount > 0 ? "color-mix(in srgb, " + theme.success + " 18%, " + theme.cardBg + " 82%)" : "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)", color: theme.text, borderColor: theme.border } }, tt.lgThManualRunCount + ": " + legacyThManualResolvedCount)
                  ])
                ]),
                // Config params row
                h("div", { key: "th-cfg", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" } }, [
                  h("span", { style: { fontSize: 12, color: theme.muted } }, tt.lgThKtn + ":"),
                  h(InputNumber, { size: "small", min: 1, max: 200, value: legacyThKtn, onChange: function (v) { setLegacyThKtn(toSinhThreshold(v, 12)); }, style: { width: 64 } }),
                  h("span", { style: { fontSize: 12, color: theme.muted } }, tt.lgThKtd + ":"),
                  h(InputNumber, { size: "small", min: 1, max: 200, value: legacyThKtd, onChange: function (v) { setLegacyThKtd(toSinhThreshold(v, 12)); }, style: { width: 64 } }),
                  h("span", { style: { fontSize: 12, color: theme.muted } }, tt.lgThL2c + ":"),
                  h(InputNumber, { size: "small", min: 1, max: 200, value: legacyThL2c, onChange: function (v) { setLegacyThL2c(toSinhThreshold(v, 12)); }, style: { width: 64 } }),
                  h("span", { style: { fontSize: 12, color: theme.muted } }, tt.lgThTky + ":"),
                  h(InputNumber, { size: "small", min: 1, max: 500, value: legacyThTky, onChange: function (v) { setLegacyThTky(toSinhThreshold(v, 52)); }, style: { width: 72 } }),
                  h("span", { style: { fontSize: 12, color: theme.muted } }, tt.lgThTnd + ":"),
                  h(InputNumber, { size: "small", min: 1, max: 200, value: legacyThTnd, onChange: function (v) { setLegacyThTnd(toSinhThreshold(v, 7)); }, style: { width: 64 } })
                ]),
                h("div", { key: "th-auto-source", style: { marginBottom: 10, padding: "8px 10px", background: "color-mix(in srgb, " + theme.cardBg + " 88%, " + theme.pageBg + " 12%)", border: "1px solid " + theme.border, borderRadius: 4 } }, [
                  h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 8 } }, tt.lgThAutoFlow),
                  h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 } }, [
                    legacyThApiStatus ? h("span", { style: { fontSize: 11, color: theme.muted } }, legacyThApiStatus) : null,
                    h(Tag, { style: { marginInlineEnd: 0, background: "color-mix(in srgb, " + theme.primary + " 14%, " + theme.cardBg + " 86%)", color: theme.text, borderColor: theme.border } }, tt.lgThAutoTaskCount + ": " + (legacyThResolvedQueryTypeItems.length * (legacyThSelectedGroups.length + legacyThSelectedGroupsTriet.length))),
                    h(Button, { size: "small", type: "primary", onClick: runLegacyTongHopFullAuto, disabled: legacyThAutoRunning || legacyThApiLoading || !legacyThResolvedQueryTypeItems.length || (!legacyThSelectedGroups.length && !legacyThSelectedGroupsTriet.length) }, tt.lgThAutoRunSearch),
                    legacyThAutoRunning ? h(Button, { size: "small", danger: true, onClick: stopLegacyTongHopFullAuto }, tt.lgThAutoStop) : null
                  ]),
                  legacyThAutoRunning || legacyThAutoStatus ? h("div", { style: { marginBottom: 8, padding: 8, borderRadius: 4, border: "1px solid " + theme.border, background: "color-mix(in srgb, " + theme.cardBg + " 84%, " + theme.primary + " 16%)" } }, [
                    h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 4 } }, tt.lgThAutoProgress + ":"),
                    h("div", { style: { fontSize: 12, color: theme.text, marginBottom: 6 } }, legacyThAutoStatus || "-"),
                    h(Progress, { percent: legacyThAutoTaskTotal > 0 ? Math.round((legacyThAutoTaskDone / legacyThAutoTaskTotal) * 100) : 0, size: "small", status: legacyThAutoRunning ? "active" : "normal" })
                  ]) : null,
                  h(Row, { gutter: 12 }, [
                    h(Col, { xs: 24, md: 8, key: "th-auto-query" }, [
                      h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 4 } }, tt.lgThAutoQueryTypes + " (" + legacyThResolvedQueryTypeItems.length + "/" + legacyThQueryTypeOptions.length + ")"),
                      h("div", { style: { maxHeight: 220, overflow: "auto", border: "1px solid " + theme.border, borderRadius: 4, background: theme.cardBg, padding: "4px 0" } },
                        legacyThApiLoading
                          ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Đang tải...")
                          : !legacyThQueryTypeOptions.length
                            ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Chưa có dữ liệu")
                            : legacyThQueryTypeOptions.map(function (item, idx) {
                                return h("label", { key: idx, style: { display: "flex", alignItems: "center", fontSize: 12, color: theme.text, padding: "3px 8px", gap: 6, cursor: "pointer" } }, [
                                  h("input", { type: "checkbox", checked: legacyThSelectedQueryTypes.indexOf(item.value) >= 0,
                                    onChange: function (e) { var c = !!(e && e.target && e.target.checked); setLegacyThSelectedQueryTypes(function (p) { return toggleLegacyThSelection(p, item.value, c); }); },
                                    style: { cursor: "pointer", margin: 0 } }),
                                  item.text || item.value
                                ]);
                              })
                      )
                    ]),
                    h(Col, { xs: 24, md: 8, key: "th-auto-group" }, [
                      h("div", { style: { marginBottom: 4 } },
                        h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text } }, tt.lgThAutoGroups + " (" + legacyThSelectedGroups.length + "/" + legacyThGroupOptions.length + ")")
                      ),
                      h("div", { style: { maxHeight: 220, overflow: "auto", border: "1px solid " + theme.border, borderRadius: 4, background: theme.cardBg, padding: "4px 0" } },
                        legacyThApiLoading
                          ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Đang tải...")
                          : !legacyThGroupOptions.length
                            ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Chưa có dữ liệu")
                            : h(Tree, {
                                checkable: true,
                                selectable: true,
                                defaultExpandAll: false,
                                expandedKeys: legacyThExpandedGroupKeys,
                                checkedKeys: getCheckedTreeKeys(legacyThGroupTreeModel, legacyThSelectedGroups, "main"),
                                treeData: legacyThGroupTreeModel.treeData,
                                onExpand: function (keys) { setLegacyThExpandedGroupKeys(Array.isArray(keys) ? keys : []); },
                                onSelect: function (_keys, info) {
                                  if (!info || !info.node || !Array.isArray(info.node.children) || !info.node.children.length) return;
                                  var key = String(info.node.key || "");
                                  setLegacyThExpandedGroupKeys(function (prev) { return toggleExpandedKey(prev, key); });
                                },
                                onCheck: function (checkedKeys) {
                                  var keys = Array.isArray(checkedKeys) ? checkedKeys : ((checkedKeys && checkedKeys.checked) || []);
                                  setLegacyThSelectedGroups(treeKeysToGroupIds(keys, "main"));
                                },
                                showLine: { showLeafIcon: false },
                                style: { padding: "2px 6px", color: theme.text, background: "transparent" }
                              })
                      )
                    ]),
                    h(Col, { xs: 24, md: 8, key: "th-auto-group-triet" }, [
                      h("div", { style: { marginBottom: 4 } },
                        h("div", { style: { fontSize: 12, fontWeight: "bold", color: theme.text } }, (tt.lgThAutoGroupsTriet || "Nhóm Số Triệt") + " (" + legacyThSelectedGroupsTriet.length + "/" + legacyThGroupTrietOptions.length + ")")
                      ),
                      h("div", { style: { maxHeight: 220, overflow: "auto", border: "1px solid " + theme.border, borderRadius: 4, background: "color-mix(in srgb, " + theme.cardBg + " 85%, " + theme.warning + " 15%)", padding: "4px 0" } },
                        legacyThApiLoading
                          ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Đang tải...")
                          : !legacyThGroupTrietOptions.length
                            ? h("div", { style: { padding: 8, fontSize: 12, color: theme.muted } }, "Chưa có dữ liệu")
                            : h(Tree, {
                                checkable: true,
                                selectable: true,
                                defaultExpandAll: false,
                                expandedKeys: legacyThExpandedTrietGroupKeys,
                                checkedKeys: getCheckedTreeKeys(legacyThTrietGroupTreeModel, legacyThSelectedGroupsTriet, "triet"),
                                treeData: legacyThTrietGroupTreeModel.treeData,
                                onExpand: function (keys) { setLegacyThExpandedTrietGroupKeys(Array.isArray(keys) ? keys : []); },
                                onSelect: function (_keys, info) {
                                  if (!info || !info.node || !Array.isArray(info.node.children) || !info.node.children.length) return;
                                  var key = String(info.node.key || "");
                                  setLegacyThExpandedTrietGroupKeys(function (prev) { return toggleExpandedKey(prev, key); });
                                },
                                onCheck: function (checkedKeys) {
                                  var keys = Array.isArray(checkedKeys) ? checkedKeys : ((checkedKeys && checkedKeys.checked) || []);
                                  setLegacyThSelectedGroupsTriet(treeKeysToGroupIds(keys, "triet"));
                                },
                                showLine: { showLeafIcon: false },
                                style: { padding: "2px 6px", color: theme.text, background: "transparent" }
                              })
                      )
                    ])
                  ])
                ]),
                 // Auto filter row
                h("div", { key: "th-auto", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center", padding: "6px 8px", background: "color-mix(in srgb, " + theme.cardBg + " 86%, " + theme.primary + " 14%)", borderRadius: 4, border: "1px solid " + theme.border } }, [
                  h("span", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginRight: 4 } }, "Điều kiện Auto:"),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC1Ngay + ":"),
                  h(Input, { size: "small", placeholder: "N", value: legacyThAutoC1Ngay, onChange: function (e) { setLegacyThAutoC1Ngay(e.target.value); }, style: { width: 55 } }),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC1Ky + ":"),
                  h(Input, { size: "small", placeholder: "N", value: legacyThAutoC1Ky, onChange: function (e) { setLegacyThAutoC1Ky(e.target.value); }, style: { width: 55 } }),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC2NgayCX + ":"),
                  h(Input, { size: "small", placeholder: "5,9,13", value: legacyThAutoC2NgayCX, onChange: function (e) { setLegacyThAutoC2NgayCX(e.target.value); }, style: { width: 90 } }),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC3KyCX + ":"),
                  h(Input, { size: "small", placeholder: "5,9,13", value: legacyThAutoC2KyCX, onChange: function (e) { setLegacyThAutoC2KyCX(e.target.value); }, style: { width: 90 } }),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC4NgayGap + ":"),
                  h(Input, { size: "small", placeholder: "0", value: legacyThAutoC4NgayGap, onChange: function (e) { setLegacyThAutoC4NgayGap(e.target.value); }, style: { width: 55 } }),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, tt.lgThAutoC5KyGap + ":"),
                  h(Input, { size: "small", placeholder: "0", value: legacyThAutoC5KyGap, onChange: function (e) { setLegacyThAutoC5KyGap(e.target.value); }, style: { width: 55 } }),
                  h(Checkbox, { checked: legacyThAutoC6Both, onChange: function (e) { setLegacyThAutoC6Both(e.target.checked); }, style: { fontSize: 11, color: theme.text } }, tt.lgThAutoC6Both)
                ]),
                h("div", { key: "th-kq-mask", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center", padding: "6px 8px", background: "color-mix(in srgb, " + theme.cardBg + " 90%, " + theme.pageBg + " 10%)", borderRadius: 4, border: "1px solid " + theme.border } }, [
                  h("span", { style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginRight: 4 } }, tt.lgThResultSet + ":"),
                  legacyThResultItems.map(function (item) {
                    return h("label", { key: "th-mask-" + item.key, style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: theme.text, marginRight: 4 } }, [
                      h("input", {
                        type: "checkbox",
                        checked: !!legacyThResultMask[item.key],
                        onChange: function (e) {
                          var checked = !!(e && e.target && e.target.checked);
                          setLegacyThResultMask(function (prev) {
                            var next = Object.assign({}, prev || {});
                            next[item.key] = checked;
                            return next;
                          });
                        }
                      }),
                      item.code
                    ]);
                  })
                ]),
                // Main results table
                h("div", { key: "th-main-lbl", style: { fontSize: 12, fontWeight: "bold", color: theme.text, marginBottom: 4 } },
                  tt.lgToolTh + " – " + legacyThRows.length + " " + tt.lgThCountBoSo),
                h(Table, {
                  key: "th-main-table",
                  rowKey: "key",
                  rowSelection: {
                    type: "checkbox",
                    columnTitle: tt.lgThSelect || "Chọn",
                    columnWidth: 32,
                    selectedRowKeys: legacyThManualSelectedRowKeys,
                    onChange: function (keys) { setLegacyThManualSelectedRowKeys(keys); }
                  },
                  columns: withMultiSortColumns(legacyThColumns),
                  dataSource: legacyThRows,
                  pagination: false,
                  size: "small",
                  scroll: { x: 1800, y: 320 },
                  onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["th_main"] = extra.currentDataSource; },
                  rowClassName: function (rec) {
                    if (rec.lauNgay > 0 && rec.ngayCXHT >= rec.lauNgay) return "th-row-overdue-ngay";
                    if (rec.lauKy > 0 && rec.kyCXHT >= rec.lauKy) return "th-row-overdue-ky";
                    return "";
                  }
                }),
                h("div", { key: "th-main-actions", style: { marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, [
                  h(Button, {
                    size: "small",
                    onClick: function () {
                      var selectedMap = {};
                      (legacyThManualSelectedRowKeys || []).forEach(function (k) { selectedMap[String(k)] = true; });
                      var selectedRows = (legacyThRows || []).filter(function (r) { return selectedMap[String(r.key)]; });
                      setLegacyThIntersectManual(buildLegacyThIntersectText(selectedRows));
                    }
                  }, "✓ Chọn"),
                  h(Button, {
                    size: "small",
                    type: "primary",
                    onClick: function () {
                      var selectedMap = {};
                      (legacyThManualSelectedRowKeys || []).forEach(function (k) { selectedMap[String(k)] = true; });
                      var selectedRows = (legacyThRows || []).filter(function (r) { return selectedMap[String(r.key)]; });
                      setLegacyThIntersectManual(buildLegacyThIntersectText(selectedRows));
                    }
                  }, "🔄 Tìm trùng"),
                  h(Button, {
                    size: "small",
                    onClick: function () { setLegacyThManualSelectedRowKeys((legacyThRows || []).map(function (r) { return r.key; })); }
                  }, tt.lgThAutoSelectAll || "Chọn hết"),
                  h(Button, {
                    size: "small",
                    onClick: function () { setLegacyThManualSelectedRowKeys([]); }
                  }, tt.lgThAutoClearAll || "Bỏ chọn"),
                  h(Button, {
                    size: "small",
                    type: "default",
                    onClick: function () { exportLegacyThSelectedRows(false); }
                  }, "💾 Xuất"),
                  h("span", { style: { fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacyThManualSelectedRowKeys || []).length)
                ]),
                legacyThIntersectManual ? h("div", { key: "th-main-intersect", style: { marginTop: 8, padding: "8px 10px", background: "color-mix(in srgb, " + theme.cardBg + " 90%, " + theme.pageBg + " 10%)", border: "1px solid " + theme.border, borderRadius: 4 } }, [
                  h("div", { style: { fontSize: 12, fontWeight: "bold", marginBottom: 4, color: theme.text } }, tt.lgThIntersectTitle + " (Thủ công):"),
                  h("pre", { style: { fontSize: 12, color: theme.text, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, legacyThIntersectManual)
                ]) : null,
                // Auto filter results
                h(Card, { key: "th-auto-result", size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border },
                  title: tt.lgThAutoResult + " – " + legacyThAutoRows.length + " " + tt.lgThCountBoSo }, [
                  h(Table, {
                    key: "th-auto-table",
                    rowKey: "key",
                    rowSelection: {
                      type: "checkbox",
                      columnTitle: tt.lgThSelect || "Chọn",
                      columnWidth: 32,
                      selectedRowKeys: legacyThAutoSelectedRowKeys,
                      onChange: function (keys) { setLegacyThAutoSelectedRowKeys(keys); }
                    },
                    columns: withMultiSortColumns(legacyThColumns),
                    dataSource: legacyThAutoRows,
                    pagination: false,
                    size: "small",
                    scroll: { x: 1800, y: 320 },
                    onChange: function (p, f, s, extra) { if (extra && Array.isArray(extra.currentDataSource)) legacySortedRowsRef.current["th_auto"] = extra.currentDataSource; }
                  }),
                  h("div", { key: "th-auto-actions", style: { marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, [
                      h(Button, {
                        size: "small",
                        onClick: function () {
                          var selectedMap = {};
                          (legacyThAutoSelectedRowKeys || []).forEach(function (k) { selectedMap[String(k)] = true; });
                          var selectedRows = (legacyThAutoRows || []).filter(function (r) { return selectedMap[String(r.key)]; });
                          setLegacyThIntersect(buildLegacyThIntersectText(selectedRows));
                        }
                      }, "✓ Chọn"),
                      h(Button, {
                        size: "small",
                        type: "primary",
                        onClick: function () {
                          var selectedMap = {};
                          (legacyThAutoSelectedRowKeys || []).forEach(function (k) { selectedMap[String(k)] = true; });
                          var selectedRows = (legacyThAutoRows || []).filter(function (r) { return selectedMap[String(r.key)]; });
                          setLegacyThIntersect(buildLegacyThIntersectText(selectedRows));
                        }
                      }, "🔄 Tìm trùng"),
                    h(Button, {
                      size: "small",
                      onClick: function () { setLegacyThAutoSelectedRowKeys((legacyThAutoRows || []).map(function (r) { return r.key; })); }
                    }, tt.lgThAutoSelectAll || "Chọn hết"),
                    h(Button, {
                      size: "small",
                      onClick: function () { setLegacyThAutoSelectedRowKeys([]); }
                    }, tt.lgThAutoClearAll || "Bỏ chọn"),
                    h(Button, {
                      size: "small",
                      type: "default",
                      onClick: function () { exportLegacyThSelectedRows(true); }
                      }, "💾 Xuất Auto"),
                    h("span", { style: { fontSize: 11, color: theme.muted } }, "Đã chọn: " + (legacyThAutoSelectedRowKeys || []).length)
                  ]),
                  legacyThIntersect ? h("div", { key: "th-intersect", style: { marginTop: 8, padding: "8px 10px", background: "color-mix(in srgb, " + theme.cardBg + " 90%, " + theme.pageBg + " 10%)", border: "1px solid " + theme.border, borderRadius: 4 } }, [
                    h("div", { style: { fontSize: 12, fontWeight: "bold", marginBottom: 4, color: theme.text } }, tt.lgThIntersectTitle + " (Tự động):"),
                    h("pre", { style: { fontSize: 12, color: theme.text, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" } }, legacyThIntersect)
                  ]) : null
                ])
              ])
          : legacyMainTab === "slr" && thongkeTabs.length
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

  // ============================================================================
  // HELPER: Create Tree Checkbox Panel
  // ============================================================================
  // Usage from auto_code:
  //   window.TreeCheckboxPanel = createTreeCheckboxPanel;
  //   var panel = createTreeCheckboxPanel(treeData, handleCheck, options);
  // ============================================================================
  
  function createTreeCheckboxPanel(treeDataArg, onCheckCallbackArg, optionsArg) {
    var React = window.React;
    var useState = React.useState;
    var useMemo = React.useMemo;
    
    var treeData = treeDataArg || [];
    var onCheckCallback = typeof onCheckCallbackArg === "function" ? onCheckCallbackArg : function() {};
    var opts = optionsArg || {};
    
    function TreeCheckboxPanel(props) {
      var checkedState = useState(opts.defaultChecked || []);
      var checkedKeys = checkedState[0];
      var setCheckedKeys = checkedState[1];
      
      var expandedState = useState(opts.defaultExpanded || []);
      var expandedKeys = expandedState[0];
      var setExpandedKeys = expandedState[1];

      function handleCheck(selectedKeys, info) {
        setCheckedKeys(selectedKeys);
        onCheckCallback(selectedKeys, info);
      }

      function handleExpand(expandedKeysInfo) {
        setExpandedKeys(expandedKeysInfo);
      }

      function handleClearAll() {
        setCheckedKeys([]);
        onCheckCallback([], null);
      }

      return h(Card, { 
        title: opts.title || "Chọn danh mục",
        style: opts.cardStyle,
        extra: h(Button, { 
          size: "small",
          onClick: handleClearAll,
          style: { marginRight: 8 }
        }, "Xóa tất cả")
      }, [
        h(Tree, {
          key: "tree",
          checkable: true,
          defaultExpandAll: opts.expandAll !== false,
          expandedKeys: expandedKeys,
          onExpand: handleExpand,
          checkedKeys: checkedKeys,
          onCheck: handleCheck,
          treeData: treeData,
          multiple: true,
          disabled: opts.disabled || false,
          style: opts.treeStyle || { padding: "12px 0" }
        }),
        
        h("div", { key: "summary", style: { marginTop: 16, padding: "8px 0", borderTop: "1px solid #f0f0f0" } },
          "Đã chọn: " + checkedKeys.length + " mục"
        )
      ]);
    }
    
    return TreeCheckboxPanel;
  }
  
  // Export to window for use in auto_code
  window.createTreeCheckboxPanel = createTreeCheckboxPanel;

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