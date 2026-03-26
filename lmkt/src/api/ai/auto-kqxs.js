(function autoKqxsReactAntdSelfContained() {
  var ReactRef = window.React;
  var ReactDOMRef = window.ReactDOM;
  var antdRef = window.antd || {};

  if (!ReactRef || !ReactDOMRef || typeof ReactDOMRef.createRoot !== "function") {
    throw new Error("React/ReactDOM is unavailable in dynamic runtime");
  }

  var h = ReactRef.createElement;

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
      pageBg: getCssVar("--ant-color-bg-layout") || (isDark ? "#0f1115" : "#f5f7fb"),
      cardBg: getCssVar("--ant-color-bg-container") || (runtimeTheme.getCardBackground && runtimeTheme.getCardBackground()) || (isDark ? "#141414" : "#ffffff"),
      text: getCssVar("--ant-color-text") || (runtimeTheme.getTextColor && runtimeTheme.getTextColor()) || (isDark ? "rgba(255,255,255,0.88)" : "#1f1f1f"),
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
      title: "KQXS - React Auto Code",
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
      btnUpdateXskt: "Cập nhật XSKT",
      tabResult: "Kết Quả",
      tabStat: "Thống Kê",
      noResult: "Chưa có dữ liệu kết quả",
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
      title: "KQXS - React Auto Code",
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
      btnUpdateXskt: "Update XSKT",
      tabResult: "Results",
      tabStat: "Statistics",
      noResult: "No result data",
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
      title: "KQXS - React Auto Code",
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
      btnUpdateXskt: "更新 XSKT",
      tabResult: "开奖结果",
      tabStat: "统计",
      noResult: "暂无结果数据",
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

  function formatSoChuInput(value) {
    var digits = String(value || "").replace(/\D/g, "").slice(0, 18);
    var pairs = digits.match(/\d{1,2}/g) || [];
    return pairs.join("-");
  }

  function KQXSApp() {
    var useState = ReactRef.useState;
    var useEffect = ReactRef.useEffect;
    var useMemo = ReactRef.useMemo;

    var _a = useState(false), unlock = _a[0], setUnlock = _a[1];
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

    var dsDaiThu = useMemo(function () {
      var out = danh_sach_dai.filter(function (d) {
        return d.mien === mien && d.thu === thu_tuan;
      }).sort(function (a, b) { return Number(a.stt || 0) - Number(b.stt || 0); });
      out = out.map(function (d) {
        var n = Object.assign({}, d);
        n.label = loai_tim === 0 ? (mien + n.stt + " - " + n.ten_dai) : n.ten_dai;
        return n;
      });
      return out;
    }, [danh_sach_dai, mien, thu_tuan, loai_tim]);

    useEffect(function () {
      var params = new URLSearchParams(window.location.search || "");
      setUnlock(Boolean(params.get("unlock")));
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
      if (!danh_sach_dai.length) return;
      lay_ds_dai();
    }, [danh_sach_dai, mien, thu_tuan, loai_tim, tu_ngay, den_ngay]);

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

    function layNguonDaChon() {
      var dsData = (du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || [];
      var out = [];
      ds_dai_chon.forEach(function (sttRaw) {
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

    function layNguonTheoDanhSach(sttList) {
      var dsData = (du_lieu_dai_mien[mien] && du_lieu_dai_mien[mien].data) || [];
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

    function xayDungNguCanhSoChu() {
      if (!(so_chu.length && ds_dai_chon_so_chu.length)) {
        return { allowedDateSet: null, historyRows: [] };
      }

      var denDate = chuyenNgay(den_ngay, "dd/mm/yyyy");
      var sources = layNguonTheoDanhSach(ds_dai_chon_so_chu);
      var dateAnyMap = {};
      var dateHitMap = {};

      sources.forEach(function (dai) {
        var rows = (dai.data || []).slice();
        if (loai_tim === 1) {
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
          var hit = so_chu.some(function (so) { return values.indexOf(String(so)) >= 0; });
          if (hit) dateHitMap[ngay] = true;
        });
      });

      var allowedDateSet = new Set(Object.keys(dateHitMap));
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

      historyRows.sort(function (a, b) { return Number(a.stt) - Number(b.stt); });
      return { allowedDateSet: allowedDateSet, historyRows: historyRows };
    }

    async function lay_ds_dai() {
      setDsDaiChon([]);
      setDsDaiChonSoChu([]);
      setDsDaiChonXemKetQua([]);
      setXuLyKetQua([]);
      setLichSuSoChuRows([]);

      var dsDaiMien = danh_sach_dai.slice();
      var dsDai = dsDaiMien.filter(function (d) { return d.mien === mien; })
        .sort(function (a, b) {
          var ka = String(a.thu || "") + "_" + String(a.stt || "");
          var kb = String(b.thu || "") + "_" + String(b.stt || "");
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });

      if (loai_tim === 1) {
        dsDai = dsDai.filter(function (d) { return d.thu === thu_tuan; });
      }

      var theoDai = {};
      var dataMien = [];
      for (var i = 0; i < dsDai.length; i += 1) {
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

      var next = {};
      next[mien] = { data: dataMien };
      setDuLieuDaiMien(next);
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
        var ymd = Number(dateFormat(chuyenNgay(den_ngay, "dd/mm/yyyy"), "yyyymmdd"));
        var selected = layNguonDaChon();

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

    async function buildThongKeData(isThongKeMoi, allowedDateSet, sourceSttList) {
      var sourceList = Array.isArray(sourceSttList) && sourceSttList.length ? sourceSttList : ds_dai_chon;
      if (!sourceList.length) return [];

      var tu = tu_ngay;
      var den = den_ngay;
      var daysRange = TruNgayRaSoNgay(den, tu, "dd/mm/yyyy");
      if (daysRange < 0) return [];

      var selected = layNguonTheoDanhSach(sourceList);
      var mang_dl_dai = {};
      var maxSoKy = Math.max(1, Number(so_ky || 1));

      for (var i = 0; i < selected.length; i += 1) {
        var dai = selected[i];
        var rows = (dai.data || []).slice();
        if (loai_tim === 0) {
          rows = rows.filter(function (d) { return d.thu === dai.thu; });
        } else {
          rows = rows.filter(function (d) { return d.thu === thu_tuan; });
        }
        rows = rows.filter(function (obj) {
          return chuyenNgay(String(obj.field_ngay || "").trim(), "yyyymmdd") >= chuyenNgay(tu, "dd/mm/yyyy")
            && chuyenNgay(String(obj.field_ngay || "").trim(), "yyyymmdd") < chuyenNgay(den, "dd/mm/yyyy");
        });
        if (allowedDateSet && allowedDateSet.size) {
          rows = rows.filter(function (obj) {
            var ngay = String(obj.field_ngay || "").trim();
            return allowedDateSet.has(ngay);
          });
        }
        rows = locVaSapXepNgay(rows);
        rows = rows.slice(0, maxSoKy);

        if (!mang_dl_dai[dai.stt]) mang_dl_dai[dai.stt] = [];
        mang_dl_dai[dai.stt] = mang_dl_dai[dai.stt].concat(rows);
      }

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
      var outRows = [];

      for (var c = 0; c < mang_cac_dai.length; c += 1) {
        var combo = mang_cac_dai[c];
        var mapSo = {};

        // Khởi tạo đủ 100 số (00–99) như Vue's dsThongKe — đảm bảo bảng chính luôn hiện đủ
        var comboKey = combo.join("_");
        for (var s = 0; s < 100; s += 1) {
          var soStr = String(s).padStart(2, "0");
          var kyInit = [];
          for (var q = 0; q < maxSoKy; q += 1) kyInit.push(0);
          mapSo[soStr] = {
            id: comboKey + "_" + soStr,
            so: soStr,
            to_hop: combo.join(","),
            ky: kyInit,
            tong: 0,
            dem: 0,
            kxh: 0,
            max_kxh: 0,
            thoa_man: false
          };
        }

        combo.forEach(function (stt) {
          var rows = mang_dl_dai[stt] || [];
          rows.forEach(function (r, idx) {
            if (idx >= maxSoKy) return;
            var soArr = getRowTwoDigits(r);
            soArr.forEach(function (so) {
              if (!mapSo[so]) {
                var ky = [];
                for (var q = 0; q < maxSoKy; q += 1) ky.push(0);
                mapSo[so] = {
                  id: combo.join("_") + "_" + so,
                  so: so,
                  to_hop: combo.join(","),
                  ky: ky,
                  tong: 0,
                  dem: 0,
                  kxh: 0,
                  max_kxh: 0,
                  thoa_man: false
                };
              }
              mapSo[so].ky[idx] = Number(mapSo[so].ky[idx] || 0) + 1;
            });
          });
        });

        Object.keys(mapSo).forEach(function (k) {
          var row = mapSo[k];
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

      return outRows;
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
        var soChuCtx = xayDungNguCanhSoChu();
        var useSoChuSource = so_chu.length > 0 && ds_dai_chon_so_chu.length > 0;
        var thongKeSource = useSoChuSource ? ds_dai_chon_so_chu : ds_dai_chon;
        setLichSuSoChuRows(soChuCtx.historyRows || []);
        var rows = await buildThongKeData(false, soChuCtx.allowedDateSet, thongKeSource);
        setThongkeRows(rows);
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
        setLichSuSoChuRows([]);
        var rows = await buildThongKeData(true, null);
        setThongkeRows(rows);
        setProgress(100);
      } catch (e) {
        console.error(e);
        canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
      } finally {
        setLoading(false);
        setTimeout(function () { setProgress(0); }, 600);
      }
    }

    async function cap_nhat(ngay_lay) {
      var ngay_cap_nhat = dateFormat(ngay_lay, "dd-mm-yyyy");
      var link = "https://api.phanmemmottrieu.net/scrape-web";
      if (window.hasOwnProperty("process")) link = "";

      var regions = [
        { mien: "MN", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam/" + ngay_cap_nhat + ".html" },
        { mien: "MT", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-trung/" + ngay_cap_nhat + ".html" },
        { mien: "MB", url: "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/" + ngay_cap_nhat + ".html" }
      ];

      for (var i = 0; i < regions.length; i += 1) {
        var r = regions[i];
        try {
          var html;
          if (link) {
            var resp = await fetch(link, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ link: r.url })
            });
            html = await resp.text();
          } else {
            var raw = await fetch(r.url, { cache: "no-store" });
            html = await raw.text();
          }

          if (html) {
            // Keep crawler behavior but avoid destructive writes when source format changes.
            thongbao("Đã tải dữ liệu " + r.mien + " ngày " + dateFormat(ngay_lay, "dd/mm/yyyy"));
          }
        } catch (err) {
          console.log("Failed to fetch page:", err);
        }
      }
    }

    async function cap_nhat_xskt(ngay_lay) {
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

    function chay_cap_nhat() {
      var soNgay = TruNgayRaSoNgay(den_ngay, tu_ngay, "dd/mm/yyyy");
      var cur = soNgay;
      if (cur < 0) return;

      setLoading(true);
      var timer = setInterval(function () {
        if (cur > 0) {
          var ngay_xo = CongNgay(tu_ngay, cur, "dd/mm/yyyy");
          cap_nhat(chuyenNgay(ngay_xo, "dd/mm/yyyy"));
          cur -= 1;
          var pct = Math.round(((soNgay - cur) / Math.max(soNgay, 1)) * 100);
          setProgress(Math.max(0, Math.min(100, pct)));
        } else {
          clearInterval(timer);
          setLoading(false);
          setTimeout(function () { setProgress(0); }, 800);
        }
      }, 1000);
    }

    function buildKyColumns() {
      var cols = [];
      var totalKy = Math.max(1, Number(so_ky || 1));
      if (Number(sap_xep) === 0) {
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
    ].concat(buildKyColumns());

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
            return h(Tag, { color: "blue" }, txt);
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
          val1: left ? left[valueKey] : "",
          vach1: "",
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
      var maxCot = Math.max(1, Number(lay_so_ky || 1));

      function pickKyVals(src) {
        var vals = [];
        var kyArr = (src && src.ky) || [];
        if (Number(sap_xep) === 0) {
          for (var i = 0; i < kyArr.length; i += 1) {
            var v = Number(kyArr[i] || 0);
            if (v > 0) vals.push(v);
            if (vals.length >= maxCot) break;
          }
        } else {
          for (var j = kyArr.length - 1; j >= 0; j -= 1) {
            var vv = Number(kyArr[j] || 0);
            if (vv > 0) vals.push(vv);
            if (vals.length >= maxCot) break;
          }
        }
        while (vals.length < maxCot) vals.push("");
        return vals;
      }

      function mapOne(src) {
        if (!src) return { so: "", kyVals: new Array(maxCot).fill(""), ket_qua: "", to_mau: false };
        var demVal = Number(src.dem || 0);
        var toMau = Number(dem_be_hon) > 0 && demVal <= Number(dem_be_hon);
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
          vach1: "",
          so2: right.so,
          kq2: right.ket_qua,
          to_mau2: right.to_mau,
          vach: "",
          vach2: ""
        };
        for (var c = 0; c < maxCot; c += 1) {
          rec["c1_" + (c + 1)] = left.kyVals[c];
          rec["c2_" + (c + 1)] = right.kyVals[c];
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
        if (Number(dem_lon_hon) > 0 && so_chu.length > 0) {
          rec["hl" + group] = Number(obj.dem || 0) >= Number(dem_lon_hon || 0);
        } else if (Number(dem_to_nho_hon) > 0) {
          rec["hl" + group] = Number(obj.dem || 0) <= Number(dem_to_nho_hon || 0);
        } else {
          rec["hl" + group] = false;
        }
      });
      return { rows: matrixRows, groupCount: groupCount };
    }

    var thongkeGroups = useMemo(function () {
      var grouped = {};
      (thongkeRows || []).forEach(function (r) {
        var key = String(r.to_hop || "");
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });

      return Object.keys(grouped).sort().map(function (combo) {
        var rows = grouped[combo].slice().sort(function (a, b) {
          return Number(a.so || 0) - Number(b.so || 0);
        });

        var laySoKyRows = [];
        if (Number(lay_so_ky) > 0) {
          laySoKyRows = rows.filter(function (r) { return !!r.has_ky_chot; });
        }

        var kxhRows = Number(kxh_phai_lonhon) > 0
          ? rows.filter(function (r) { return Number(r.kxh) >= Number(kxh_phai_lonhon); })
          : [];

        var demNhoRows = Number(dem_nho_hon) > 0
          ? rows.filter(function (r) { return !r.has_ky_chot && Number(r.dem) <= Number(dem_nho_hon); })
          : [];

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
    }, [thongkeRows, lay_so_ky, dem_be_hon, kxh_phai_lonhon, dem_nho_hon, dem_lon_hon, dem_to_nho_hon, so_chu]);

    function buildLaySoKyColumns() {
      var maxCot = Math.max(1, Number(lay_so_ky || 1));
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
        cols.push({
          title: "",
          dataIndex: "c1_" + i,
          key: "c1_" + i,
          width: 40,
          onCell: function (rec) {
            return rec && rec.to_mau1 ? { className: "to_mau_zone" } : {};
          }
        });
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
      cols.push({ title: "", dataIndex: "vach1", key: "vach1", width: 20, className: "kqxs-vach-col" });
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
        cols.push({
          title: "",
          dataIndex: "c2_" + j,
          key: "c2_" + j,
          width: 40,
          onCell: function (rec) {
            return rec && rec.to_mau2 ? { className: "to_mau_zone" } : {};
          }
        });
      }
      cols.push({ title: "", dataIndex: "vach2", key: "vach2", width: 20, className: "kqxs-vach-col" });
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
      { title: "", dataIndex: "so1", key: "so1", width: 40 },
      { title: "", dataIndex: "vach1", key: "vach1", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "val1", key: "val1", width: 40 },
      { title: "", dataIndex: "vach", key: "vach", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "so2", key: "so2", width: 40 },
      { title: "", dataIndex: "vach2", key: "vach2", width: 20, className: "kqxs-vach-col" },
      { title: "", dataIndex: "val2", key: "val2", width: 40 }
    ];

    var thongkeComboColumns = [
      { title: tt.colTong, dataIndex: "tong", key: "tong", width: 90 },
      { title: tt.colDem, dataIndex: "dem", key: "dem", width: 90 },
      { title: tt.colKxh, dataIndex: "kxh", key: "kxh", width: 90 },
      { title: tt.colMaxKxh, dataIndex: "lich_su", key: "lich_su", width: 110 },
      { title: tt.colSo, dataIndex: "so", key: "so", width: 80 }
    ].concat(buildKyColumns());

    function buildMatrixColumns(groupCount) {
      var cols = [];
      for (var g = 1; g <= groupCount; g += 1) {
        (function (groupIndex) {
        cols.push({
          title: "Số",
          dataIndex: "so" + groupIndex,
          key: "so" + groupIndex,
          width: 70,
          className: groupIndex > 1 ? "matrix_group_start" : "",
          onCell: function (rec) {
            var cls = "";
            if (groupIndex > 1) cls += "matrix_group_start ";
            if (rec && rec["hl" + groupIndex]) cls += "to_mau_zone";
            cls = cls.trim();
            return cls ? { className: cls } : {};
          },
          render: function (v) {
            if (!v) return "";
            return String(v);
          }
        });
        cols.push({
          title: "T",
          dataIndex: "tong" + groupIndex,
          key: "tong" + groupIndex,
          width: 60,
          className: groupIndex > 1 ? "matrix_group_start" : "",
          onCell: function (rec) {
            var cls = "";
            if (groupIndex > 1) cls += "matrix_group_start ";
            if (rec && rec["hl" + groupIndex]) cls += "to_mau_zone";
            cls = cls.trim();
            return cls ? { className: cls } : {};
          }
        });
        cols.push({
          title: "SL",
          dataIndex: "dem" + groupIndex,
          key: "dem" + groupIndex,
          width: 60,
          className: groupIndex > 1 ? "matrix_group_start" : "",
          onCell: function (rec) {
            var cls = "";
            if (groupIndex > 1) cls += "matrix_group_start ";
            if (rec && rec["hl" + groupIndex]) cls += "to_mau_zone";
            cls = cls.trim();
            return cls ? { className: cls } : {};
          }
        });
        cols.push({
          title: "KXH",
          dataIndex: "kxh" + groupIndex,
          key: "kxh" + groupIndex,
          width: 60,
          className: groupIndex > 1 ? "matrix_group_start" : "",
          onCell: function (rec) {
            var cls = "";
            if (groupIndex > 1) cls += "matrix_group_start ";
            if (rec && rec["hl" + groupIndex]) cls += "to_mau_zone";
            cls = cls.trim();
            return cls ? { className: cls } : {};
          }
        });
        })(g);
      }
      return cols;
    }

    function buildLaySoKyTitle(comboLabel) {
      if (Number(sap_xep) === 0) {
        return comboLabel + " 1-" + String(so_ky) + "-" + String(lay_so_ky) + " " + String(thu_tuan || "") + " " + String(den_ngay || "");
      }
      return comboLabel + " " + String(so_ky) + "-1-" + String(lay_so_ky) + " " + String(thu_tuan || "") + " " + String(den_ngay || "");
    }

    function buildThresholdTitle(comboLabel, threshold) {
      if (Number(sap_xep) === 0) {
        return comboLabel + " 1-" + String(so_ky) + "-" + String(threshold);
      }
      return comboLabel + " " + String(so_ky) + "-1-" + String(threshold);
    }

    function buildMainThongKeTitle(comboLabel) {
      if (Number(dem_lon_hon) > 0 && so_chu.length > 0) {
        return comboLabel + "(" + so_chu.join("-") + ")";
      }
      return comboLabel;
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
      var allowKqTabsInThongKe = (Number(lay_so_ky || 0) + Number(dem_be_hon || 0) + Number(kxh_phai_lonhon || 0) + Number(dem_nho_hon || 0) > 0)
        || (Number(dem_lon_hon || 0) > 0 && so_chu.length > 0);

      if (activeAction === "tk" && lichSuSoChuRows.length) {
        items.push({
          key: "lich_su_so_chu",
          label: "Lịch Sử Số Chủ",
          children: h(Card, {
            size: "small",
            style: { background: theme.cardBg, color: theme.text, borderColor: theme.border }
          }, h(Table, {
            rowKey: "id",
            columns: lichSuSoChuColumns,
            dataSource: lichSuSoChuRows,
            pagination: false,
            size: "small",
            scroll: { x: 400 }
          }))
        });
      }

      thongkeGroups.forEach(function (grp) {
        var isComboGroup = String(grp.combo || "").indexOf(",") >= 0;
        var showComboGroup = activeAction === "tkm" || (activeAction === "tk" && allowKqTabsInThongKe);
        if (isComboGroup && !showComboGroup) {
          return;
        }

        var comboDisplay = buildComboDisplay(grp.combo);
        var comboText = comboDisplay.text;
        var comboTenDai = comboDisplay.ten_dai;
        var mainTitle = buildMainThongKeTitle(comboTenDai);
        var kqTitle = String(thu_tuan || "") + " " + String(den_ngay || "") + " " + comboTenDai;

        items.push({
          key: "tk_" + grp.combo,
          label: comboText,
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
                if (activeAction === "tk" && Number(dem_lon_hon) > 0 && so_chu.length > 0 && so_chu.indexOf(String(rec && rec.so || "")) >= 0) return "to_mau";
                return "";
              }
            })
          ))
        });

        // Vue: ở Thống Kê, nếu không có điều kiện KQ thì chỉ có tab chính, không sinh tab KQ
        if (activeAction === "tk" && !allowKqTabsInThongKe) {
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
              return h("b", null, kqTitle);
            }
          }));
        } else {
          var hasMatrix = Number(dem_lon_hon) > 0 && grp.matrixRows.length;
          kqChildren = hasMatrix
            ? h("div", { className: "kqxs-thongke-main" }, h(Table, {
                rowKey: "id",
                columns: buildMatrixColumns(grp.matrixGroupCount),
                dataSource: grp.matrixRows,
                size: "small",
                pagination: false,
                scroll: { x: 1200 },
                title: function () {
                  return h("b", null, kqTitle);
                }
              }))
            : h("div", { className: "kqxs-kq-row" }, [
                Number(lay_so_ky) > 0 && grp.laySoKyRows.length
                  ? h("div", { key: "lsk_" + grp.combo, className: "kqxs-kq-col kqxs-kq-zone" }, h(Table, {
                      rowKey: "id",
                      columns: buildLaySoKyColumns(),
                      dataSource: grp.laySoKyRows,
                      size: "small",
                      pagination: false,
                      bordered: true,
                      scroll: { x: "max-content" },
                      title: function () {
                        return h("b", null, buildLaySoKyTitle(comboTenDai));
                      }
                    }))
                  : null,
                Number(kxh_phai_lonhon) > 0 && grp.kxhPairRows.length
                  ? h("div", { key: "kxh_" + grp.combo, className: "kqxs-kq-col kqxs-kq-zone" }, h(Table, {
                      rowKey: "id",
                      columns: pairColumns,
                      dataSource: grp.kxhPairRows,
                      size: "small",
                      pagination: false,
                      bordered: true,
                      scroll: { x: "max-content" },
                      title: function () {
                        return h("b", null, buildThresholdTitle(comboTenDai, kxh_phai_lonhon));
                      }
                    }))
                  : null,
                Number(dem_nho_hon) > 0 && grp.demNhoPairRows.length
                  ? h("div", { key: "dnh_" + grp.combo, className: "kqxs-kq-col kqxs-kq-zone" }, h(Table, {
                      rowKey: "id",
                      columns: pairColumns,
                      dataSource: grp.demNhoPairRows,
                      size: "small",
                      pagination: false,
                      bordered: true,
                      scroll: { x: "max-content" },
                      title: function () {
                        return h("b", null, buildThresholdTitle(comboTenDai, dem_nho_hon));
                      }
                    }))
                  : null
              ]);
        }

        items.push({
          key: "kq_" + grp.combo,
          label: "KQ " + comboText,
          children: kqChildren
        });
      });

      return items;
    })();

    var firstTabKey = thongkeTabs.length ? thongkeTabs[0].key : "";
    var activeTabKey = (subTab && thongkeTabs.some(function (it) { return it.key === subTab; })) ? subTab : firstTabKey;

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
      + ".kqxs-react-auto .ant-input, .kqxs-react-auto .ant-input-number, .kqxs-react-auto .ant-input-number-input, .kqxs-react-auto .ant-select-selector, .kqxs-react-auto input, .kqxs-react-auto select, .kqxs-react-auto textarea { background: var(--kqxs-input-bg, #fff) !important; color: var(--kqxs-input-text, #1f1f1f) !important; border-color: var(--kqxs-border, #d9d9d9) !important; }"
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
      + ".kqxs-react-auto .kqxs-action-btn { background: #083671de !important; color: #fff !important; border-color: #083671de !important; font-weight: 600 !important; }"
      + ".kqxs-react-auto .kqxs-action-btn:hover, .kqxs-react-auto .kqxs-action-btn:focus { background: #0A1D56 !important; color: #fff !important; border-color: #0A1D56 !important; }"
      + ".kqxs-react-auto .kqxs-action-btn.ant-btn-primary { background: #083671de !important; color: #fff !important; border-color: #083671de !important; }"
      + ".kqxs-react-auto .kqxs-action-btn.ant-btn-primary:hover, .kqxs-react-auto .kqxs-action-btn.ant-btn-primary:focus { background: #0A1D56 !important; color: #fff !important; border-color: #0A1D56 !important; }"
      + ".kqxs-react-auto .kqxs-action-btn-active { background: #cc9108 !important; color: #fff !important; border-color: #cc9108 !important; }"
      + ".kqxs-react-auto .kqxs-action-btn-active:hover, .kqxs-react-auto .kqxs-action-btn-active:focus { background: #b07f08 !important; color: #fff !important; border-color: #b07f08 !important; }"
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
      + ".kqxs-react-auto .kqxs-thongke-combo { border: 1px solid color-mix(in srgb, var(--kqxs-primary, #1677ff) 28%, var(--kqxs-border, #d9d9d9)) !important; box-shadow: 0 4px 14px color-mix(in srgb, var(--kqxs-primary, #1677ff) 10%, transparent); }"
      + ".kqxs-react-auto .kqxs-thongke-combo > .ant-card-head { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 8%, var(--kqxs-card-bg, #fff)) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-main { padding: 4px 0 2px 0; }"
      + ".kqxs-react-auto .kqxs-thongke-main .ant-table-thead > tr > th { font-weight: 700 !important; }"
      + ".kqxs-react-auto .kqxs-thongke-subcard { margin-top: 12px; border-left: 4px solid color-mix(in srgb, var(--kqxs-primary, #1677ff) 52%, var(--kqxs-border, #d9d9d9)) !important; }"
      + ".kqxs-react-auto .kqxs-thongke-subcard > .ant-card-head { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 5%, var(--kqxs-card-bg, #fff)) !important; }"
      + ".kqxs-react-auto .kqxs-vach-col { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 16%, var(--kqxs-card-bg, #fff)) !important; padding: 0 !important; }"
      + ".kqxs-react-auto .kqxs-kq-pane { padding-top: 2px; }"
      + ".kqxs-react-auto .kqxs-kq-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }"
      + ".kqxs-react-auto .kqxs-kq-col { flex: 1 1 calc(33.333% - 8px); min-width: 300px; }"
      + ".kqxs-react-auto .kqxs-kq-zone { border: 1px solid var(--kqxs-border, #d9d9d9); border-radius: 8px; padding: 6px; background: color-mix(in srgb, var(--kqxs-card-bg, #fff) 92%, var(--kqxs-primary, #1677ff)); }"
      + ".kqxs-react-auto .kqxs-kq-zone + .kqxs-kq-zone { box-shadow: inset 2px 0 0 color-mix(in srgb, var(--kqxs-primary, #1677ff) 28%, transparent); }"
      + ".kqxs-react-auto .ant-table-tbody > tr > td.to_mau_zone { background: " + (chon_mau || "#cc9108") + " !important; }"
      + ".kqxs-react-auto .ant-table-thead > tr > th.matrix_group_start, .kqxs-react-auto .ant-table-tbody > tr > td.matrix_group_start { border-left: 3px solid var(--kqxs-border, #d9d9d9) !important; }"
      + ".kqxs-react-auto .kqxs-result-row { align-items: stretch; }"
      + ".kqxs-react-auto .kqxs-result-row > .ant-col { display: flex; }"
      + ".kqxs-react-auto .kqxs-result-col .ant-card { height: 100%; }"
      + ".kqxs-react-auto .kqxs-result-card .ant-card-head { background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 7%, var(--kqxs-card-bg, #fff)) !important; }"
      + ".kqxs-react-auto .kqxs-result-card .ant-card-body { padding: 10px 12px !important; }"
      + ".kqxs-react-auto .kqxs-result-tag { min-width: 32px; text-align: center; margin-bottom: 2px; }"
      // Tô màu hàng thỏa mãn — giống Vue's to_mau class (màu vàng #cc9108)
      + ".kqxs-react-auto .ant-table-tbody > tr.to_mau > td { background: " + (chon_mau || "#cc9108") + " !important; }"
      + ".kqxs-react-auto .ant-table-tbody > tr.to_mau:hover > td { background: " + (chon_mau || "#cc9108") + " !important; }"
      // Tiêu đề nội tuyến của table trong Tổng Hợp
      + ".kqxs-react-auto .ant-table-title { padding: 4px 8px !important; font-weight: 700 !important; background: color-mix(in srgb, var(--kqxs-primary, #1677ff) 6%, var(--kqxs-card-bg, #fff)) !important; }";

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
        "--kqxs-input-bg": theme.inputBg,
        "--kqxs-input-text": theme.inputText,
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
              lay_ds_dai();
            }, { maxDate: den_ngay })
          ]),
          h(Col, { xs: 24, md: 6, key: "c2" }, [
            h("div", { style: { marginBottom: 6, fontWeight: 600 } }, tt.toDate),
            renderDateField(den_ngay, function (next) {
              setDenNgay(next);
              lay_ds_dai();
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
              onChange: function (v) { setMien(v); lay_ds_dai(); }
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
          unlock ? h(Button, { key: "up", className: "kqxs-action-btn", onClick: chay_cap_nhat, loading: loading }, tt.btnUpdate) : null,
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
          h(Button, {
            key: "xsk",
            className: "kqxs-action-btn",
            onClick: function () { return cap_nhat_xskt(chuyenNgay(den_ngay, "dd/mm/yyyy")); },
            loading: loading
          }, tt.btnUpdateXskt)
        ]),

        h("div", { style: { marginTop: 8 } }, h(Progress, { percent: progress, status: loading ? "active" : "normal" }))
      ]),

      h(Card, { key: "tabs", size: "small", style: { marginTop: 12, background: theme.cardBg, color: theme.text, borderColor: theme.border } }, [
        activeAction === "kq"
          ? h("div", null, [
              ds_dai_chon_xem_ket_qua.length
                ? h(Row, { gutter: 12, className: "kqxs-result-row" }, ds_dai_chon_xem_ket_qua.map(function (dai) {
                    function getV(f) { return String((dai.data && dai.data[f]) || "-"); }
                    var mienMb = mien === "MB";
                    var prizeRows = [
                      { label: "Giải ĐB", vals: [getV("field_duoi")], color: "red" },
                      { label: "Giải nhất", vals: [mienMb ? getV("field_so26") : getV("field_so17")], color: "gold" },
                      { label: "Giải nhì", vals: mienMb ? [getV("field_so24"), getV("field_so25")] : [getV("field_so16")] },
                      { label: "Giải ba", vals: mienMb ? [getV("field_so18"), getV("field_so19"), getV("field_so20"), getV("field_so21"), getV("field_so22"), getV("field_so23")] : [getV("field_so15"), getV("field_so14")] },
                      { label: "Giải tư", vals: mienMb ? [getV("field_so14"), getV("field_so15"), getV("field_so16"), getV("field_so17")] : [getV("field_so13"), getV("field_so12"), getV("field_so11"), getV("field_so10"), getV("field_so9"), getV("field_so8"), getV("field_so7")] },
                      { label: "Giải năm", vals: mienMb ? [getV("field_so8"), getV("field_so9"), getV("field_so10"), getV("field_so11"), getV("field_so12"), getV("field_so13")] : [getV("field_so6")] },
                      { label: "Giải sáu", vals: mienMb ? [getV("field_so5"), getV("field_so6"), getV("field_so7")] : [getV("field_so5"), getV("field_so4"), getV("field_so3")] },
                      { label: "Giải bảy", vals: mienMb ? [getV("field_dau"), getV("field_so2"), getV("field_so3"), getV("field_so4")] : [getV("field_so2")] }
                    ];
                    if (!mienMb) prizeRows.push({ label: "Giải 8", vals: [getV("field_dau")] });

                    var colSpan = 24;
                    var daiCount = Math.max(1, ds_dai_chon_xem_ket_qua.length);
                    if (daiCount >= 2) colSpan = 12;

                    return h(Col, { xs: 24, md: colSpan, className: "kqxs-result-col", key: String(dai.stt) },
                      h(Card, { className: "kqxs-result-card", size: "small", title: (dai.ten_dai || "") + " - " + (dai.ngay || "") },
                        prizeRows.map(function (row) {
                          return h(Row, { key: row.label, gutter: 6, style: { marginBottom: 6 } }, [
                            h(Col, { span: 8 }, h("b", null, row.label)),
                            h(Col, { span: 16 }, h(Space, { wrap: true }, row.vals.map(function (v, idx) {
                              return h(Tag, { className: "kqxs-result-tag", key: row.label + "_" + idx, color: row.color || undefined, style: row.color === "red" ? { fontSize: 18 } : null }, v);
                            })))
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
                activeKey: activeTabKey,
                onChange: function (k) { setSubTab(k); },
                size: "small",
                tabPosition: "top",
                items: thongkeTabs
              })
            : h("div", { style: { padding: 24, textAlign: "center", color: theme.muted } }, tt.noResult)
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
