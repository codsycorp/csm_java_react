// npm install javascript-obfuscator -g 
// javascript-obfuscator la_server_source.js --output la_server.js --compact true --self-defending false
const ProxyList = require('free-proxy');
const proxyList = new ProxyList();
// var HTMLParser = require('node-html-parser');
const NodeMediaServer = require('node-media-server');
var path = require("path");
const fetch = require("node-fetch");
global.rootPath = path.join(__dirname, '/');
const { Buffer } = require('buffer');
global.Buffer = Buffer;
var express = require("express");
const compression = require('compression');
// var gzippo = require('gzippo');
const zlib = require('zlib');
const os = require('os');
const child_process = require('child_process');
const { spawn } = require('child_process');

const execPromise=function(command) {
  return new Promise(function(resolve, reject) {
    child_process.exec(command, (error, stdout, stderr) => {
      if (error) {
          reject(error);
          return;
      }
      resolve(stdout.trim());
    });
  });
}
const ifaces = os.networkInterfaces();
const { Readable } = require('stream');
const RECORD_FILE_LOCATION_PATH = global.rootPath + 'csm_datas/public/singstar';
const getLocalIp = () => {
  let localIp = '127.0.0.1'
  Object.keys(ifaces).forEach((ifname) => {
    for (const iface of ifaces[ifname]) {
      // Ignore IPv6 and 127.0.0.1
      if (iface.family !== 'IPv4' || iface.internal !== false) {
        continue
      }
      // Set the local ip to the first IPv4 address found and exit the loop
      localIp = iface.address
      // console.log(localIp);
      return
    }
  })
  return localIp
}
var Sqrl = require('squirrelly');
Sqrl.defaultConfig.autoEscape = false // Assumes that the data is already sanitized
Sqrl.defaultConfig.cache = false
// Sqrl.defaultConfig.rmWhitespace = true

Sqrl.filters.define('reverse', function (str) {
  // For the reverse helper
  var out = ''
  for (var i = str.length - 1; i >= 0; i--) {
    out += str.charAt(i)
  }
  return out || str
});
String.prototype.toChangeCase = function (type) {
  switch (type) {
    case 'upper-first':
      return this.charAt(0).toUpperCase() + this.substr(1).toLowerCase();
    case 'upper-each':
      return this.split(' ').map(word => {
        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
      }).join(' ');
    default:
      throw Error(`In order to get the output pass a value 'upper-first', 'upper-each'`);
  }
}
const sharp = require('sharp');
var bodyParser = require('body-parser'),
  cookieParser = require('cookie-parser'),
  methodOverride = require('method-override'),
  session = require('express-session');
// const os = require('os');
var serialNumber = require('serial-number');
const computerName = os.hostname();
const https = require('https');
var httpProxy = require('http-proxy');
const proxy = httpProxy.createServer();
// const { createProxyMiddleware } = require('http-proxy-middleware');
var mqtt = require('mqtt');
var fs = require('fs');
var app = express();
var cors = require('cors');
const crypto = require('crypto');
let algorithm = 'aes-256-cbc' // you can choose many algorithm from supported openssl
let secret = 'Công Ty Cổ Phần CODSY'
let key = crypto.createHash('sha256').update(String(secret)).digest('base64').substr(0, 32);
var JavaScriptObfuscator = require('javascript-obfuscator');
let users = [];
// const videoUrl = 'https://www.youtube.com/watch?v=a0xV63NZmY8';
const yts = require('yt-search');
const level = require("level-rocksdb");
// Hàm tạo và mở database với level-rocksdb
const dbInstances = {};

global.la_store = function (app_id, table_name) {
  const dbPath = path.join(global.rootPath ,"csm_datas","database", app_id, table_name);
  
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  if (!dbInstances[dbPath]) {
    dbInstances[dbPath] = level(dbPath, {
      cacheSize: 32 * 1024 * 1024, // Giới hạn cache xuống 32MB (giúp giảm RAM)
      compression: false, // Giảm tải CPU khi xử lý dữ liệu
      valueEncoding: "json",
    });
  }

  const db = dbInstances[dbPath];

  function ensureCallback(callback) {
    return typeof callback === "function" ? callback : () => {};
  }

  async function getPrimaryKeys() {
    try {
      return ["_id"]; // Tránh truy vấn indexDB, giảm I/O
    } catch (err) {
      return ["_id"];
    }
  }

  async function createCompositeKey(doc) {
    const primaryKeys = await getPrimaryKeys();
    return primaryKeys.map((key) => encodeURIComponent(doc[key] || "")).join("|");
  }

  function matchQuery(doc, query) {
    try {
      // console.log(doc, query);
      return new Function("obj", `return obj && ${query};`)(doc);
    } catch (error) {
      return false;
    }
  }

  return {
    async findWithPagination({ e_where = "true", take = 100, lastKey = null }, callback) {
      callback = ensureCallback(callback);
      let results = [];
      let totalCount = await this.count(); // <-- thêm dòng này
      let options = {
        keys: true,
        values: true,
      };
    
      if (lastKey !== null) {
        options.gt = lastKey; // greater than last key
      }
    
      try {
        var newLastKey=null;
        for await (const [key, value] of db.iterator(options)) {
          if (e_where === "true" || matchQuery(value, e_where)) {
            results.push(value);
            newLastKey=key;
          }
    
          if (results.length >= take) {
            break; // đủ số lượng rồi thì dừng luôn
          }
        }
        // console.log(newLastKey);
        callback(null, {
          rows: results,
          totalCount,
          nextCursor: newLastKey,
        });
      } catch (err) {
        callback(err, {
          rows: [],
          totalCount: 0,
          nextCursor: null,
        });
      }
    },

    async find(query, callback) {
      callback = ensureCallback(callback);
      let results = [];
      let totalCount = 0;
    
      try {
        // Kiểm tra xem có meta_totalCount không, nếu không có thì tính lại
        try {
          totalCount = await db.get("__meta_totalCount");
        } catch (err) {
          // Nếu chưa có meta_totalCount, tính lại và lưu vào db
          for await (const _ of db.iterator({ keys: true, values: false })) {
            totalCount++;
          }
          // Cập nhật tổng số dòng vào meta_totalCount
          await db.put("__meta_totalCount", totalCount);
        }
    
        // Lọc kết quả dựa trên query
        for await (const [key, value] of db.iterator()) {
          if (matchQuery(value, query)) {
            results.push(value);
          }
        }
    
        callback(null,results);
      } catch (err) {
        callback(err, []);
      }
    },

    async findOne(query, callback) {
      callback = ensureCallback(callback);

      try {
        for await (const [key, value] of db.iterator()) {
          if (matchQuery(value, query)) {
            callback(null, value);
            return;
          }
        }
        callback(null, null);
      } catch (err) {
        callback(err, null);
      }
    },
    async insert(docs, callback) {
      callback = ensureCallback(callback);
      if (!Array.isArray(docs)) docs = [docs];
    
      try {
        let batchOps = [];
        for (const doc of docs) {
          doc._id = doc._id || `doc:${Date.now()}:${Math.random().toString(16).slice(2)}`;
          const compositeKey = await createCompositeKey(doc);
          batchOps.push({ type: "put", key: compositeKey, value: doc });
        }
    
        // Get current count
        let currentCount = 0;
        try {
          currentCount = await db.get("__meta_totalCount");
        } catch (_) {}
    
        // Thêm các dữ liệu vào db
        await db.batch(batchOps);
    
        // Cập nhật tổng số dòng (meta)
        await db.put("__meta_totalCount", currentCount + docs.length);
    
        callback(null, docs);
      } catch (err) {
        callback(err);
      }
    },
    async update(updateData, query, callback) {
      callback = ensureCallback(callback);
      let batchOps = [];
      let updatedCount = 0;

      try {
        for await (const [key, value] of db.iterator()) {
          if (matchQuery(value, query)) {
            Object.assign(value, updateData);
            batchOps.push({ type: "put", key, value });
            updatedCount++;
          }
        }

        if (batchOps.length) await db.batch(batchOps);
        callback(null, updatedCount);
      } catch (err) {
        callback(err, 0);
      }
    },

    async remove(query, callback) {
      callback = ensureCallback(callback);
      let batchOps = [];
      let removedCount = 0;
    
      try {
        for await (const [key, value] of db.iterator()) {
          if (matchQuery(value, query)) {
            batchOps.push({ type: "del", key });
            removedCount++;
          }
        }
    
        if (batchOps.length) {
          // Giảm tổng số dòng khi xóa
          let currentCount = 0;
          try {
            currentCount = await db.get("__meta_totalCount");
          } catch (_) {}
    
          await db.put("__meta_totalCount", currentCount - removedCount);
    
          await db.batch(batchOps);
        }
    
        callback(null, removedCount);
      } catch (err) {
        callback(err, 0);
      }
    },

    async count() {
      try {
        return await db.get("__meta_totalCount");
      } catch (e) {
        return 0;
      }
    }
  };
};


// 🔄 Đóng tất cả DB khi thoát ứng dụng
process.on("SIGINT", async () => {
  console.log("🛑 Đang đóng tất cả database...");
  for (const path in dbInstances) {
      await dbInstances[path].close();
  }
  console.log("✅ Đã đóng tất cả database.");
  process.exit();
});

//Định nghĩa Router
global.strtr = function (str, from, to) {
  var fr = '',
    i = 0,
    j = 0,
    lenStr = 0,
    lenFrom = 0,
    tmpStrictForIn = false,
    fromTypeStr = '',
    toTypeStr = '',

    istr = '';
  var tmpFrom = [];
  var tmpTo = [];
  var ret = '';
  var match = false;
  // Received replace_pairs?
  // Convert to normal from->to chars
  if (typeof from === 'object') {
    // Not thread-safe; temporarily set to true
    tmpStrictForIn = this.ini_set('phpjs.strictForIn', false);
    from = this.krsort(from);
    this.ini_set('phpjs.strictForIn', tmpStrictForIn);
    for (fr in from) {
      if (from.hasOwnProperty(fr)) {
        tmpFrom.push(fr);
        tmpTo.push(from[fr]);
      }
    }
    from = tmpFrom;
    to = tmpTo;
  }
  // Walk through subject and replace chars when needed
  lenStr = str.length;
  lenFrom = from.length;
  fromTypeStr = typeof from === 'string';
  toTypeStr = typeof to === 'string';
  for (i = 0; i < lenStr; i++) {
    match = false;
    if (fromTypeStr) {
      istr = str.charAt(i);
      for (j = 0; j < lenFrom; j++) {
        if (istr == from.charAt(j)) {
          match = true;
          break;
        }
      }
    }
    else {
      for (j = 0; j < lenFrom; j++) {
        if (str.substr(i, from[j].length) == from[j]) {
          match = true;
          // Fast forward
          i = (i + from[j].length) - 1;
          break;
        }
      }
    }
    if (match) {
      ret += toTypeStr ? to.charAt(j) : to[j];
    }
    else {
      ret += str.charAt(i);
    }
  }
  return ret;
};
global.Base64 = {
  _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  encode: function (e) {
    var t = "";
    var n, r, i, s, o, u, a;
    var f = 0;
    e = global.Base64._utf8_encode(e);
    while (f < e.length) {
      n = e.charCodeAt(f++);
      r = e.charCodeAt(f++);
      i = e.charCodeAt(f++);
      s = n >> 2;
      o = (n & 3) << 4 | r >> 4;
      u = (r & 15) << 2 | i >> 6;
      a = i & 63;
      if (isNaN(r)) u = a = 64;
      else if (isNaN(i)) a = 64;
      t = t + this._keyStr.charAt(s)
        + this._keyStr.charAt(o)
        + this._keyStr.charAt(u)
        + this._keyStr.charAt(a);
    }
    return t;
  },
  decode: function (e) {
    var t = "";
    var n, r, i;
    var s, o, u, a;
    var f = 0;
    e = e.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    while (f < e.length) {
      s = this._keyStr.indexOf(e.charAt(f++));
      o = this._keyStr.indexOf(e.charAt(f++));
      u = this._keyStr.indexOf(e.charAt(f++));
      a = this._keyStr.indexOf(e.charAt(f++));
      n = s << 2 | o >> 4;
      r = (o & 15) << 4 | u >> 2;
      i = (u & 3) << 6 | a;
      t = t + String.fromCharCode(n);
      if (u != 64) t = t + String.fromCharCode(r);
      if (a != 64) t = t + String.fromCharCode(i);
    }
    t = global.Base64._utf8_decode(t);
    return t;
  },
  _utf8_encode: function (e) {
    e = e.replace(/\r\n/g, "\n");
    var t = "";
    for (var n = 0; n < e.length; n++) {
      var r = e.charCodeAt(n);
      if (r < 128) {
        t += String.fromCharCode(r);
      }
      else if (r > 127 && r < 2048) {
        t += String.fromCharCode(r >> 6 | 192);
        t += String.fromCharCode(r & 63 | 128);
      }
      else {
        t += String.fromCharCode(r >> 12 | 224);
        t += String.fromCharCode(r >> 6 & 63 | 128);
        t += String.fromCharCode(r & 63 | 128);
      }
    }
    return t;
  },
  _utf8_decode: function (e) {
    var t = "";
    var n = 0;
    var r = c1 = c2 = 0;
    while (n < e.length) {
      r = e.charCodeAt(n);
      if (r < 128) {
        t += String.fromCharCode(r);
        n++;
      }
      else if (r > 191 && r < 224) {
        c2 = e.charCodeAt(n + 1);
        t += String.fromCharCode((r & 31) << 6 | c2 & 63);
        n += 2;
      }
      else {
        c2 = e.charCodeAt(n + 1);
        c3 = e.charCodeAt(n + 2);
        t += String.fromCharCode((r & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
        n += 3;
      };
    }
    return t;
  }
};
var dateFormat = function () {
  var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
    timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
    timezoneClip = /[^-+\dA-Z]/g,
    pad = function (val, len) {
      val = String(val);
      len = len || 2;
      while (val.length < len) val = "0" + val;
      return val;
    };
  // Regexes and supporting functions are cached through closure
  return function (date, mask, utc) {
    try {
      var dF = dateFormat;
      // You can't provide utc if you skip other args (use the "UTC:" mask prefix)
      if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
        mask = date;
        date = undefined;
      }
      // Passing date through Date applies Date.parse, if necessary
      date = date ? new Date(date) : new Date;
      if (isNaN(date)) throw SyntaxError("invalid date");
      mask = String(dF.masks[mask] || mask || dF.masks["default"]);
      // Allow setting the utc argument via the mask
      if (mask.slice(0, 4) == "UTC:") {
        mask = mask.slice(4);
        utc = true;
      }
      var _ = utc ? "getUTC" : "get",
        d = date[_ + "Date"](),
        D = date[_ + "Day"](),
        m = date[_ + "Month"](),
        y = date[_ + "FullYear"](),
        H = date[_ + "Hours"](),
        M = date[_ + "Minutes"](),
        s = date[_ + "Seconds"](),
        L = date[_ + "Milliseconds"](),
        o = utc ? 0 : date.getTimezoneOffset(),
        flags = {
          d: d,
          dd: pad(d),
          ddd: dF.i18n.dayNames[D],
          dddd: dF.i18n.dayNames[D + 7],
          m: m + 1,
          mm: pad(m + 1),
          mmm: dF.i18n.monthNames[m],
          mmmm: dF.i18n.monthNames[m + 12],
          yy: String(y).slice(2),
          yyyy: y,
          h: H % 12 || 12,
          hh: pad(H % 12 || 12),
          H: H,
          HH: pad(H),
          M: M,
          MM: pad(M),
          s: s,
          ss: pad(s),
          l: pad(L, 3),
          L: pad(L > 99 ? Math.round(L / 10) : L),
          t: H < 12 ? "a" : "p",
          tt: H < 12 ? "am" : "pm",
          T: H < 12 ? "A" : "P",
          TT: H < 12 ? "AM" : "PM",
          Z: utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
          o: (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
          S: ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
        };
      return mask.replace(token, function ($0) {
        return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
      });
    }
    catch (ex) {
      return "";
    }
  };
}
  ();
// Some common format strings
dateFormat.masks = {
  "default": "ddd mmm dd yyyy HH:MM:ss",
  shortDate: "m/d/yy",
  mediumDate: "mmm d, yyyy",
  longDate: "mmmm d, yyyy",
  fullDate: "dddd, mmmm d, yyyy",
  shortTime: "h:MM TT",
  mediumTime: "h:MM:ss TT",
  longTime: "h:MM:ss TT Z",
  isoDate: "yyyy-mm-dd",
  isoTime: "HH:MM:ss",
  isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
  isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};
// Internationalization strings
dateFormat.i18n = {
  dayNames: [
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ],
  monthNames: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
  ]
};
// For convenience...
Date.prototype.format = function (mask, utc) {
  return dateFormat(this, mask, utc);
};
function chuyenNgay(st) {
  try {
    var pattern = /(\d{2})\/(\d{2})\/(\d{4})/;
    return new Date(st.replace(pattern, '$3/$2/$1'));
    //      return dateFormat(dt,"dd/mm/yyyy");
  }
  catch (ex) {
    return false;
  }
}
function TruNgayRaSoNgay(tu_ngay, den_ngay) {
  var utcThis = chuyenNgay(tu_ngay);
  var utcOther = chuyenNgay(den_ngay);
  var factor = 24 * 60 * 60 * 1000;
  return (utcThis - utcOther) / factor;
}
function CongNgay(strngay, so_cong_vao) {
  var ngay = chuyenNgay(strngay);
  var factor = 24 * 60 * 60 * 1000;
  return dateFormat((new Date(ngay.getTime() + so_cong_vao * factor)), "dd/mm/yyyy");
}
function chuyenNgayGio(st) {
  try {
    var pattern = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/;
    return new Date(st.replace(pattern, '$3/$2/$1 $4:$5'));
    //      return dateFormat(dt,"dd/mm/yyyy");
  }
  catch (ex) {
    return false;
  }
}
function CongGio(strngay, so_gio_cong_vao) {
  var ngay = chuyenNgayGio(strngay);
  var factor = 60 * 60 * 1000;
  //  console.log(new Date(ngay.getTime() + so_gio_cong_vao * factor));
  return dateFormat((new Date(ngay.getTime() + so_gio_cong_vao * factor)), "dd/mm/yyyy HH:MM");
}
function CongPhut(strngay, so_phut_cong_vao) {
  var ngay = chuyenNgayGio(strngay);
  var factor = 60 * 60 * 1000;
  //  console.log(new Date(ngay.getTime() + so_gio_cong_vao * factor));
  return dateFormat((new Date(ngay.getTime() + (so_phut_cong_vao / 60) * factor)), "dd/mm/yyyy HH:MM");
}
String.prototype.trim = function () {
  return this.replace(/^\s+|\s+$/g, "");
};
function la_decrypt(e_code) {
  return global.Base64.decode(global.strtr(e_code, global.phone + global.writeby, global.writeby + global.phone));
}
function CheckRouterName(strCode) {
  var r_name = false;
  var truong_tim = strCode.match(/\/\*\*\*\*\*\((.*?)\)\*\*\*\*\*\//g);
  if (truong_tim != null)
    for (const [key, value] of Object.entries(truong_tim))
      r_name = value.replace('/*****(', "").replace(')*****/', "");
  if (r_name)
    if (r_name.indexOf(".") !== -1)
      r_name = false;
  return r_name;
}
function CheckRouterPops(strCode) {
  var r_name = false;
  var truong_tim = strCode.match(/\/\*\*\*\((.*?)\)\*\*\*\//g);
  if (truong_tim != null)
    for (const [key, value] of Object.entries(truong_tim))
      r_name = value.replace('/***(', "").replace(')***/', "");
  if (r_name)
    if (r_name.indexOf(".") !== -1)
      r_name = false;
  return r_name;
}
function findLevel_Component(V_Codes, strComCode, arrLevelCom, lvl, isVue) {
  if (isVue) {
    lvl++;
    var findCom = strComCode.replace(/\n/g, "").replace(/ /g, "").match(/components:\{(.*?)\}/g);
    if (findCom)
      if (findCom.length > 0) {
        var strCom = [];
        strCom = findCom[0].replace("components:{", "").replace("}", "").split(/\,/g).filter((o) => o !== "");
        strCom.forEach(function (v) {
          var aCom = v.split(":");
          if (aCom.length === 2) {
            var comV = V_Codes.find(function (c) {
              return c.id.toLowerCase() === aCom[1].toLowerCase()
            });
            if (comV) {
              var idx = arrLevelCom.findIndex(function (c) {
                return c.id.toLowerCase() === aCom[1].toLowerCase()
              });
              if (idx !== -1)
                arrLevelCom[idx] = Object.assign({
                  lvl: arrLevelCom[idx].lvl + 1
                }, comV);
              else
                arrLevelCom.push(Object.assign({ lvl: 1 }, comV));
              arrLevelCom = findLevel_Component(V_Codes, comV.p_code, arrLevelCom, lvl, isVue);
            }
          }
        });
      }
  }
  else {
    V_Codes.forEach(function (v) {
      if (strComCode.match(new RegExp('<' + v.id, 'g')) || strComCode.match(new RegExp('{' + v.id, 'g'))) {
        var idx = arrLevelCom.findIndex(c => c.id === v.id);
        if (idx !== -1)
          arrLevelCom[idx] = Object.assign({
            lvl: arrLevelCom[idx].lvl + 1
          }, v);
        else
          arrLevelCom.push(Object.assign({
            lvl: 1
          }, v));
        arrLevelCom = findLevel_Component(V_Codes, v.p_code, arrLevelCom, lvl, isVue);
      }
    });
  }
  return arrLevelCom;
}
function createStructVuejs(app_token, app_token_base, res) {
  if (!global.la_DBtables['dbsys/sys_autos'])
    global.la_DBtables['dbsys/sys_autos'] = new global.la_store('dbsys','sys_autos');
  if (!global.la_DBtables[app_token_base.toLowerCase() + '/index'])
    global.la_DBtables[app_token_base.toLowerCase() + '/index'] = new global.la_store(app_token_base.toLowerCase(),'index');
  return global.la_DBtables['dbsys/sys_autos'].find("1*obj.p_type===0 && (obj.id.toLowerCase().startsWith('"+app_token.toLowerCase()+"_') || obj.id.toLowerCase() === '"+app_token.toLowerCase()+"')", (err, findApCodes) => {
    if (findApCodes) {
      var objDB = JSON.parse(JSON.stringify(findApCodes));
      var C_Codes = [], R_Codes = [], arrLevelCom = [], strCode;
      var routerV = [], MainPage = '';
      var jsCodeIndex = objDB.find(function (p) {
        return p.id.toLowerCase() === app_token.toLowerCase();
      });
      if (jsCodeIndex)
        jsCodeIndex = la_decrypt(jsCodeIndex.p_code);
      objDB.filter(function (p) {
        return p.id.toLowerCase() !== app_token.toLowerCase();
      }).forEach((comp) => {
        var component_code = la_decrypt(comp.p_code);
        comp.p_code = component_code;
        var r_name = CheckRouterName(component_code);
        if (r_name && !R_Codes.find(c => c.id === comp.id)) {
          if (r_name.toLowerCase() === "login")
            MainPage = component_code;
          if (r_name.toLowerCase() === "main") {
            MainPage = component_code;
            routerV.push({ path: '*', name: "main", component: component_code, id: comp.id.toLowerCase(), props: true, props: true });
          }
          else if (r_name.toLowerCase() === "home")
            routerV.push({ path: '', name: "home", component: component_code, id: comp.id.toLowerCase(), props: true, props: true });
          else
            routerV.push({ path: '/' + r_name.toLowerCase(), name: r_name.toLowerCase(), component: component_code, id: comp.id.toLowerCase(), props: true });
          R_Codes.push(comp);
        }
        else if (!C_Codes.find(c => c.id === comp.id))
          C_Codes.push(comp);
      });
      var A_Code = R_Codes.concat(C_Codes);
      A_Code.forEach((comp) => {
        arrLevelCom = findLevel_Component(A_Code, comp.p_code, arrLevelCom, 0, true);
      });
      C_Codes = arrLevelCom.sort((a, b) => parseFloat(b.lvl) - parseFloat(a.lvl));
      var strVCom = '';
      C_Codes.forEach((comp) => {
        strVCom += 'const ' + comp.id.toLowerCase() + '=' + comp.p_code + ';\n';
      });
      var R_routerV = "";
      // console.log(routerV,C_Codes)
      routerV.forEach((router) => {
        R_routerV += '{path:"' + router.path.toLowerCase() + '",name:"' + router.name.toLowerCase() + '",component:' + router.component + ', props: true},';
        if (router.path.toLowerCase() !== "*")
          strVCom += 'const ' + router.id.toLowerCase() + '=' + router.component + ';\n';
      });
      if (R_routerV !== "" && MainPage !== "" && jsCodeIndex) {
        strVCom = jsCodeIndex + strVCom;
        strVCom += '\n const router = new VueRouter({mode:"abstract",routes: [' + R_routerV + ']}); \n new Vue(Object.assign(' + MainPage + ',{router:router})).$mount("#la_apps");\n';
        var obfuscationResult = JavaScriptObfuscator.obfuscate(strVCom);
        strVCom = global.Base64.encode(obfuscationResult.getObfuscatedCode());
        var idStruct = "web";
        if (app_token.toLowerCase() !== app_token_base.toLowerCase())
          idStruct = "app";
        return global.la_DBtables[app_token_base.toLowerCase() + '/index'].update({ id: idStruct, struct: strVCom }, "obj.id==='"+idStruct+"'", function (err, numReplaced, upsert) {
          // console.log(err, numReplaced, upsert);
          if (err)
            return res.end(err);
          else
            return res.end("Đã tạo cấu trúc thành công");
        });
      }
      else
        return res.end("Không thể tạo cấu trúc");
    }
    else
      return res.end("Không thể tạo cấu trúc");
  });
}
// Hàm xử lý lỗi
function handleError(err, msg, fn) {
  console.error("❌ Lỗi khi cập nhật:", err.message);
  msg["status"] = false;
  if (fn) fn(msg);
}

// Hàm xử lý thành công
function handleSuccess(msg, numReplaced, fn) {
  if (numReplaced === 0) msg.command = "create";
  else if (numReplaced > 0) msg.command = "update";
  
  msg["status"] = true;
  msg["data_row"] = msg.obj_update;

  // console.log("✅ Thành công:", msg.command, "Số bản ghi cập nhật:", numReplaced);
  if (fn) fn(msg);
  global.la_socket.emit('la_obj_updates', msg);
}  
function la_obj_tables(msg, fn) {
  try {
    if (msg.hasOwnProperty("e_where")) {
      if (msg.e_where === null)
        msg.e_where = "false";
      else
        msg.e_where = msg.e_where;
    }
    else
      msg.e_where = "false";
    var tblname = msg.obj_name.replace(/#dbsys#/g, '');
    if (!global.la_DBtables[msg.app_id + '/' + tblname])
      global.la_DBtables[msg.app_id + '/' + tblname] = global.la_store(msg.app_id ,tblname);
    if (!global.la_DBtables[msg.app_id + '/index'])
      global.la_DBtables[msg.app_id + '/index'] = global.la_store(msg.app_id,'index');
    if (tblname === "index") {
      msg["fieldsPK"] = ["id"];
      msg["fields"] = { 0: "id", 1: "struct" };
      msg["rows"] = [];
      return global.la_DBtables[msg.app_id + '/' + tblname].find(msg.e_where, (errT, resultsTBL) => {
        if (errT) {
          if (fn)
            return fn({ "app_id": msg.app_id, "error": errT.message, "data_send": msg });
          return io.to(socket.id).emit('la_show_error', { "app_id": msg.app_id, "error": errT.message, "data_send": msg });
        }
        if (resultsTBL) {
          delete msg["obj_name"];
          msg["id"] = tblname;
          msg.rows = resultsTBL;
        }
        if (fn)
          return fn(msg);
        else
          return io.to(socket.id).emit('la_obj_tables', msg);
      });
    }
    else
      return global.la_DBtables[msg.app_id + '/index'].findOne("obj.id==='"+tblname+"'", (err, findStruct) => {
        if (findStruct) {
          msg["fieldsPK"] = findStruct.struct.fieldsPK;
          msg["fields"] = findStruct.struct.fields;
          msg["rows"] = [];
          // console.log("🔍 Kiểm tra bảng với điều kiện:", msg);
          if(msg.hasOwnProperty("take"))
            return global.la_DBtables[msg.app_id + '/' + tblname].findWithPagination({ e_where: msg.e_where, take: msg.take, lastKey: msg.lastkey}, (errT, resultsTBL) => {
              if (errT) {
                msg["totalCount"] = 0;
                if (fn)
                  return fn({ "app_id": msg.app_id, "error": errT.message, "data_send": msg });
                return io.to(socket.id).emit('la_show_error', { "app_id": msg.app_id, "error": errT.message, "data_send": msg });
              }
              else if (resultsTBL) {
                delete msg["obj_name"];
                msg["id"] = tblname;
                msg["totalCount"] = resultsTBL.totalCount;
                msg["nextCursor"] = resultsTBL.nextCursor;
                resultsTBL.rows.forEach(function(dong){
                  if(!dong["id"] && dong["_id"])
                  {
                    global.la_DBtables[msg.app_id + '/' + tblname].remove("obj._id==='"+dong["_id"]+"'",function (err, numRemoved) {
                      console.log("🗑 Xóa xong dòng không hợp lệ bảng "+tblname+":", dong);
                    });
                  }
                });
                msg.rows = resultsTBL.rows.filter(dong=>dong["id"]);
              }
              if (fn)
                return fn(msg);
              else
                return io.to(socket.id).emit('la_obj_tables', msg); 
            });
          else
            return global.la_DBtables[msg.app_id + '/' + tblname].find(msg.e_where, (errT, resultsTBL) => {
              if (errT) {
                if (fn)
                  return fn({ "app_id": msg.app_id, "error": errT.message, "data_send": msg });
                return io.to(socket.id).emit('la_show_error', { "app_id": msg.app_id, "error": errT.message, "data_send": msg });
              }
              if (resultsTBL) {
                delete msg["obj_name"];
                msg["id"] = tblname;
                resultsTBL.forEach(function(dong){
                  if(!dong["id"] && dong["_id"])
                  {
                    global.la_DBtables[msg.app_id + '/' + tblname].remove("obj._id==='"+dong["_id"]+"'",function (err, numRemoved) {
                      console.log("🗑 Xóa xong dòng không hợp lệ bảng "+tblname+":", dong);
                    });
                  }
                });
                msg.rows = resultsTBL.filter(dong=>dong["id"]);
              }
              if (fn)
                return fn(msg);
              else
                return io.to(socket.id).emit('la_obj_tables', msg);
            });
        }
      });
  } catch (e) {
    return io.to(socket.id).emit('la_show_error', { "app_id": msg.app_id, "error": e.message, "data_send": msg });
  }
}
function la_obj_updates(msg, fn) {
  try {
      msg.command = msg.command.toLowerCase();
      const objName = msg.obj_name.replace(/#dbsys#/g, '');
      const dbPath = `${msg.app_id}/${objName}`;

      if (!global.la_DBtables[dbPath])
          global.la_DBtables[dbPath] = global.la_store(msg.app_id,objName);

      if (msg.command === "create" || msg.command === "update") {
          if (!msg["obj"])
              msg["obj"] = msg.obj_update;

          if (!global.la_DBtables[msg.app_id + '/index'])
              global.la_DBtables[msg.app_id + '/index'] = global.la_store(msg.app_id,'index');

          if (objName === "index") {
              let e_where = "obj.id==='"+msg.obj_update.id+"'";

              // console.log("🔍 Kiểm tra index với điều kiện:", e_where);
              
              global.la_DBtables[dbPath].findOne(e_where, function (err, existingData) {
                  if (err) return handleError(err, msg, fn);

                  if (existingData) {
                      // console.log("🔄 Cập nhật dữ liệu:", msg.obj_update);
                      global.la_DBtables[dbPath].update(msg.obj_update,e_where, function (err, numReplaced) {
                          if (err) return handleError(err, msg, fn);
                          handleSuccess(msg, numReplaced, fn);
                      });
                  } else {
                      // console.log("🆕 Thêm mới dữ liệu:", msg.obj_update);
                      global.la_DBtables[dbPath].insert(msg.obj_update, function (err, newDoc) {
                          if (err) return handleError(err, msg, fn);
                          msg["status"] = true;
                          msg["command"] = "create";
                          msg["data_row"] = newDoc;
                          if (fn) fn(msg);
                          io.emit('la_obj_updates', msg);
                      });
                  }
              });
          } else {
              global.la_DBtables[msg.app_id + '/index'].findOne("obj.id==='"+objName+"'", (err, findStruct) => {
                  let e_where = "";

                  if (findStruct && findStruct.struct.fieldsPK) {
                      findStruct.struct.fieldsPK.forEach(function (pK) {
                          let nObj = {};
                          nObj[pK] = msg.obj[pK];
                          let value = msg.obj[pK];
                          let isNumber = typeof value === 'number';
                          e_where += (e_where ? "&&" : "") + (isNumber ? "1*" : "")+"obj." + pK + (isNumber ? "===" : "==='") + value + (isNumber ? "" : "'");
                      });
                  } else if (msg.e_where) {
                      e_where = msg.e_where;
                  } else {
                      e_where = "obj.id==='"+msg.obj_update.id+"'";
                  }

                  if (!e_where || Object.keys(e_where).length === 0) {
                      console.error("❌ Lỗi: Điều kiện cập nhật không hợp lệ.", msg);
                      return;
                  }

                  console.log("🔍 Kiểm tra dữ liệu trước khi cập nhật:", e_where,msg);

                  global.la_DBtables[dbPath].findOne(e_where, function (err, existingData) {
                      if (err) return handleError(err, msg, fn);

                      if (existingData) {
                          console.log("🔄 Cập nhật dữ liệu:", msg.obj_update);
                          global.la_DBtables[dbPath].update(msg.obj_update,e_where, function (err, numReplaced) {
                              if (err) return handleError(err, msg, fn);
                              handleSuccess(msg, numReplaced, fn);
                          });
                      } else {
                          console.log("🆕 Thêm mới dữ liệu:", msg.obj_update);
                          global.la_DBtables[dbPath].insert(msg.obj_update, function (err, newDoc) {
                              if (err) return handleError(err, msg, fn);
                              msg["status"] = true;
                              msg["command"] = "create";
                              msg["data_row"] = newDoc;
                              if (fn) fn(msg);
                              io.emit('la_obj_updates', msg);
                          });
                      }
                  });
              });
          }
      } else if (msg.command === "delete") {
          global.la_DBtables[dbPath].remove(msg.e_where,function (err, numRemoved) {
              if (err) return handleError(err, msg, fn);
              if (numRemoved > 0) {
                  msg["status"] = true;
                  if (fn) fn(msg);
                  io.emit('la_obj_updates', msg);
              }
          });
      }
  } catch (e) {
      console.error("❌ Exception:", e);
      msg["status"] = false;
      if (fn) return fn(msg);
      else return io.emit('la_obj_updates', msg);
  }
}
// //Phần giành riêng tra từ cho Tool Thầy Phong Thủy
// const cheerio = require("cheerio");
const axios = require("axios");
// const guid=function(tbl_prefix_pk)
// {
//     var time_id=dateFormat(new Date(),"yymmddhhMMss");
//     function s4() {
//       return Math.floor((1 + Math.random()) * 0x10000)
//         .toString(16)
//         .substring(1);
//     }
//     return (tbl_prefix_pk!=""?tbl_prefix_pk+"_":"")+time_id+"_" + s4() + s4() + s4();
// }
// const loadWordResult=function(html,mode,word,proxy_list){
//   try {
//     // Initialize the DOM parser
//     // // Parse the text
//     var doc = HTMLParser.parse(html);
//     var getChar='';
//     if(mode && word)
//     {
//       if(doc.querySelector('.sticky-top #LookupForm'))
//       {
//         var rplImage=[];
//         var pForm=doc.querySelector('.sticky-top #LookupForm').parentNode;
//         if(pForm.querySelector('.hvres-nav-dock'))
//           pForm.querySelector('.hvres-nav-dock').remove();
//         if(pForm.querySelector('#LookupForm'))
//           pForm.querySelector('#LookupForm').remove();
//         pForm.querySelectorAll('a').forEach(function(el){
//           if(el.getAttribute('href').indexOf('http')===-1)
//           {
//             try{
//               var middleText=el.getAttribute('href').split(new RegExp('/','g'));
//               if(middleText.length===3)
//                 getDataforChar(middleText[2],middleText[1],'vie',proxy_list)
//               el.setAttribute('href','tra-tu'+el.getAttribute('href').replace(/\?/g,'-').replace(/\&/g,'-').replace(/\=/g,'-').replace(/\//g,'-')+'.shtml');
//             }catch(eTT){

//             }
//           }
//         });
//         pForm.querySelectorAll('.hvres-meaning img').forEach(function(el){
//           var src=el.getAttribute('src')||el.getAttribute('data-original')
//           if(src)
//           { 
//             var fileName = src.replace(/\//g,'_');
//             axios.get('https://hvdic.thivien.net'+src, {
//               responseType: 'arraybuffer'
//             })
//             .then(function(response){
//               var base64Image = Buffer.from(response.data, 'binary').toString('base64');
//               var img =  global.Buffer.from(base64Image, 'base64');
//               var dirImg = global.rootPath+'public/app_images/vpts/';
//               if (!fs.existsSync(dirImg)){
//                 fs.mkdirSync(dirImg);
//               }
//               sharp(img).toFile(global.rootPath+'public/app_images/vpts/'+fileName);
//             });
//             el.setAttribute('src','app_images/vpts/'+fileName);
//             el.setAttribute('data-original','app_images/vpts/'+fileName);
//           }
//         });
//         if(pForm.querySelector('.hanzi-writer'))
//         {
//           getChar=pForm.querySelector('.hanzi-writer').getAttribute('data-word');
//           pForm.querySelector('.hanzi-writer').remove();
//           pForm.querySelector('.hvres-animation').innerHTML=`<div class="anim-img hanzi-writer" id="hanzi">
//             <svg class="pad">
//               <line x1="0" y1="0" x2="100" y2="100" stroke="#DDD" />
//               <line x1="100" y1="0" x2="0" y2="100" stroke="#DDD" />
//               <line x1="50" y1="0" x2="50" y2="100" stroke="#DDD" />
//               <line x1="0" y1="50" x2="100" y2="50" stroke="#DDD" />
//             </svg>
//           </div>`;
//         }
//         var kqHtml=pForm.innerHTML;
//         rplImage.forEach(function(rObj){
//           kqHtml=kqHtml.replace(rObj.tim,rObj.thay);
//         });
//         var objRowData={id:guid('vpts'),mode:mode,word:word,noi_dung:kqHtml};
//         // console.log(objRowData);
//         if(!global.la_DBtables['vpts/vpts_tudien'])
//             global.la_DBtables['vpts/vpts_tudien']=global.la_store(global.rootPath+'csm_datas/vpts/vpts_tudien/');
//         global.la_DBtables['vpts/vpts_tudien'].update({id:objRowData["id"]},objRowData, { upsert: true }, function (err, numReplaced, upsert) {});
//         return kqHtml;
//       }
//     }
//   } catch (error) {
//     return loadWordResult(html,mode,word,proxy_list);
//   }
// }
// const TuDiengetSync=function(mode,word){
//   return new Promise((resolve, reject) => {
//     if(!global.la_DBtables['vpts/vpts_tudien'])
//       global.la_DBtables['vpts/vpts_tudien']=global.la_store(global.rootPath+'csm_datas/vpts/vpts_tudien/');
//     global.la_DBtables['vpts/vpts_tudien'].get({mode:mode,word:word}, (err, doc) => {
//       err ? reject(err) : resolve(doc);
//     });
//   });
// }
// const getDataforChar = async (word,mode, lang,proxy_list) => {
//   try {
//     var app_struct=await TuDiengetSync(mode,word);
//     if(app_struct)
//       return app_struct['noi_dung'];
//     else
//     {
//       let random_index = Math.floor(Math.random() * proxy_list.length);
//       var proxy=proxy_list[random_index];
//       // var urlC=`https://api.ipify.org/?format=json`;
//       // const axiosResponseC = await axios.request({
//       //   method: "GET",
//       //   url: urlC,
//       //   headers: {
//       //     "User-Agent":
//       //       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
//       //   },
//       //   proxy
//       // });
//       // console.log(axiosResponseC.data)
//       var url=`https://hvdic.thivien.net/${mode}/${word}`;
//       // console.log(encodeURI(url))
//       const axiosResponse = await axios.request({
//         method: "GET",
//         url: encodeURI(url),
//         headers: {
//           "User-Agent":
//             "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
//         },
//         timeout:10000,
//         proxy
//       });
//       const data = cheerio.load(axiosResponse.data);
//       // console.log(data);
//       const info = data(".hvres-meaning").text();
//       if (info === "")
//         return {
//           error: lang === "vie" ? "Không tìm thấy kết quả!" : "No result found!",
//         };
//       if (lang === "vie") 
//         return loadWordResult(data("body").html(),mode,word,proxy_list);
//       else if (lang === "eng") {
//         var url=`https://www.dong-chinese.com/wiki/${word}`;
//         const axiosResponseEng = await axios.request({
//           method: "GET",
//           url: encodeURI(url),
//           headers: {
//             "User-Agent":
//               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
//           },
//           timeout:10000,
//           proxy
//         });
//         var dataEng = cheerio.load(axiosResponseEng.data);
//         if (dataEng("body").text().includes("Word not found"))
//           return {
//             error:
//               "The character you are looking for is not available in the database!",
//           };

//         if (
//           dataEng("body")
//             .text()
//             .includes(
//               "This information for this character has not been manually reviewed and may not be accurate."
//             )
//         )
//           return {
//             error:
//               "This information for this character has not been manually reviewed and may not be accurate, so we cannot provide you with the information you need!",
//           };
//         return loadWordResult(dataEng("body").html(),mode,word,proxy_list);
//       }
//     }
//     return kqSearch;
//   } catch (error) {
//     const basic = await getDataforChar(word,mode,lang,proxy_list);
//     if(basic)
//       return basic;
//     else
//       return {
//         error:
//           lang === "vie"
//             ? "Đã có lỗi xảy ra! Mong bạn thông cảm cho sự bất tiện này:"+error
//             : "An error has occured! Please try again later!:"+error,
//       };
//   }
// };
// //Xong phần tra từ cho Tool Thầy Phong Thủy

global.config = require(global.rootPath + "config.json");

// const { S3Client, ListObjectsCommand, PutObjectCommand, DeleteObjectCommand} = require("@aws-sdk/client-s3");

// // Cấu hình AWS SDK

// const s3Client = new S3Client({
//   region: global.config.aws.AWS_REGION,
//   credentials: {
//     accessKeyId: global.config.aws.AWS_ACCESS_KEY_ID,
//     secretAccessKey: global.config.aws.AWS_SECRET_ACCESS_KEY,
//   },
// });

const OSS = require('ali-oss');

// Cấu hình Alibaba Cloud OSS
const ossClient = new OSS({
  region: global.config.oss.OSS_REGION, // VD: 'oss-cn-hangzhou'
  accessKeyId: global.config.oss.OSS_ACCESS_KEY_ID,
  accessKeySecret: global.config.oss.OSS_ACCESS_KEY_SECRET,
  bucket: global.config.oss.OSS_BUCKET, // Bucket mặc định
});


var cors = require('cors');
// db = require('./config/db');
const routerM = function (config) {
  global.phone = config.phone;
  global.writeby = config.writeby;
  global.c_phone = config.c_phone;
  global.c_writeby = config.c_writeby;
  global.delaytime = function (ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };
  //Xong dinh nghia database sys

  var appRouter = express.Router();
  // var mongo = db(config);
  // var api = require('./router/api')(appRouter, express);
  // appRouter.use('/api', api);

  // // appRouter configuration
  // if (config.useBasicAuth) {
  //     appRouter.use(basicAuth(config.basicAuth.username, config.basicAuth.password));
  // }
  // appRouter.use(bodyParser.urlencoded({
  //     extended: true
  // }));
  appRouter.use(cookieParser(config.cookieSecret));
  appRouter.use(session({
    secret: config.sessionSecret,
    key: config.cookieKeyName,
    resave: true,
    saveUninitialized: true
  }));
  appRouter.use(methodOverride(function (req, res) {
    try {
      if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        // look in urlencoded POST bodies and delete it
        var method = req.body._method
        delete req.body._method
        return method
      }
    } catch (e) {
      return next();
    }
  }));

  // if (process.env.NODE_ENV === 'development') {
  //     appRouter.use(errorHandler());
  // }

  // view helper, sets local variables used in templates
  appRouter.options('*', cors())
  appRouter.use(bodyParser.json({ limit: '5000mb', verify: rawBodySaver }));
  appRouter.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: false, limit: '5000mb' }));
  appRouter.use(bodyParser.raw({ limit: '5000mb', verify: rawBodySaver, type: '*/*' }));
  appRouter.use(express.json());
  // Kích hoạt nén HTTP
  appRouter.use(compression());

  // Cấu hình phục vụ file tĩnh với cache
  appRouter.use(express.static(path.join(__dirname,"csm_datas", 'public'), {
    maxAge: '30d', // Cache 30 ngày
    immutable: true // Đảm bảo các tệp tĩnh không thay đổi được
  }));
  // appRouter.use(gzippo.staticGzip(__dirname + '/public', { maxAge: 2592000, clientMaxAge: 2592000 }));
  // appRouter.use(gzippo.compress());
  // appRouter.post("/tra-tu.shtml", async (req, res) => {
  //   const data = req.body;
  //   var proxies = await proxyList.get();
  //   var proxiesL=proxies.filter(p=>p.protocol==='https');
  //   if(proxiesL.length>0)
  //     proxiesL=proxiesL.map(p=>({protocol:p.protocol,host:p.ip,port:p.port,url:p.url}));
  //   const basic = await getDataforChar(data.word,data.mode, data.lang,proxiesL);
  //   res.send(basic);
  // });
  // Compress content
  // appRouter.use(compression());
  // appRouter.use(function(req, res, next)
  // {
  //   if (/\.min\.(css|js)$/.test(req.url)) {
  //     res.minifyOptions = res.minifyOptions || {};
  //     res.minifyOptions.minify = false;
  //   }
  //   next();
  // });
  // appRouter.use(minify({cache: __dirname + '/cache'}));
  // appRouter.use(express.static(__dirname + '/public', { maxAge: 2592000 }));
  appRouter.all('*', cors(), function (req, res, next) {
    try {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Credentials', true);
      res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (global.config.sslport !== -1) {
        if (req.secure && !global.config.ssl.find(s => s.op_target === false && s.host.replace(/www\./g, '') === req.get('host').replace(/www\./g, ''))) {
          var checkServer = global.config.ssl.find(s => s.host.replace(/www\./g, '') === req.get('host').replace(/www\./g, ''));
          if (checkServer) {
            var con_target = checkServer.op_target.target;
            var parsedUrl = require('url').parse(req.url, true);
            var target = parsedUrl.protocol + '//' + con_target.host + ":" + con_target.port;
            return proxy.web(req, res, { target: target, secure: false });
            // return proxy.web(req, res, { target: { protocol: req.protocol==='https'?'http':req.protocol, host:con_target.host, port: con_target.port}, secure: fals});
          }
          return next();
        }
        if ((!req.secure || req.headers.host.indexOf("www.") === -1) && req.method === 'GET' && req.headers.host.split(".").length === 2)
          return res.redirect(301, 'https://www.' + req.headers.host + req.url);
      }
      res.locals.baseHref = req.app.mountpath + (req.app.mountpath[req.app.mountpath.length - 1] === '/' ? '' : '/');
      var query = {};
      if (req.method != 'GET')
        query = req.body;
      else
        query = require('url').parse(req.url, true).query;
      if (!global.la_DBtables['dbsys/sys_la_routers'])
        global.la_DBtables['dbsys/sys_la_routers'] = new global.la_store('dbsys','sys_la_routers');
      /*
       * Kiểm tra truy vấn kết thúc bằng .shtml
       * 
       */
      var linkP = require('url').parse(req.url).pathname;
      if (linkP.endsWith(".shtml") || linkP === '/') {
        if (linkP === "/auth.shtml") {
          const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
          });
          return res.redirect(authUrl);
        }
        else if (linkP === "/oauth2callback.shtml") {
          const { code } = req.query;
          return oauth2Client.getToken(code, (err, tokens) => {
            if (err) {
              return res.status(400).send('Error retrieving access token');
            }

            // Lưu access_token và refresh_token vào oauth2Client
            oauth2Client.setCredentials(tokens);
            return res.send('Authentication successful! You can now upload/download files.');
          });
        }
        if (linkP === "/upload.shtml") {
          if (!query["app_id"]) query["app_id"] = "dbsys";
        
          // 1. Liệt kê file
          if (query["cmd"] === 'list') {
            ossClient.list({
              prefix: '',
              'max-keys': 1000
            }).then(result => {
              const listIMGS = (result.objects || []).map(file => ({
                name: file.name,
                src: `${global.config.oss.CDN_URL}/${file.name}`,
                size: file.size,
                load: true
              }));
              res.append('Cache-control', 'public, max-age=2592000');
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(listIMGS));
            }).catch(err => {
              console.error("List error:", err);
              res.statusCode = 500;
              res.end("List error");
            });
          }
        
          // 2. Xoá ảnh
          else if (query["cmd"] === 'removeimg' && query["name"]) {
            const key = query["name"];
            ossClient.delete(key).then(() => {
              console.log("Deleted:", key);
              res.statusCode = 200;
              res.end("Deleted");
            }).catch(err => {
              console.error("Delete error:", err);
              res.statusCode = 500;
              res.end("Delete error");
            });
          }
        
          // 3. Upload từ base64
          else if (query["src"]) {
            const base64Image = query["src"].split(",")[1];
            if (!base64Image) {
              res.statusCode = 400;
              return res.end("Base64 image is required");
            }
        
            const buffer = Buffer.from(base64Image, "base64");
            const key = query["app_id"] + '---' + query["name"];
        
            client.put(key, buffer).then(result => {
              const url = `${global.config.oss.CDN_URL}/${key}`;
              res.statusCode = 200;
              res.end(url);
            }).catch(err => {
              console.error("Upload base64 error:", err);
              res.statusCode = 500;
              res.end("Upload error");
            });
          }
        
          // 4. Upload từ link
          else if (query["link"]) {
            fetch(query["link"])
              .then(r => r.buffer())
              .then(buffer => {
                const key = query["app_id"] + '---' + query["name"];
                return ossClient.put(key, buffer);
              })
              .then(result => {
                const url = `${global.config.oss.CDN_URL}/${query["app_id"] + '---' + query["name"]}`;
                res.statusCode = 200;
                res.end(url);
              })
              .catch(err => {
                console.error("Upload link error:", err);
                res.statusCode = 500;
                res.end("Upload link error");
              });
          }
        
          else {
            return next(); // Không phải các hành động trên
          }
        }
        else if (linkP === "/page_struct_js.shtml") {
          if (query["cmd"] === "createStructVuejs" && query["app_token"] && query["app_token_base"])
            return createStructVuejs(query["app_token"], query["app_token_base"], res);
          else if (!query["name"] || !query["apt"] || !query["apd"])
            return next();
          var databaseapp = query["apd"] !== "false" ? query["apd"] : false;
          if (databaseapp) {
            if (!global.la_DBtables[databaseapp + '/index'])
              global.la_DBtables[databaseapp + '/index'] = global.la_store(databaseapp,'index');
            return global.la_DBtables[databaseapp + '/index'].findOne("obj.id==='"+query["apt"]+"'", (err, app_struct) => {
              // res.append('Cache-control', 'public, max-age=2592000');
              res.setHeader("Content-Encoding", "deflate");
              res.setHeader("Content-Type", "text/javascript");
              if (app_struct) {
                zlib.deflate(global.Base64.decode(app_struct.struct), function (err, buffer) {
                  if (err) return res.end("");
                  res.end(buffer);
                });
              }
              else
                return res.send("");
            });
          }
          else {
            if (!global.la_DBtables['dbsys/sys_autos'])
              global.la_DBtables['dbsys/sys_autos'] = global.la_store('dbsys','sys_autos');
            if (!global.la_DBtables[query["name"] + '/index'])
              global.la_DBtables[query["name"] + '/index'] = global.la_store(query["name"],'index');
            return global.la_DBtables[query["name"] + '/index'].findOne("obj.id==='"+query["apt"]+"'", (err, app_struct) => {
              // res.append('Cache-control', 'public, max-age=2592000');
              res.setHeader("Content-Encoding", "deflate");
              res.setHeader("Content-Type", "text/javascript");
              if (app_struct) {
                zlib.deflate(global.Base64.decode(app_struct.struct),{ level: 3 }, function (err, buffer) {
                  if (err) return res.end("");
                  res.end(buffer);
                });
              }
              else
                return global.la_DBtables['dbsys/sys_autos'].findOne("obj.id==='"+query["apt"]+"' && 1*obj.p_type===0", (err, pageJS) => {
                  // res.append('Cache-control', 'public, max-age=2592000');
                  res.setHeader("Content-Encoding", "deflate");
                  res.setHeader("Content-Type", "text/javascript");
                  if (pageJS) {
                    var strJS = global.strtr(pageJS.p_code, global.phone + global.writeby, global.writeby + global.phone);
                    zlib.deflate(global.Base64.decode(strJS),{ level: 3 }, function (err, buffer) {
                      if (err) return res.end("");;
                      res.end(buffer);
                    });
                  }
                  else
                    return res.send("");
                });
            });
          }
        }
        else if (linkP === "/api.shtml") {
          if (query["cmd"] === 'la_obj_tables') {
            return la_obj_tables(query, (result) => res.json(result));
          }
          else if (query["cmd"] === 'la_obj_updates') {  // Lưu ý: Xóa dấu "/" trước 'la_obj_updates'
            return la_obj_updates(query, (result) => res.json(result));
          }
          else if(query["link"])
          {
            try {
              return axios.request({
                method: "GET",
                url: query["link"],
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
                }
              }).then(response => res.status(200).send(response.data));
              return proxyList.get().then(function (proxies) {
                var proxy_list = proxies.filter(p => p.protocol === 'https');
                let random_index = Math.floor(Math.random() * proxy_list.length);
                var proxy = proxy_list[random_index];
                return axios.request({
                  method: "GET",
                  url: query["link"],
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
                  },
                  proxy
                }).then(response => res.status(200).send(response.data));
              });
              return axios.get(query["link"])
                .then(response => res.status(200).send(response.data));
              return fetch(query["link"])
                .then(async (response) => {
                  const data = await response.text();
                  console.log(data)
                  return { statusCode: response.status, body: data };
                })
                .then((response) => {
                  if (response.statusCode >= 200 && response.statusCode < 300) {
                    return res.send(response.body);
                  } else {
                    return res.send(response.body);
                  }
                });
            } catch {
              return "";
            };
          }
        }
        else if (linkP === "/ytsearch.shtml") {
          try {
            var noidung=query["noi_dung"]||"";
            if (!noidung) {
              return res.status(400).send('Vui lòng cung cấp từ khóa tìm kiếm');
            }
            // Tìm kiếm trên YouTube với yt-search
            return yts(noidung, (err, searchResults) => {
                if (err) {
                    console.error('Lỗi tìm kiếm:', err);
                    return res.status(500).send('Lỗi khi tìm kiếm video');
                }
                
                const videos = searchResults.videos.slice(0, 10).map(video => ({
                    title: video.title,
                    videoId: video.videoId,
                    thumbnail: video.thumbnail,
                    duration: video.timestamp,
                    link: `/ytdownload.shtml?app_id=${query.app_id}&videoId=${video.videoId}&format=mp3`, // Link tải thành MP3
                    link_mp4: `/ytdownload.shtml?app_id=${query.app_id}&videoId=${video.videoId}&format=mp4` // Link tải thành MP4
                }));
        
                return res.json({ videos });
            });
          } catch (error) {
              console.error('Lỗi tìm kiếm:', error);
              return res.status(500).send('Lỗi khi tìm kiếm video');
          }
        }
        else if (linkP === "/ytdownload.shtml") {
          /**
           * 
           *
           * Cài đặt youtube-dl
           * To install it right away for all UNIX users (Linux, macOS, etc.), type:
            sudo curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl
            sudo chmod a+rx /usr/local/bin/youtube-dl

            sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
            sudo chmod a+rx /usr/local/bin/yt-dlp

            Hoặc dùng :
            python3.12 -m pip install yt-dlp
           * 
           */
          const input = query.videoId;
          const format = query.format || 'mp3';

          if (!input) {
            return res.status(400).send('Vui lòng cung cấp videoId hợp lệ hoặc tên bài hát');
          }
          
          const youtubeUrl = `https://www.youtube.com/watch?v=${input}`;
          var pathFlutterApp = global.rootPath + 'csm_datas/public/flutterapp/';
          if (!fs.existsSync(pathFlutterApp)) {
              fs.mkdirSync(pathFlutterApp);
          }
          var pathDartApp = pathFlutterApp + query["app_id"] + "/";
          if (!fs.existsSync(pathDartApp)) {
            fs.mkdirSync(pathDartApp);
          }
          var outputPath = pathDartApp+`${input}.${format}`;
          var filePath=`flutterapp/${query.app_id}/${input}.${format}`;
          let cmd = `yt-dlp -f bestaudio+best --extract-audio --audio-format ${format} --audio-quality 0 --output "${outputPath}" ${youtubeUrl}`;

          if (format === 'mp4') {
            // Nếu định dạng đầu ra là mp4, không sử dụng --extract-audio, tải video và audio
            cmd = `yt-dlp -f "(mp4,webm)[height<480]" --merge-output-format mp4 --output "${outputPath}" ${youtubeUrl}`;
          }
          // Chạy lệnh
          return execPromise(cmd)
            .then((rs) => {
              return res.status(200).send(filePath);
              // return res.sendFile(evcFilePath);
            })
            .catch((error) => {
              return res.status(500).send('Error during compilation');
            });
        }
        else if (linkP === "/compile-dart.shtml") {
          var f_name = query["f_name"];
          var dartCode = query["dart_code"];
          if (!dartCode) {
            return res.status(400).send('No Dart code provided');
          }
            // Ghi mã Dart vào file tạm
            var pathFlutterApp = global.rootPath + 'csm_datas/public/flutterapp/';
            if (!fs.existsSync(pathFlutterApp)) {
                fs.mkdirSync(pathFlutterApp);
            }
            var pathDartApp = pathFlutterApp + query["app_id"] + "/";
            if (!fs.existsSync(pathDartApp)) {
              fs.mkdirSync(pathDartApp);
            }
            // console.log(query, pathDartApp);

            const dartFilePath = pathDartApp+f_name + '.dart';
            const evcFilePath = pathDartApp+f_name + '.evc';
            if (fs.existsSync(dartFilePath)) {
              fs.unlinkSync(dartFilePath);
            }
            if (fs.existsSync(evcFilePath)) {
              fs.unlinkSync(evcFilePath);
            }
            return fs.promises.writeFile(dartFilePath, dartCode, { encoding: 'utf8' })
              .then(() => {
                // console.log('JSON saved');
                // Sử dụng dart_eval để biên dịch thành file .evc
                return execPromise(global.config.dart_eval+" "+dartFilePath +" "+global.config.dart_eval_out+" "+evcFilePath)
                  .then(async (rs) => {
                    // console.log(rs);
                    // Gửi lại file .evc cho client
                    fs.existsSync(dartFilePath,async function (exists) {
                      if (exists) {
                        await global.delaytime(1000);
                        fs.unlinkSync(dartFilePath);
                      }
                    });
                    await global.delaytime(1000);
                    const host = req.headers.host;
                    const protoc = (global.config.sslport !== -1 || global.config.cpanel) && req.protocol === 'http' ? 'https' : req.protocol;
                    const fullUrl = `${protoc}://${host}`
                    var RpathEVC = fullUrl + '/flutterapp/' + query["app_id"] + '/' + query["f_name"]+ '.evc';
                    return res.send(RpathEVC);
                    // return res.sendFile(evcFilePath);
                  })
                  .catch((error) => {
                    fs.writeFileSync(pathDartApp+ f_name + '.txt',`Compilation error: ${error.message}`);
                    // console.error(`Compilation error: ${error.message}`);
                    return res.status(500).send('Error during compilation');
                  });
              })
              .catch(er => {
                // console.log(er);
                return res.status(500).send('Lỗi tạo file dart');
              });
        }
        else if (linkP === "/images.shtml") {
          if (!query["app_id"])
            query["app_id"] = "dbsys";
          var pathIMG = global.rootPath + 'csm_datas/public/app_images/' + query["app_id"] + '/' + query["name"];
          if (query["name"] && query["app_id"] && fs.existsSync(pathIMG)) {
            const host = req.headers.host;
            const protoc = (global.config.sslport !== -1 || global.config.cpanel) && req.protocol === 'http' ? 'https' : req.protocol;
            const fullUrl = `${protoc}://${host}`
            var RpathIMG = fullUrl + '/app_images/' + query["app_id"] + '/' + query["name"];
            return res.redirect(301, RpathIMG);
          }
          else
            return next();
        } else {
          try {
            linkP = linkP.replace(".shtml", "");
            // console.log("Duong dan "+linkP+" Chay voi ten mien:"+req.headers.host.replace(/www\./g, ''))
            return global.la_DBtables['dbsys/sys_la_routers'].findOne("obj.domain_name.trim()==='"+req.headers.host.replace(/www\./g, '')+"' && obj.f_case.trim()==='"+linkP+"' && 1*obj.run===1", (err, la_routers) => {
              if (la_routers != null)
                return SysRunPages(req, res, next, la_routers.f_do, 1, la_routers);
              else {
                return global.la_DBtables['dbsys/sys_la_routers'].findOne("obj.domain_name.trim()==='"+req.headers.host.replace(/www\./g, '')+"' && obj.app_type==='web' && 1*obj.run===1", (errDF, la_routersDWF) => {
                  if (la_routersDWF != null)
                    return SysRunPages(req, res, next, la_routersDWF.f_do, 1, la_routersDWF)
                  else
                    return global.la_DBtables['dbsys/sys_la_routers'].findOne("obj.f_do.trim()==='"+req.headers.host.replace(/www\./g, '').replace(/\./g, '_')+"' && 1*obj.run===1", (err, la_routersK) => {
                      if (la_routersK != null)
                        return SysRunPages(req, res, next, la_routersK.f_do, 1, la_routersK);
                      else
                        return global.la_DBtables['dbsys/sys_la_routers'].findOne("obj.domain_name.trim()==='' && obj.f_case.trim()==='default' && 1*obj.run===1", (err, la_routerDF) => {
                          if (la_routerDF != null)
                            return SysRunPages(req, res, next, la_routerDF.f_do, 1, la_routerDF);
                          else
                            return next();
                        });
                    });
                });
              }
            });
          } catch {
            return next();
          }
        }
      } else
        return next();
    } catch (e) {
      // console.log(e)
      return next();
    }
  });
  appRouter.param('page', function (req, res, next, id) {
    try {
      // try to get the user details from the User model and attach it to the request object
      res.page = id;
      next();
    } catch (e) {
      next();
    }
  });
  return appRouter;
};
function xoa_dau(str) {
  if (str) {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    // Gộp nhiều dấu space thành 1 space
    str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|{|}|\||\\/g, " ");
    str = str.replace(/\s+/g, ' ');
    str = str.replace(/ /g, '-');
    // loại bỏ toàn bộ dấu space (nếu có) ở 2 đầu của xâu
    str = str.trim().toLowerCase();
    return str;
  }
  else
    return "";
}
function SysRunPages(req, res, next, chaytrang, kieutrang, exQuery) {
  try {
    res.locals.baseHref = req.app.mountpath + (req.app.mountpath[req.app.mountpath.length - 1] === '/' ? '' : '/');
    if (!global.la_DBtables['dbsys/sys_autos'])
      global.la_DBtables['dbsys/sys_autos'] = global.la_store('dbsys','sys_autos');
    // console.log(chaytrang+":"+kieutrang);
    global.la_DBtables['dbsys/sys_autos'].findOne("obj.id.toLowerCase().trim()==='"+chaytrang.toLowerCase().trim()+"'&& 1*obj.p_type==="+kieutrang, (err, findPage) => {
      // console.log(err,findPage); 
      if (findPage) {
        var code = global.Base64.decode(global.strtr(findPage.p_code, global.phone + global.writeby, global.writeby + global.phone));// new Buffer(findPage.p_code, 'base64').toString('utf8');
        // console.log(code);
        var query = {};
        if (req.method != 'GET')
          query = req.body;
        else
          query = require('url').parse(req.url, true).query;
        if (exQuery)
          query = Object.assign(query, exQuery);
        // console.log(JSON.stringify(query));
        query["nm"] = chaytrang;
        query["tp"] = 1 * kieutrang;
        if (1 * kieutrang === 0 || 1 * kieutrang === 1)
          return RunCode(req, res, next, code, query);
        else
          return res.sendStatus(code);
      }
      else
        return res.send("Link ko có thực");
    });
  } catch (e) {
    return res.send("Trang thực thi bị lỗi:" + e);
  }
}
function RunCode(req, res, next, strCode, query) {
  try {
    // console.log(query);
    const host = req.headers.host;
    const url = req.originalUrl;
    const protoc = (global.config.sslport !== -1 || global.config.cpanel) && req.protocol === 'http' ? 'https' : req.protocol;
                
    if (query.tp != 1) {
      if (strCode.indexOf("<?php") != -1)
        return next();
      else
        return eval(strCode);
    }
    else if (query.tp == 1) {
      if (query["app_type"] === 'web') {
        if (!global.la_DBtables['web/web_chude'])
          global.la_DBtables['web/web_chude'] = global.la_store('web','web_chude');
        if (!global.la_DBtables['web/web_baiviet'])
          global.la_DBtables['web/web_baiviet'] = global.la_store('web','web_baiviet');
        if (!global.la_DBtables['dbsys/sys_la_routers'])
          global.la_DBtables['dbsys/sys_la_routers'] = new global.la_store('dbsys','sys_la_routers');
        // console.log(chaytrang+":"+kieutrang);
        const BaiViets = {};
        const menus = [];
        return global.la_DBtables['web/web_chude'].find("true", (err, ChuDe) => {
          if (ChuDe) {
            global.la_DBtables['dbsys/sys_la_routers'].find("obj.f_do==='"+query.nm+"' && 1*obj.run===1", (err, la_routerHs) => {
              var domainRun = [];
              if (la_routerHs)
                la_routerHs.forEach(function (objDM) {
                  domainRun.push(objDM.domain_name);
                });
              ChuDe = ChuDe.filter(function (c) { return domainRun.find(d => d === c.domain) });
              ChuDe.push({ id: '', stt: 0 });
              var cacCD = ChuDe.sort((a, b) => 1 * a.stt - 1 * b.stt).map(function (c) { return c.id });
              return global.la_DBtables['web/web_baiviet'].find("1*obj.trang_thai===1 && "+JSON.stringify(cacCD)+".filter(cd=>cd===obj.chu_de).length>0 && "+JSON.stringify(domainRun)+".filter(dm=>dm===obj.domain).length>0", (errB, BaiViet) => {
                if (BaiViet) {
                  ChuDe.sort((a, b) => 1 * a.stt - 1 * b.stt).forEach(function (objCD) {
                    var cacBai = BaiViet.filter(function (c) { return c.chu_de === objCD.id });
                    if (cacBai.length === 1) {
                      var objnCD = JSON.parse(JSON.stringify(cacBai[0]));
                      if (objCD.id === '')
                        objnCD["trang_chu"] = true;
                      BaiViets[objnCD.id] = objnCD;
                      menus.push({ link: objCD.id === '' ? '' : xoa_dau(objnCD.title) + '.shtml', title: objnCD.title, stt: objCD.id === '' ? 0 : 1 })
                    }
                    else if (cacBai.length > 1) {
                      var objnCD = JSON.parse(JSON.stringify(objCD));
                      objnCD = Object.assign(objnCD, { goc_chu_de: xoa_dau(objnCD.title).toLowerCase() });
                      objnCD["bai_viet"] = cacBai;
                      BaiViets[objnCD.id] = objnCD;
                      menus.push({ link: xoa_dau(objnCD.title) + '.shtml', title: objnCD.title, stt: objCD.stt })
                    }
                    else
                      menus.push({ link: xoa_dau(objCD.title) + '.shtml', title: objCD.title, meta: objCD, stt: objCD.stt });
                  });
                }
                if (Object.keys(BaiViets).length > 0) {
                  var linkP = require('url').parse(req.url).pathname;
                  var fKeyUrl = Object.keys(BaiViets).find(function (bKey) {
                    if (BaiViets[bKey].hasOwnProperty("bai_viet"))
                      return linkP.toLowerCase() === "/" + BaiViets[bKey].goc_chu_de + ".shtml" || (linkP.toLowerCase().indexOf("/" + BaiViets[bKey].goc_chu_de + "/") !== -1 && BaiViets[bKey]["bai_viet"].find(function (bai) { return linkP.toLowerCase().indexOf(xoa_dau(bai.title) + ".shtml") !== -1; }));
                    else if (BaiViets[bKey].hasOwnProperty("trang_chu"))
                      return linkP.toLowerCase() === '/';
                  });
                  // return res.send(fKeyUrl+"=="+JSON.stringify(Metas));
                  if (fKeyUrl) {
                    var Metas = JSON.parse(JSON.stringify(BaiViets[fKeyUrl]));
                    if (BaiViets[fKeyUrl].hasOwnProperty("bai_viet") && linkP.toLowerCase().indexOf(xoa_dau(BaiViets[fKeyUrl].title)) !== -1)
                      if (BaiViets[fKeyUrl]["bai_viet"].find(function (bai) { return linkP.toLowerCase().indexOf(xoa_dau(bai.title)) !== -1; }))
                        Metas = BaiViets[fKeyUrl]["bai_viet"].find(function (bai) { return linkP.toLowerCase().indexOf(xoa_dau(bai.title)) !== -1; });
                    const fullUrl = `${protoc}://${host}${url}`
                    Metas["url"] = fullUrl;
                    Metas["site_name"] = `${protoc}://${host}`;
                    Metas["year_now"] = new Date().getFullYear();
                    Metas["xoa_dau"] = xoa_dau;
                    // return res.send(fKeyUrl+"=="+JSON.stringify(Metas));
                    return callDynamicTemplatesHtml(req, res, next, strCode, query.nm, { baseHref: "../", meta: Metas, menus: menus.sort((a, b) => 1 * a.stt - 1 * b.stt), params: query });
                    /** Xử Lý Cho Trang Web SEO-Friendly URLs **/
                  }
                  else {
                    const fullUrl = `${protoc}://${host}${url}`;
                    var Metas = {};
                    Metas["url"] = fullUrl;
                    var XemNgay = '', mo_ta = '';
                    var KT_Ngay = fullUrl.match(/\/xem-ngay\/[a|n]l\/\d{2}([\/.-])\d{2}\1\d{4}/g);
                    if (KT_Ngay) {
                      if (KT_Ngay.length === 1) {
                        mo_ta = (KT_Ngay[0].indexOf('/al/') !== -1 ? 'âm lịch' : '') + ', Xem ngày cưới, Khai trương, Động thổ, Lịch vạn niên';
                        XemNgay = 'Xem ngày ' + KT_Ngay[0].replace('/xem-ngay/', '').replace('al/', '').replace('dl/', '') + (KT_Ngay[0].indexOf('/al/') !== -1 ? ' âm lịch' : '') + ' tốt hay xấu';
                      }
                    }
                    else {
                      KT_Ngay = fullUrl.match(/\/xem-ngay\/\d{2}([\/.-])\d{2}\1\d{4}/g);
                      if (KT_Ngay)
                        if (KT_Ngay.length === 1) {
                          mo_ta = (KT_Ngay[0].indexOf('/al/') !== -1 ? 'âm lịch' : '') + ', Xem ngày cưới, Khai trương, Động thổ, Lịch vạn niên';
                          XemNgay = 'Xem ngày ' + KT_Ngay[0].replace('/xem-ngay/', '') + ' tốt hay xấu';
                        }
                    }
                    Metas["site_name"] = `${protoc}://${host}`;
                    Metas["year_now"] = new Date().getFullYear();
                    if (XemNgay !== '') {
                      var fidxMenu = menus.findIndex(m => m.link.toLowerCase() === 'xem-ngay.shtml')
                      if (fidxMenu !== -1 && menus[fidxMenu]['meta'])
                        menus[fidxMenu]['stt'] = menus[fidxMenu]['meta']['stt'];
                      Metas["title"] = XemNgay;
                      Metas["description"] = XemNgay + mo_ta;
                      Metas["image"] = '/app_images/dbsys/logo-LA-no-BG.png';
                    }
                    else
                      Metas["title"] = "Rất tiếc đường dẫn không tồn tại";
                    var timMenu = menus.find(m => "/" + m.link.toLowerCase() === linkP.toLowerCase())
                    if (timMenu)
                      Metas = Object.assign(Metas, timMenu.meta);
                    // return res.send(fKeyUrl+"=="+JSON.stringify(Metas));
                    return callDynamicTemplatesHtml(req, res, next, strCode, query.nm, { baseHref: "../", meta: Metas, menus: menus.sort((a, b) => 1 * a.stt - 1 * b.stt), params: query });
                  }
                }
                else {
                  const fullUrl = `${protoc}://${host}${url}`;
                  var Metas = {};
                  Metas["url"] = fullUrl;
                  Metas["site_name"] = `${protoc}://${host}`;
                  Metas["year_now"] = new Date().getFullYear();
                  return callDynamicTemplatesHtml(req, res, next, strCode, query.nm, { meta: Metas, baseHref: "../", meta: Metas, menus: menus.sort((a, b) => 1 * a.stt - 1 * b.stt), params: query });
                }
              });
            });
          }
          else {
            const fullUrl = `${protoc}://${host}${url}`;
            var Metas = {};
            Metas["url"] = fullUrl;
            Metas["site_name"] = `${protoc}://${host}`;
            Metas["year_now"] = new Date().getFullYear();
            Metas["title"] = "Rất tiếc đường dẫn không tồn tại";
            // return res.send(fKeyUrl+"=="+JSON.stringify(Metas));
            return callDynamicTemplatesHtml(req, res, next, strCode, query.nm, { baseHref: "../", meta: Metas, menus: menus.sort((a, b) => 1 * a.stt - 1 * b.stt), params: query });
          }
        });
      }
      else {
        const fullUrl = `${protoc}://${host}${url}`;
        var Metas = {};
        Metas["url"] = fullUrl;
        Metas["site_name"] = `${protoc}://${host}`;
        Metas["year_now"] = new Date().getFullYear();
        return callDynamicTemplatesHtml(req, res, next, strCode, query.nm, { meta: Metas, app_id: query.app_id, uid: query.uid, baseHref: "../", title: "Quản lý Menu hệ thống", params: query });
      }
    }
    // return callDynamicTemplatesHtml(req, res, next,query.nm,query)
  } catch (e) {
    // console.log(e)
    return res.send("Trang thực thi bị lỗi:" + e);
  }
}
function callDynamicTemplatesHtml(req, res, next, strCode, page_name, object_para) {
  if (strCode) {
    if (!global.la_DBtables['dbsys/sys_apps'])
      global.la_DBtables['dbsys/sys_apps'] = global.la_store('dbsys','sys_apps');
    if (!object_para["params"])
      object_para["params"] = {};
    return global.la_DBtables['dbsys/sys_apps'].findOne("obj.app_id==='"+page_name+"'", (err, ap) => {
      var databaseapp = false;
      if (ap)
        databaseapp = ap.app_id;
      object_para.params["phone"] = global.phone;
      object_para.params["writeby"] = global.writeby;
      if (!databaseapp && object_para.params.app_type === "app")
        databaseapp = "dbsys";
      if(!object_para.params.app_type)
        object_para.params.app_type="web";
      object_para.params["randval"] = Math.floor(Math.random() * (100000000 - 100000 + 1)) + 100000;
      object_para.params["struct"] = "page_struct_js.shtml?name=" + page_name + "&apt=" + object_para.params.app_type + "&apd=" + databaseapp;
      object_para["Str"] = String;
      // const start = Date.now();
      try {
        var badge = Sqrl.render(strCode, object_para);
        // res.append('Cache-control', 'public, max-age=2592000');
        res.type(`text/html; charset=utf-8`);
        res.setHeader("Content-Encoding", "gzip");
        if (badge) {
          zlib.gzip(badge, function (err, buffer) {
            if (err) return res.end("");;
            res.end(buffer);
          });
        }
      }
      catch (eC) {
        return res.send(eC.message);
      }
    });
  }
  else
    return res.send("Link ko có thực");
}
function rawurldecode(str) {
  try {
    return decodeURIComponent((str + '')
      .replace(/%(?![\da-f]{2})/gi, function () {
        // PHP tolerates poorly formed escape sequences
        return '%25';
      }));
  } catch (e) {
    return str;
  }
}
function rawurlencode(str) {
  str = (str + '').toString();
  return encodeURIComponent(str).replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}
//Xong phần Router
var rawBodySaver = function (req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}
app.use(cookieParser('ddd'));
app.options('*', cors())
// app.all('*', cors(), function(req, res, next) {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Credentials', true);
//   res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type');
//   // console.log(req.get('host'))
//   if (!req.secure && global.config.sslport!==-1) { 
//     return res.redirect('https://' + req.get('host') + req.originalUrl); 
//   }
//   // if(req.secure && !global.config.ssl.find(s=>s.op_target===false && s.host.replace(/www\./g,'')===req.get('host').replace(/www\./g,'')))
//   //   return next();
//   // if(!req.secure && global.config.sslport!==-1 && req.method === 'GET'){ 
//   //   return res.redirect('https://' + req.get('host').replace(/www\./g,'') + req.originalUrl); 
//   // }
//   next();
// });
const { EventEmitter } = require('events');
var Emitters = {};
var initEmitter = function (chanel) {
  if (!Emitters[chanel]) {
    Emitters[chanel] = new EventEmitter().setMaxListeners(0)
  }
  return Emitters[chanel]
}
//simulate RTSP over HTTP
app.get("/users", (req, res) => {

  res.json({
    users,
  })
})
app.get(['/h264', '/h264/:chanel'], function (req, res) {
  if (!req.params.chanel) { req.params.chanel = '1' }
  req.Emitter = initEmitter(req.params.chanel)
  var contentWriter
  var date = new Date();
  res.writeHead(200, {
    'Date': date.toUTCString(),
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Content-Type': 'video/mp4',
    'Server': 'Shinobi H.264 Test Stream',
  });
  req.Emitter.on('data', contentWriter = function (buffer) {
    res.write(buffer)
  });
  res.on('close', function () {
    req.Emitter.removeListener('data', contentWriter)
  })
});
//ffmpeg pushed stream in here to make a pipe
app.all('/livestream/:chanel', function (req, res) {
  req.Emitter = initEmitter(req.params.chanel)
  //req.params.chanel = chanel Number (Pipe Number)
  res.connection.setTimeout(0);
  req.on('data', function (buffer) {
    req.Emitter.emit('data', buffer)
    la_socket.to('STREAM_' + req.params.chanel).emit('h264', { chanel: req.params.chanel, buffer: buffer })
  });
  req.on('end', function () {
    // liver_rtsp(cams[chanel],chanel);
    // la_socket.emit('restartProccess',this.params.chanel);
    // console.log('close',this.params);
  });
})
// app.use(bodyParser.json({limit: '5000mb',verify: rawBodySaver }));
// app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: false ,limit: '5000mb'}));
// app.use(bodyParser.raw({limit: '5000mb',verify: rawBodySaver, type: '*/*' }));

//Định nghĩa phần Middleware
// app.disable('view cache');
app.set('view engine', 'squirrelly')
app.use('/', routerM(global.config));
//Xong phần Middleware

global.la_socket = {};
global.la_mqtt = {};
global.people = [];
global.peopleOnl = [];
global.la_DBtables = {};
global.rooms = {};
global.fb_admin = require("firebase-admin");
global.ObE_Script = require('js-obfuscator');
global.computerName = computerName;
global.serial = "";
serialNumber(function (err, value) {
  global.serial = value;
});
// Định nghĩa phần Chat
const la_chat = function (app, io) {
  la_socket = io;
  if (global.config.sslport !== -1) {
    var clientMQTT = mqtt.connect(global.config.mqtt_string, { keepalive: 1000 });

    clientMQTT.on('connect', function () {
      // if(la_socket)
      //   la_socket.emit('la_mqtt_send',{chanel:'KenhThietBi',message:'xin chao'});
    })

    clientMQTT.on('message', function (topic, message, parket) {
      if (la_socket) {
        //la_socket.emit('la_live_update',JSON.stringify(message));
        la_socket.emit('la_mqtt_listen', { topic: topic, message: decoder.decode(message), parket: parket });
      }
      // message is Buffer
      // console.log(message.toString())
    })
    clientMQTT.on('offline', function () {
      if (la_socket) {
        //la_socket.emit('la_live_update','mqtt offline');
        la_socket.emit('la_mqtt_restart');
      }
      // message is Buffer
      // console.log('mqtt offline')
      // client.end()
    })
    clientMQTT.on('error', function () {
      // message is Buffer
      // console.log('mqtt error');
      if (la_socket)
        la_socket.emit('la_live_update', 'mqtt offline');
      // client.end()
    })
    clientMQTT.on('close', function () {
      // message is Buffer
      // console.log('mqtt close')
      // client.end()
    })
    clientMQTT.on('disconnect', function () {
      // message is Buffer
      // console.log('mqtt disconnect')
      // client.end()
    });
  }
  var liver_rtsp = function (uri, chanel) {
    // console.log(uri);
    var ffmpegString = '-i ' + uri + ''
    ffmpegString += ' -f mpegts -c:v mpeg1video -s 960x540 -q 1 -b:v 1500k -c:a mp2 -ar 44100 -ac 1 -b:a 128k -an http://localhost' + (global.config.port !== 80 ? ':' + global.config.port : '') + '/livestream/' + (1 * chanel + 2)
    if (ffmpegString.indexOf('rtsp://') > -1) {
      ffmpegString = '-rtsp_transport tcp ' + ffmpegString
    }
    // console.log('Executing : ffmpeg '+ffmpegString)
    var ffmpeg = spawn('ffmpeg', ffmpegString.split(' '));
    ffmpeg.on('close', function (chanel) {
      // console.log('ffmpeg died',chanel);
      la_socket.emit('restartProccess', chanel);
      // liver_rtsp(cams[chanel],chanel);
    })
    // ffmpeg.stdout.on('data', function (buffer) {
    //     console.log(buffer);
    //     Emitter.emit('data',buffer)
    // });
  };
  var cams = [
    // 'rtsp://192.168.1.115:554/user=admin_password=_channel=1_stream=0.sdp?real_stream',
    // 'rtsp://192.168.1.116:554/user=admin_password=_channel=1_stream=0.sdp?real_stream',
    // 'rtsp://192.168.1.117:554/user=admin_password=_channel=1_stream=0.sdp?real_stream',
    // 'rtsp://192.168.1.118:554/user=admin_password=_channel=1_stream=0.sdp?real_stream'
    // 'rtsp://192.168.1.115:554/user=ucam115_password=qtvn2020_channel=1_stream=1.sdp?real_stream',
    // 'rtsp://192.168.1.116:554/user=ucam116_password=qtvn2020_channel=1_stream=0.sdp?real_stream',
    // 'rtsp://192.168.1.117:554/user=ucam117_password=qtvn2020_channel=1_stream=0.sdp?real_stream',

    'rtsp://14.161.25.47:1000/user=ucam115_password=qtvn2020_channel=1_stream=1.sdp?real_stream',
    'rtsp://14.161.25.47:1001/user=ucam116_password=qtvn2020_channel=0_stream=0.sdp?real_stream',
    'rtsp://14.161.25.47:554/user=ucam117_password=qtvn2020_channel=0_stream=0.sdp?real_stream',
  ]
  io.use((socket, next) => {
    if (socket.handshake.query?.callerId) {
      socket['user'] = socket.handshake.query?.callerId;
      next();
    } else {
      next();
    }
  });
  var chat = io.on('connection', function (socket) {
    socket.on('getRouterRtpCapabilities', (data, callback) => {
      const router = defaultRoom.router;

      if (router) {
        //console.log('getRouterRtpCapabilities: ', router.rtpCapabilities);
        sendResponse(router.rtpCapabilities, callback);
      }
      else {
        sendReject({ text: 'ERROR- router NOT READY' }, callback);
      }
    });

    // --- setup room ---
    socket.on('prepare_room', async (data, callback) => {
      // console.log(data);
      const roomId = data.roomId;
      const peerId = data.peerId;
      const singer = data.singer;
      const talk = data.talk;
      const mic_audio_filter = data.mic_audio_filter;
      const music_audio_filter = data.music_audio_filter;
      const out_audio_filter = data.out_audio_filter;
      const existRoom = Room.getRoom(roomId);
      if (existRoom) {
        console.log('--- use exist room. roomId=' + roomId);
      } else {
        console.log('--- create new room. roomId=' + roomId);
        const room = await setupRoom(roomId);
      }
      socket['roomId'] = roomId;
      socket['peerId'] = peerId;
      socket['singer'] = singer;
      socket['talk'] = talk;
      if (singer || talk) {
        socket['mic_audio_filter'] = mic_audio_filter;
        socket['music_audio_filter'] = music_audio_filter;
        socket['out_audio_filter'] = out_audio_filter;
      }
      // --- socket.io room ---
      socket.join(roomId);
      sendResponse({ 'roomId': roomId, 'peerId': peerId, 'status': true }, callback);
      // setRoomname(roomId);
    })

    // --- producer ----
    socket.on('createProducerTransport', async (data, callback) => {
      const roomName = socket['roomId'];

      console.log('-- createProducerTransport ---room=%s', roomName);
      const { transport, params } = await createTransport(roomName);
      addProducerTrasport(roomName, socket['peerId'], transport);
      transport.observer.on('close', () => {
        const id = socket['peerId'];
        const videoProducer = getProducer(roomName, id, 'video');
        if (videoProducer) {
          videoProducer.close();
          removeProducer(roomName, id, 'video');
        }
        const audioProducer = getProducer(roomName, id, 'audio');
        if (audioProducer) {
          audioProducer.close();
          removeProducer(roomName, id, 'audio');
        }
        removeProducerTransport(roomName, id);
      });
      sendResponse(params, callback);
    });

    socket.on('connectProducerTransport', async (data, callback) => {
      const roomName = socket['roomId'];
      const transport = getProducerTrasnport(roomName, socket['peerId']);
      if (transport) {
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        sendResponse({}, callback);
      }
      else
        sendResponse(null, callback);
    });

    socket.on('produce', async (data, callback) => {
      const roomName = socket['roomId'];
      const { kind, rtpParameters } = data;
      console.log('-- produce --- kind=' + kind);
      const id = socket['peerId'];
      const transport = getProducerTrasnport(roomName, id);
      if (!transport) {
        console.error('transport NOT EXIST for id=' + id);
        return;
      }
      const producer = await transport.produce({ kind, rtpParameters });
      addProducer(roomName, id, producer, kind);
      producer.observer.on('close', () => {
        console.log('producer closed --- kind=' + kind);
      })
      sendResponse({ id: producer.id }, callback);

      // inform clients about new producer

      if (roomName) {
        if (kind === "audio") {
          var phong = Room.rooms[roomName];
          if (socket['singer'] && phong.singers.length < 2) {
            var checkU = phong.singers.find(s => s.id === id);
            if (!checkU) {
              var singer = await phong.singer_producer(socket);
              phong.singers.push(singer);
              // console.log(phong.singers);
            }
          }
        }
        console.log('--broadcast room=%s newProducer ---', roomName);
        socket.broadcast.to(roomName).emit('newProducer', { socketId: id, producerId: producer.id, kind: producer.kind });
      }
      else {
        console.log('--broadcast newProducer ---');
        socket.broadcast.emit('newProducer', { socketId: id, producerId: producer.id, kind: producer.kind });
      }
    });

    // --- consumer ----
    socket.on('createConsumerTransport', async (data, callback) => {
      const roomName = socket['roomId'];
      const localId = socket['peerId'];
      console.log('-- createConsumerTransport -- id=' + localId);
      const { transport, params } = await createTransport(roomName);
      addConsumerTrasport(roomName, localId, transport);
      transport.observer.on('close', () => {
        const localId = socket['peerId'];
        removeConsumerSetDeep(roomName, localId);
        removeConsumerTransport(roomName, localId);
      });
      //console.log('-- createTransport params:', params);
      sendResponse(params, callback);
    });
    socket.on('play_music', async () => {
      const roomName = socket['roomId'];
      const localId = socket['peerId'];
      const room = Room.getRoom(roomName);
      var filename = path.join(__dirname, 'public/singstar/riengmotgoctroi.mp4');
      room.add_media_from_mp4(socket, filename);
    });
    socket.on('connectConsumerTransport', async (data, callback) => {
      const roomName = socket['roomId'];
      console.log('-- connectConsumerTransport -- id=' + socket['peerId']);
      let transport = getConsumerTrasnport(roomName, socket['peerId']);
      if (!transport) {
        console.error('transport NOT EXIST for id=' + socket['peerId']);
        return sendResponse(null, callback);
      }
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      sendResponse({}, callback);
    });

    socket.on('consume', async (data, callback) => {
      console.error('-- ERROR: consume NOT SUPPORTED ---');
      return;
    });

    socket.on('resume', async (data, callback) => {
      console.error('-- ERROR: resume NOT SUPPORTED ---');
      return;
    });

    socket.on('getCurrentProducers', async (data, callback) => {
      const roomName = socket['roomId'];
      const clientId = data.localId;
      console.log('-- getCurrentProducers for Id=' + clientId);

      const remoteVideoIds = getRemoteIds(roomName, clientId, 'video');//.filter(s => s.indexOf("_songfile") !== -1);
      console.log('-- remoteVideoIds:', remoteVideoIds);
      const remoteAudioIds = getRemoteIds(roomName, clientId, 'audio');//.filter(s => s.indexOf("_songfile") !== -1);
      console.log('-- remoteAudioIds:', remoteAudioIds);
      sendResponse({ remoteVideoIds: remoteVideoIds, remoteAudioIds: remoteAudioIds }, callback);
    });

    socket.on('consumeAdd', async (data, callback) => {
      const roomName = socket['roomId'];
      const localId = socket['peerId'];
      const kind = data.kind;
      console.log('-- consumeAdd -- localId=%s kind=%s', localId, kind);

      let transport = getConsumerTrasnport(roomName, localId);
      if (!transport) {
        console.error('transport NOT EXIST for id=' + localId);
        return;
      }
      const rtpCapabilities = data.rtpCapabilities;
      const remoteId = data.remoteId;
      console.log('-- consumeAdd - localId=' + localId + ' remoteId=' + remoteId + ' kind=' + kind);
      const producer = getProducer(roomName, remoteId, kind);
      if (!producer) {
        console.error('producer NOT EXIST for remoteId=%s kind=%s', remoteId, kind);
        return;
      }
      const { consumer, params } = await createConsumer(roomName, transport, producer, rtpCapabilities); // producer must exist before consume
      //subscribeConsumer = consumer;
      addConsumer(roomName, localId, remoteId, consumer, kind); // TODO: MUST comination of  local/remote id
      console.log('addConsumer localId=%s, remoteId=%s, kind=%s', localId, remoteId, kind);
      consumer.observer.on('close', () => {
        console.log('consumer closed ---');
      })
      consumer.on('producerclose', () => {
        console.log('consumer -- on.producerclose');
        consumer.close();
        removeConsumer(roomName, localId, remoteId, kind);

        // -- notify to client ---
        socket.emit('producerClosed', { localId: localId, remoteId: remoteId, kind: kind });
      });

      console.log('-- consumer ready ---');
      sendResponse(params, callback);
    });

    socket.on('resumeAdd', async (data, callback) => {
      const roomName = socket['roomId'];
      const localId = socket['peerId'];
      const remoteId = data.remoteId;
      const kind = data.kind;
      console.log('-- resumeAdd localId=%s remoteId=%s kind=%s', localId, remoteId, kind);
      let consumer = getConsumer(roomName, localId, remoteId, kind);
      if (!consumer) {
        console.error('consumer NOT EXIST for remoteId=' + remoteId);
        return;
      }
      await consumer.resume();
      sendResponse({}, callback);
    });

    // ---- sendback welcome message with on connected ---
    const newId = socket['peerId'];
    sendback(socket, { type: 'welcome', id: newId });
    // --- send response to client ---
    function sendResponse(response, callback) {
      //console.log('sendResponse() callback:', callback);
      callback(response);
    }

    // --- send error to client ---
    function sendReject(error, callback) {
      callback(error.toString(), null);
    }

    function sendback(socket, message) {
      socket.emit('message', message);
    }

    socket.on('error', function (err) {
      console.error('socket ERROR:', err);
    });
    if (socket.handshake.query?.callerId)
      socket.join(socket['user']);
    if (!global.la_DBtables['dbsys/sys_la_routers'])
      global.la_DBtables['dbsys/sys_la_routers'] = new global.la_store('dbsys','sys_la_routers');
    global.la_DBtables['dbsys/sys_la_routers'].findOne("(obj.domain_name==='"+socket.handshake.headers.host.replace(/www\./g, '') +"' || obj.f_case==='default') && 1*obj.run===1", (err, la_routers) => {
      if (la_routers != null) {
        if (la_routers.f_do !== "") {
          socket.join(socket.id);
          if (!global.la_DBtables['dbsys/sys_autos'])
            global.la_DBtables['dbsys/sys_autos'] = new global.la_store('dbsys','sys_autos');
          global.la_DBtables['dbsys/sys_autos'].findOne("obj.id.startsWith('"+la_routers.f_do+"')", (err, findPage) => {
            if (findPage) {
              var code = global.Base64.decode(global.strtr(findPage.p_code, global.phone + global.writeby, global.writeby + global.phone));
              global.ObE_Script(code,
                {
                  keepLinefeeds: false,
                  keepIndentations: false,
                  encodeStrings: true,
                  encodeNumbers: true,
                  moveStrings: true,
                  replaceNames: true,
                  variableExclusions: ['^_get_', '^_set_', '^_mtd_']
                }
              ).then(function (obCode) {
                obCode = global.Base64.encode(obCode);
                io.to(socket.id).emit('la_manager', { index: obCode, data: findPages.filter(function (o) { return o.id !== la_routers.f_do }) });
              }, function (err) {
                // console.error(err);
              });
            }
          });
        }
      }
    });
    if (socket.handshake.query?.callerId)
      io.to(socket['user']).emit("new-users", { users, });

    // notify existent users that a new user just joined
    if (socket.handshake.query?.callerId && !users.includes(socket['user'])) {

      users.map((user) => {

        io.to(user).emit("new-user", { user: socket['user'], })
      })
      users.push(socket['user'])
    }
    socket.emit('start', cams.length);
    socket.on('f', function (data) {
      switch (data.function) {
        case 'livestream':
          // console.log(data)
          socket.join('STREAM_' + data.chanel)
          break;
      }
    });
    socket.on('restartProccess', function (chanel) {
      // console.log(chanel);
      liver_rtsp(cams[chanel - 2], chanel - 2);
    });
    cams.map(function (uri, i) {
      // console.log(i);
      // liver_rtsp(uri,i);
      la_socket.emit('restartProccess', i + 2);
    });
    socket.on('join', function (nickname) {
      socket.nickname = nickname;
      socket.room = "";
      if (global.people.filter(function (obj) { return obj.room === "" && obj.user === nickname }).length == 0)
        global.people.push({ room: "", user: nickname, createdAt: new Date() });
      socket.broadcast.emit('notice', { 'nickname': nickname, 'text': 'New user has joined the chat.', 'online': global.people.filter(function (obj) { return obj.room === ""; }) });
    });
    socket.on('join_room', function (data) {
      socket.nickname = data.nickname;
      socket.room = data.room;
      socket.join(data.room);
      if (global.people.filter(function (obj) { return obj.room === data.room && obj.user === data.nickname }).length == 0)
        global.people.push({ room: data.room, user: data.nickname, createdAt: new Date() });
      io.to(data.room).emit('notice', { 'online': global.people.filter(function (obj) { return obj.room === data.room; }) });
    })
    socket.on('disconnect', function () {
      var index = global.people.findIndex(function (obj) { return obj.room === socket.room && obj.user === socket.nickname })
      if (index > -1) {
        global.people.splice(index, 1);
      }
      if (socket.room === "")
        socket.broadcast.emit('notice', { 'online': global.people.filter(function (obj) { return obj.room === ""; }) });
      else {
        io.to(socket.room).emit('notice', { 'online': global.people.filter(function (obj) { return obj.room === socket.room; }) });
        socket.leave(socket.room);
      }
      if (socket['user']) {
        users = users.filter((u) => u != socket['user'])
        users.map((user) => {
          io.to(user).emit("user-left", { user: socket['user'], })
        })
        console.log("a socker disconnected ", socket['user']);
      }
      if (socket['roomId']) {
        const roomName = socket['roomId'];

        // close user connection
        console.log('client disconnected. socket id=' + socket['peerId'] + '  , total clients=' + getClientCount());
        cleanUpPeer(roomName, socket);
        // --- socket.io room ---
        socket.leave(roomName);
      }
    });
    socket.on('check online', function (data) {
      socket.broadcast.emit('online people', { 'status': 1, 'nickname': socket.nickname, 'text': ' has left the chat.' });
    });
    socket.on('load', function (data) {

      var room = findClientsSocket(io, data);
      if (room.length === 0) {

        socket.emit('peopleinchat', {
          number: 0
        });
      } else if (room.length === 1) {

        socket.emit('peopleinchat', {
          number: 1,
          user: room[0].username,
          avatar: room[0].avatar,
          id: data
        });
      } else if (room.length >= 2) {
        chat.emit('tooMany', {
          boolean: true
        });
      }
    });
    socket.on('chat_message', function (msg) {
      io.to(socket.room).emit('chat_message', msg);
    });
    socket.on('chat_message_typing', function (msg) {
      io.to(socket.room).emit('chat_message_typing', msg);
    });
    socket.on('chat_message_untype', function (msg) {
      io.to(socket.room).emit('chat_message_untype', msg);
    });
    function Object2Array(obj) {
      return Object.keys(obj).map(function (k) { return obj[k] });
    }
    function ConvertKeysToLowerCase(obj) {
      var output = {};
      for (i in obj) {
        if (Object.prototype.toString.apply(obj[i]) === '[object Object]') {
          output[i.toLowerCase()] = ConvertKeysToLowerCase(obj[i]);
        } else if (Object.prototype.toString.apply(obj[i]) === '[object Array]') {
          output[i.toLowerCase()] = [];
          output[i.toLowerCase()].push(ConvertKeysToLowerCase(obj[i][0]));
        } else {
          output[i.toLowerCase()] = obj[i];
        }
      }
      return output;
    }
    function getObjectKeyIndex(obj, keyToFind) {
      var i = 0, key;

      for (key in obj) {
        if (key.toLowerCase() == keyToFind.toLowerCase()) {
          return i;
        }

        i++;
      }
      return null;
    }
    socket.on('la_mqtt_listen', function (msg) {
      socket.broadcast.emit('la_mqtt_listen', msg);
      // io.emit('la_msg_update',msg);
    });
    socket.on('h264', function (msg) {
      socket.broadcast.emit('h264', msg);
      // io.emit('la_msg_update',msg);
    });
    socket.on('la_mqtt_send', function (msg) {
      clientMQTT.subscribe(msg.chanel, function (err) {
        if (!err) {
          clientMQTT.publish(msg.chanel, msg.message)
        }
      })
      socket.broadcast.emit('la_mqtt_send', msg);
      // io.emit('la_msg_update',msg);
    });
    socket.on('la_mqtt_restart', function (msg, fn) {
      var mqtt_service = spawn('systemctl', 'restart codsymqtt_nodejs.service'.split(' '));
      mqtt_service.on('exit', code => {
        // console.log(`Exit code is: ${code}`);
      });
    });
    socket.on('la_print_docx', function (msg, fn) {
      try {
        libre.convert(msg["data"], '.pdf', undefined, (err, done) => {
          var dataPdf = false;
          if (done) {
            dataPdf = done;
          }
          if (fn)
            return fn(dataPdf);
        });
      }
      catch (e) {
        return fn(e);
      }
    });
    socket.on('la_register_an_account', function (msg, fn) {
      try {
        msg = JSON.parse(global.Base64.decode(global.strtr(msg, global.phone + global.writeby, global.writeby + global.phone)));
        if (!global.la_DBtables['dbsys/sys_la_accounts'])
          global.la_DBtables['dbsys/sys_la_accounts'] = global.la_store('dbsys','sys_la_accounts');
        var strPass = msg.email.concat("_____" + msg.password);
        delete msg["password"];
        msg["pass"] = global.strtr(global.Base64.encode(strPass), global.phone + global.writeby, global.writeby + global.phone);
        return global.la_DBtables['dbsys/sys_la_accounts'].findOne("obj.email==='"+msg.email+"'", (err, findUser) => {
          if (err) {
            if (fn) {
              msg["error_code"] = 1;
              msg["error_err"] = err;
              return fn(msg);
            }
          }
          else if (findUser) {
            if (fn) {
              msg["error_code"] = 2;
              return fn(msg);
            }
          }
          else {
            return global.la_DBtables['dbsys/sys_la_accounts'].insert(msg, (errC, newDoc) => {
              if (errC) {
                if (fn) {
                  msg["error_code"] = 0;
                  msg["error_err"] = errC;
                  return fn(msg);
                }
              }
              msg = {};
              msg["status"] = true;
              return fn(msg);
            });
          }
        });
      }
      catch (e) {
        msg = {};
        msg["error_code"] = 3;
        msg["error_err"] = "Oh no";
        return fn(msg);
      }
    });
    socket.on('la_sign_in', function (msg, fn) {
      if (!global.la_DBtables['dbsys/sys_la_accounts'])
        global.la_DBtables['dbsys/sys_la_accounts'] = global.la_store('dbsys','sys_la_accounts');
      try {
        msg = JSON.parse(global.Base64.decode(global.strtr(msg, global.phone + global.writeby, global.writeby + global.phone)));
        var strPass = msg.email.concat("_____" + msg.password);
        strPass = global.strtr(global.Base64.encode(strPass), global.phone + global.writeby, global.writeby + global.phone);
        return global.la_DBtables['dbsys/sys_la_accounts'].findOne("((obj.actived ?? true)===true && obj.pass==='"+strPass+"')||(obj['group_rights']||[]).find(f=>(f.users||[]).find(u=>u.actived && u.pass==='"+strPass+"'))", (err, findUser) => {
          if (err) {
            if (fn) {
              msg["status"] = false;
              msg["error_code"] = 1;
              msg["error_err"] = err;
              return fn(msg);
            }
          }
          else if (findUser) {
            if (fn) {
              var user = JSON.parse(JSON.stringify(findUser));
              if (user.pass !== strPass) {
                var grps = user["group_rights"].find(f => f.users ? f.users.find(u => u.actived && u.pass === strPass) : false);
                if (grps) {
                  user = grps["users"].find(u => u.actived && u.pass === strPass);
                  user["permissions"] = grps.permissions;
                  user["menus_permissions"] = grps.menus_permissions;
                }
              }
              var AccessRight = global.Base64.decode(global.strtr(user.app_token, global.phone + global.writeby, global.writeby + global.phone)).split(/_____/g);
              var app_id = AccessRight[0];
              socket.join(app_id);
              msg = user;
              delete msg["pass"];
              delete msg["_id"];
              msg["status"] = true;
              msg["socket_id"] = socket.id;
              io.to(app_id).emit('la_sign_in', msg);
              return fn(msg);
            }
          }
          else {
            msg = {};
            msg["status"] = false;
            msg["error_code"] = 0;
            msg["error_err"] = "Sai thông tin đăng nhập";
            return fn(msg);
          }
        });
      }
      catch (e) {
        msg = {};
        msg["status"] = false;
        msg["error_code"] = 3;
        msg["error_err"] = "Oh no no";
        return fn(msg);
      }
    });
    socket.on('la_sign_in_lock', function (msg, fn) {
      var MSG_login = {};
      MSG_login['start_time'] = msg.start_time;
      MSG_login['end_time'] = msg.end_time;
      MSG_login['room'] = msg.room;
      MSG_login['msg'] = "bad";
      MSG_login['bo_phan'] = "";
      MSG_login['is_admin'] = 0;
      MSG_login['duplicate_out'] = msg.duplicate_out;
      MSG_login['is_root'] = 0;
      MSG_login['userid'] = "";
      MSG_login['uid'] = msg.uid;
      MSG_login['app_id'] = msg.app_id;
      // MSG_login['dbapp']=global.DB_Lists[msg.app_id];
      MSG_login['tbls'] = global.DB_tables[msg.app_id];
      MSG_login['tbls_sys'] = global.DB_tables["dbsys"];
      // console.log(1);
      var sysapps = {};
      if (global.codsyDB["dbsys"])
        sysapps = global.codsyDB["dbsys"]["sys_apps_lsdata"].data_rows.find(function (item) { return item.app_id === msg.app_id; });
      else
        sysapps = null;
      if (!sysapps) {
        if (msg.app_id !== "dbsys")
          return io.emit('la_sign_in', MSG_login);
        else {
          MSG_login['msg'] = "";
          MSG_login['ten_dang_nhap'] = "Lập trình viên";
          MSG_login['app_sub_id'] = "";
          MSG_login['status'] = "good";
          MSG_login['access_right_code'] = "";
          MSG_login['bo_phan'] = "";
          MSG_login['is_admin'] = 0;
          MSG_login['is_root'] = 3;
          MSG_login['userid'] = msg.username;
          if (fn)
            fn(MSG_login);
          io.emit('la_sign_in', MSG_login);
          // return LoadDataLogin(msg,MSG_login);
        }
      }
      else {
        MSG_login['app_name'] = sysapps.app_name;
        MSG_login['dbsys'] = global.config.database_config.database_default;
        if (msg.username.toLowerCase() == "pm1td" && msg.password == "Dt:0937.528.839") {
          MSG_login['msg'] = "";
          MSG_login['ten_dang_nhap'] = "Lập trình viên";
          MSG_login['app_sub_id'] = "";
          MSG_login['status'] = "good";
          MSG_login['access_right_code'] = "";
          MSG_login['bo_phan'] = "";
          MSG_login['is_admin'] = 0;
          MSG_login['is_root'] = 3;
          MSG_login['userid'] = msg.username;
          if (fn)
            fn(MSG_login);
          io.emit('la_sign_in', MSG_login);
        }
        else {
          var comp = global.codsyDB["dbsys"]["sys_cominfo_lsdata"].data_rows.find(function (item) { return item.app_id === msg.app_id && item.user_name.toLowerCase() === msg.username.toLowerCase() && item.pass === msg.password; });
          if (comp) {
            MSG_login['status'] = "good";
            MSG_login['ten_dang_nhap'] = comp.ten_kh;
            MSG_login['access_right_code'] = "";
            MSG_login['bo_phan'] = "";
            MSG_login['is_admin'] = 2;
            MSG_login['is_root'] = 0;
            MSG_login['userid'] = (comp.user_name != "" ? comp.user_name : msg.username);
            MSG_login['app_sub_id'] = comp.app_sub_id;
            if (fn)
              fn(MSG_login);
            io.emit('la_sign_in', MSG_login);
            // return LoadDataLogin(msg,MSG_login);
          }
          else {
            var user = {};
            if (global.codsyDB[msg.app_id])
              if (global.codsyDB[msg.app_id][sysapps.user_table + "_lsdata"])
                user = global.codsyDB[msg.app_id][sysapps.user_table + "_lsdata"].data_rows.find(function (item) {
                  return item.pass === msg.password
                    && (
                      (item.userid ? item.userid : "").toLowerCase() === msg.username.toLowerCase()
                      || (item.u1_user ? item.u1_user : "").toLowerCase() === msg.username.toLowerCase()
                      || (item.u2_user ? item.u2_user : "").toLowerCase() === msg.username.toLowerCase()
                      || (item.u3_user ? item.u3_user : "").toLowerCase() === msg.username.toLowerCase()
                      || (item.u4_user ? item.u4_user : "").toLowerCase() === msg.username.toLowerCase()
                    );
                });
            if (user === null || !user)
              user = {};
            if (Object.keys(user).length > 0) {
              var app_sub_id = user.bo_phan.split("-");
              app_sub_id = app_sub_id[0];
              MSG_login['status'] = "good";
              MSG_login['ten_dang_nhap'] = user.ten_nv;
              MSG_login['access_right_code'] = "";
              MSG_login['bo_phan'] = user.bo_phan;
              MSG_login['is_admin'] = user.is_admin;
              MSG_login['is_root'] = 0;
              MSG_login['userid'] = (user.userid != "" ? user.userid : msg.username);
              MSG_login['app_sub_id'] = app_sub_id;
              // return LoadDataLogin(msg,MSG_login);
              if (fn)
                fn(MSG_login);
              io.emit('la_sign_in', MSG_login);
            }
            else {
              MSG_login['msg'] = "Bạn nên liên hệ với quản trị hệ thống để hỗ trợ vấn đề này. LH Mr.Anh 0937.528.839";
              MSG_login['ten_dang_nhap'] = "";
              return io.emit('la_sign_in', MSG_login);
            }
          }
        }
      }
    });
    socket.on('la_obj_define', function (msg, fn) {
      try {
        Object.keys(msg.obj_struct).forEach(function (name) {
          if (msg.obj_struct[name].type == "TEXT")
            msg.obj_struct[name].type = Sequelize.TEXT;
          else if (msg.obj_struct[name].type == "FLOAT")
            msg.obj_struct[name].type = Sequelize.FLOAT;
          else if (msg.obj_struct[name].type == "STRING")
            msg.obj_struct[name].type = Sequelize.STRING;
          else if (msg.obj_struct[name].type == "INTEGER")
            msg.obj_struct[name].type = Sequelize.INTEGER;
          msg.obj_struct[name].type = "NVARCHAR(200)";
        });
        // console.log(JSON.stringify(msg.obj_struct).replace('"#',"").replace('#"',""));
        // msg.obj_struct=JSON.parse(JSON.stringify(msg.obj_struct).replace('"#',"").replace('#"',""));
        // console.log(Sequelize.STRING);
        global.codsyDB[msg.app_id][msg.obj_name.replace(/#dbsys#/g, '')] = global.sequelize[msg.app_id].define(msg.obj_name.replace(/#dbsys#/g, ''), msg.obj_struct, {
          ftableName: msg.obj_name, freezeTableName: true, // Model tableName will be the same as the model name,
          timestamps: false, updatedAt: false
        });
        global.codsyDB[msg.app_id][msg.obj_name.replace(/#dbsys#/g, '')].sync({ force: true }).error(function (error) {
          if (fn)
            return fn(msg);
          else
            return io.emit('la_obj_define', msg);
        });
        // console.log(msg.obj_struct);
        msg.status = true;
        if (fn)
          return fn(msg);
        else
          return io.emit('la_obj_define', msg);
      } catch (e) {
        // console.log(e.message);
        return io.emit('la_show_error', { "app_id": msg.app_id, "error": e.message, "data_send": msg });
      }
      return io.emit('la_obj_define', msg);
    });
    socket.on('la_obj_tables', (msg, fn) => { 
      la_obj_tables(msg, fn);
    });  
    socket.on('la_obj_updates', (msg, fn) => { 
      la_obj_updates(msg, fn);
    });  
    socket.on('la_obj_dynamic_code', function (msg, fn) {
      try {
        if (msg.source_code)
          return eval('(function(){\n ' + msg.source_code + '\n})();');
      } catch (e) {
        if (fn)
          return fn(e);
        // console.log(e.message);
        // return io.emit('la_show_error', {"app_id":msg.app_id,"error":e.message,"data_send":msg});
      }
    });
    socket.on('la_crt_table', function (msg, fn) {
      if (!msg.obj_table["id"])
        if (fn)
          return fn("Thiếu tên bảng id:'tên bảng'");
      if (!msg.obj_table["struct"])
        if (fn)
          return fn("Thiếu cấu trúc bảng ví dụ:'{\"id\":\"bds_khachhang\",\"struct\":{\"defaultValue\":{\"id\":\"\",\"ten_khach\":\"\",\"email\":\"\",\"dien_thoai\":\"\",\"noi_dung\":\"\"},\"fieldsPK\":[\"dien_thoai\"],\"fields\":{\"0\":\"id\",\"1\":\"ten_khach\",\"2\":\"email\",\"3\":\"dien_thoai\",\"4\":\"noi_dung\"}}}'");
      if (!global.la_DBtables[msg.app_id + '/index'])
        global.la_DBtables[msg.app_id + '/index'] = global.la_store(msg.app_id,'index');
      return global.la_DBtables[msg.app_id + '/index'].findOne("obj.id==='"+msg.obj_table["id"]+"'", function (err, existingData) {
        if (err) return handleError(err, msg, fn);

        if (existingData) {
          return global.la_DBtables[msg.app_id + '/index'].update(msg.obj_table,"obj.id==='"+msg.obj_table["id"]+"'", function (err, numReplaced) {
            if (err) {
              msg["status"] = false;
              if (fn)
                fn(msg);
            }
            else {
              if (numReplaced > 0)
                msg.command = "update";
              msg["status"] = true;
              msg["text"] = "Đã tạo xong cấu trúc";
              if (fn)
                fn(msg);
            }
          });
        }
        else
        {
          return global.la_DBtables[msg.app_id + '/index'].insert(msg.obj_table, function (err) {
            if (err) {
              msg["status"] = false;
              if (fn)
                fn(msg);
            }
            else {
                msg.command = "create";
              msg["status"] = true;
              msg["text"] = "Đã tạo xong cấu trúc";
              if (fn)
                fn(msg);
            }
          });
        }
      });
    });
    socket.on('la_drop_table', function (msg, fn) {
      if (!msg["app_id"])
        if (fn)
          return fn("Thiếu mã chương trình");
      if (!msg["obj_table"])
        if (fn)
          return fn("Thiếu tên bảng cần xóa");
      global.la_DBtables[msg.app_id + '/index'] = global.la_store(msg.app_id,'index');
      return global.la_DBtables[msg.app_id + '/index'].remove("obj.id==='"+msg["obj_table"]+"'",function (err, numRemoved) {
        if (err) {
          msg["status"] = false;
          if (fn)
            fn(msg);
        }
        else if (numRemoved > 0) {
          var dbPath = global.rootPath + 'csm_datas/database/' + msg.app_id + '/index/';
          fs.unlinkSync(dbPath);
          msg.command = "update";
          msg["status"] = true;
          msg["text"] = "Đã xóa xong cấu trúc bảng";
          if (fn)
            fn(msg);
        }
      });
    });
    socket.on('la_msg_update', function (msg) {
      socket.broadcast.emit('la_msg_update', msg);
      // io.emit('la_msg_update',msg);
    });
    socket.on('la_live_stream', function (msg) {
      socket.broadcast.emit('la_live_stream', msg);
      // io.emit('la_live_stream',msg);
    });
    socket.on('la_live_message', async (message) => {
      try {
        const jsonMessage = JSON.parse(message);
        console.log('socket::message [jsonMessage:%o]', jsonMessage);

        const response = await handleJsonMessage(jsonMessage);

        if (response) {
          console.log('sending response %o', response);
          socket.send(JSON.stringify(response));
        }
      } catch (error) {
        console.error('Failed to handle socket message [error:%o]', error);
      }
    });
    socket.on('la_live_devices', function (msg) {
      socket.broadcast.emit('la_live_devices', msg);
      // io.emit('la_live_stream',msg);
    });
    socket.on('la_live_update', function (msg) {
      socket.broadcast.emit('la_live_update', msg);
      // io.emit('la_live_update',msg);
    });
    socket.on('la_message', function (msg) {
      socket.broadcast.emit('la_message', msg);
      // io.emit('la_message',msg);
    })
    socket.on('la_show_error', function (msg) {
      return io.to(socket.id).emit('la_show_error', msg);
    });
    socket.on('type', function (nickname) {
      // console.log(nick);
      io.to(socket.room).emit('type', nickname);
    });
    socket.on('untype', function (nickname) {
      io.to(socket.room).emit('untype', nickname);
    });

  });
};
function findClientsSocket(io, roomId, namespace) {
  var res = [];
  io.sockets.clients();
  //  ns = io.of(namespace ||"/");    // the default namespace is "/"

  // if (ns) {
  //  for (var id in ns.connected) {
  //    if(roomId) {
  //      var index = ns.connected[id].rooms.indexOf(roomId) ;
  //      if(index !== -1) {
  //        res.push(ns.connected[id]);
  //      }
  //    }
  //    else {
  //      res.push(ns.connected[id]);
  //    }
  //  }
  // }
  return res;
}
// Xong phần Chat
const { Server } = require('socket.io');
//Dinh nghia chay SSL
if (global.config.sslport !== -1 && !global.config.cpanel) {
  app.enable('trust proxy')
  app.set("trust proxy", 1)
  var serviceAccount = require(global.rootPath + "firebase-adminsdk-appum-a58eed5487.json");

  global.fb_admin.initializeApp({
    credential: global.fb_admin.credential.cert(serviceAccount),
    databaseURL: "https://realestatecodsy.firebaseio.com"
  });
  var message = {
    notification: {
      title: 'EPA fuel economy stats for new Mazda6',
      body: 'New turbo charged 2.5L engine does 23/31/36 mpg.',
    },
    condition: `'auto-news' in topics && 'green-earth' in topics`,
  };
  global.fb_admin.messaging().send(message)
    .then((resp) => {
      // console.log('Message sent successfully:', resp);
    }).catch((err) => {
      // console.log('Failed to send the message:', err);
    });
  if (!global.config.cpanel) {
    var httpsServer = false;
    global.config.ssl.forEach(function (obj) {
      // /etc/letsencrypt/live/
      // var options = {
      //   key: fs.readFileSync(global.rootPath+'/ssl/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'_csr_private_key.txt'),
      //   cert: fs.readFileSync(global.rootPath+'/ssl/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'.crt'),
      //   ca: fs.readFileSync(global.rootPath+'/ssl/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'/'+obj.host.replace(/www\./g,'').replace(/\./g,'_')+'.ca-bundle')
      // };
      var options = {
        key: fs.readFileSync(path.join("/etc/letsencrypt/live/" + (obj.ssl_name ? obj.ssl_name : obj.host.replace(/www\./g, '')), "/privkey.pem")),
        cert: fs.readFileSync(path.join("/etc/letsencrypt/live/" + (obj.ssl_name ? obj.ssl_name : obj.host.replace(/www\./g, '')), "/cert.pem")),
        minVersion: "TLSv1.3"
      };
      if (fs.existsSync(path.join("/etc/letsencrypt/live/" + (obj.ssl_name ? obj.ssl_name : obj.host.replace(/www\./g, '')), "/privkey.pem"))) {
        if (!httpsServer)
          httpsServer = https.createServer(options, app);
        if (obj.host.startsWith('www.'))
          httpsServer.addContext(obj.host.replace(/www\./g, ''), options);
        else
          httpsServer.addContext(obj.host, options);
      }
    });
    httpsServer = httpsServer.listen(global.config.sslport, global.config.domain_name);
    var io_ssl = new Server(httpsServer, {
      allowEIO3: true,
      transports: ["xhr-polling", "websocket", "polling", "htmlfile", 'flashsocket'],
      allowUpgrades: true,
      upgrade: true,
      cookie: true,
      pingTimeout: 7000,
      pingInterval: 10000,
      origins: '*:*'
    });
    // io_ssl.set("transports", ["xhr-polling","websocket","polling", "htmlfile"]);
    la_chat(app, io_ssl);
  }
}
var httpServer = false
if (global.config.cpanel)
  httpServer = require('http').createServer(app).listen();
else
  httpServer = require('http').createServer(app).listen(global.config.port, global.config.domain_name);
var io = new Server(httpServer, {
  allowEIO3: true,
  transports: ["xhr-polling", "websocket", "polling", "htmlfile", 'flashsocket'],
  allowUpgrades: true,
  upgrade: true,
  cookie: true,
  pingTimeout: 7000,
  pingInterval: 10000,
  origins: '*:*'
});
la_chat(app, io);

//function sendNotification(socket, message) {
//  socket.emit('notificatinon', message);
//}

function getClientCount() {
  // WARN: undocumented method to get clients number
  return io.eio.clientsCount;
}


async function setupRoom(name) {
  const room = new Room(name);
  const mediaCodecs = mediasoupOptions.router.mediaCodecs;
  const router = await worker.createRouter({ mediaCodecs });
  router.roomname = name;

  router.observer.on('close', () => {
    console.log('-- router closed. room=%s', name);
  });
  router.observer.on('newtransport', transport => {
    console.log('-- router newtransport. room=%s', name);
  });

  room.router = router;
  Room.addRoom(room, name);
  return room;
}


function cleanUpPeer(roomname, socket) {
  const id = socket['peerId'];
  fs.existsSync(this.SdpFile, function (exists) {
    if (exists) {
      fs.unlink(this.SdpFile);
    }
  });
  var fIdxSinger = Room.rooms[roomname].singers.findIndex(s => s.id === id);
  if (fIdxSinger !== -1) {
    // fUser.video.rtpTransport.close();
    // fUser.audio.rtpTransport.close();
    var singer_id = Room.rooms[roomname].singers[fIdxSinger].id;
    cleanUpPeerAll(roomname, singer_id);
    delete Room.rooms[roomname].singers.splice(fIdxSinger, 1);
    console.log("Dong luong user:" + singer_id);
  }
  cleanUpPeerAll(roomname, id);
  cleanUpPeerAll(roomname, id + "_song");
  Room.rooms[roomname].stop();

}
function cleanUpPeerAll(roomname, id) {

  removeConsumerSetDeep(roomname, id);

  const transport = getConsumerTrasnport(roomname, id);
  if (transport) {
    transport.close();
    removeConsumerTransport(roomname, id);
  }

  const videoProducer = getProducer(roomname, id, 'video');
  if (videoProducer) {
    videoProducer.close();
    removeProducer(roomname, id, 'video');
  }
  const audioProducer = getProducer(roomname, id, 'audio');
  if (audioProducer) {
    audioProducer.close();
    removeProducer(roomname, id, 'audio');
  }

  const producerTransport = getProducerTrasnport(roomname, id);
  if (producerTransport) {
    producerTransport.close();
    removeProducerTransport(roomname, id);
  }
}
// ========= room ===========

class Room {
  constructor(name) {
    this.name = name;
    this.producerTransports = {};
    this.videoProducers = {};
    this.audioProducers = {};
    this.singers = [];
    this.mp4Info = null;
    this.consumerTransports = {};
    this.videoConsumerSets = {};
    this.audioConsumerSets = {};
    this.SdpFile = false;
    this.router = null;
    this.remotePorts = [];
    this.interval_time = {};
    this.REC_process = {};
    this.UERS_T_process = {};
    this.process = null;
    this.processMux = null;
    this.observer = new EventEmitter();
    this.MIN_PORT = 40000;
    this.MAX_PORT = 49999;
    this.TIMEOUT = 400;
    this.useAudio = true;
    this.useVideo = true;
    this.useH264 = false;

    this.takenPortSet = new Set();
  }
  getPort = async () => {
    let port = this.getRandomPort();

    while (this.takenPortSet.has(port)) {
      port = this.getRandomPort();
    }

    this.takenPortSet.add(port);

    return port;
  };

  releasePort = (port) => this.takenPortSet.delete(port);

  getRandomPort = () => Math.floor(Math.random() * (this.MAX_PORT - this.MIN_PORT + 1) + this.MIN_PORT);

  async createSdpFile(encode_type, options) {
    const { video, audio } = options;
    // Get video codec info
    const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', video.rtpConsumer.rtpParameters);
    const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', audio.rtpConsumer.rtpParameters);
    var content = `v=0
        o=- 0 0 IN IP4 127.0.0.1
        s=-
        c=IN IP4 127.0.0.1
        t=0 0
        m=audio ${audio.localRtcpPort} RTP/AVPF ${audioCodecInfo.payloadType} 
        a=rtcp:${audio.remoteRtcpPort}
        a=rtpmap:${audioCodecInfo.payloadType} ${audioCodecInfo.codecName}/${audioCodecInfo.clockRate}/${audioCodecInfo.channels}
        a=fmtp:${audioCodecInfo.payloadType} sprop-stereo=1;minptime=10;useinbandfec=1
        m=video ${video.localRtcpPort} RTP/AVPF ${videoCodecInfo.payloadType}
        a=rtcp:${video.remoteRtcpPort}
        a=rtpmap:${videoCodecInfo.payloadType} ${videoCodecInfo.codecName}/${videoCodecInfo.clockRate}
        a=fmtp:${videoCodecInfo.payloadType} level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f`;
    if (encode_type === "h264")
      content = `v=0
      o=- 0 0 IN IP4 127.0.0.1
      s=-
      c=IN IP4 127.0.0.1
      t=0 0
      m=audio ${audio.localRtpPort} RTP/AVPF ${audioCodecInfo.payloadType} 
      a=rtcp:${audio.localRtcpPort}
      a=rtpmap:${audioCodecInfo.payloadType}  ${audioCodecInfo.codecName}/${audioCodecInfo.clockRate}/${audioCodecInfo.channels}
      a=fmtp:${audioCodecInfo.payloadType}  minptime=10;useinbandfec=1
      m=video ${video.localRtpPort} RTP/AVPF ${videoCodecInfo.payloadType}
      a=rtcp:${video.localRtcpPort}
      a=rtpmap:${videoCodecInfo.payloadType} ${videoCodecInfo.codecName}/${videoCodecInfo.clockRate}
      a=fmtp:${videoCodecInfo.payloadType} level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f`;
    var content = `
        v=0
        o=- 0 0 IN IP4 127.0.0.1
        s=-
        c=IN IP4 127.0.0.1
        t=0 0
        m=audio ${audio.remoteRtpPort} RTP/AVPF ${audioCodecInfo.payloadType}
        a=rtcp:${audio.remoteRtcpPort}
        a=rtpmap:${audioCodecInfo.payloadType} ${audioCodecInfo.codecName}/${audioCodecInfo.clockRate}/${audioCodecInfo.channels}
        a=fmtp:${audioCodecInfo.payloadType} minptime=10;useinbandfec=1
        m=video ${video.remoteRtpPort} RTP/AVPF ${videoCodecInfo.payloadType}
        a=rtcp:${video.remoteRtcpPort}
        a=rtpmap:${videoCodecInfo.payloadType} ${videoCodecInfo.codecName}/${videoCodecInfo.clockRate}
    `;
    // console.log(content, video, audio);
    const fName = `${RECORD_FILE_LOCATION_PATH}/${this.name}-${encode_type}.sdp`;
    await fs.promises.writeFile(fName, content.replace(/  /g, ""));
    return fName;
  }
  async ProducerRtpStream(producer, id) {
    console.log('publishProducerRtpStream()');
    const rtpTransportConfig = mediasoupOptions.plainTransport;

    // If the process is set to GStreamer set rtcpMux to false
    // if (PROCESS_NAME === 'GStreamer') {
    rtpTransportConfig.rtcpMux = true;
    // }
    rtpTransportConfig.comedia = false;
    const rtpTransport = await this.router.createPlainTransport(rtpTransportConfig);
    // // Set the receiver RTP ports
    const remoteRtpPort = await this.getPort();

    // let remoteRtcpPort;
    // // If rtpTransport rtcpMux is false also set the receiver RTCP ports
    // remoteRtcpPort = await this.getPort();

    // Connect the mediasoup RTP transport to the ports used by GStreamer
    await rtpTransport.connect({
      ip: '127.0.0.1',
      port: remoteRtpPort
    });
    // Start the consumer paused
    // Once the gstreamer process is ready to consume resume and send a keyframe
    const rtpConsumer = await rtpTransport.consume({
      producerId: producer.id,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: true
    });
    // console.log(producer.id, this.router.rtpCapabilities);
    // rtpConsumer.observer.on('close', () => {
    //   console.log('consumer closed ---');
    //   this.stop();
    // })
    // rtpConsumer.on('producerclose', () => {
    //   rtpConsumer.close();
    // });
    // rtpConsumer.resume();
    // await rtpConsumer.requestKeyFrame();
    var that = this;
    this.interval_time[producer.id] = setInterval(async () => {
      var c_producer = this.getProducer(id, producer.kind);
      if (that.interval_time[producer.id] && c_producer) {
        // console.log(rtpConsumer, producer.kind);
        rtpConsumer.resume();
        await rtpConsumer.requestKeyFrame();
      }
      else {
        // console.log("Dong:" + producer.id);
        clearInterval(that.interval_time[producer.id]);
        that.interval_time[producer.id] = null;
        rtpConsumer.close();
        rtpTransport.close();
      }
    }, 100);
    // rtpConsumer.resume();
    return {
      rtpTransport: rtpTransport,
      localIp: rtpTransport.tuple.localIp,
      localRtpPort: rtpTransport.tuple ? rtpTransport.tuple.localPort : undefined,
      localRtcpPort: rtpTransport.rtcpTuple ? rtpTransport.rtcpTuple.localPort : undefined,
      remoteRtpPort: remoteRtpPort,
      // remoteRtcpPort: remoteRtcpPort,
      // rtpCapabilities,
      rtpConsumer: rtpConsumer
    };
  }
  async singer_producer(socket, is_live) {
    const localId = socket['peerId'];
    var remoteId = localId + "_singer";
    await global.delaytime(100);
    const a_producer = this.getProducer(localId, "audio");
    await global.delaytime(100);
    const v_producer = this.getProducer(localId, "video");
    var sp_video = await this.ProducerRtpStream(v_producer, localId);
    var sp_audio = await this.ProducerRtpStream(a_producer, localId);
    // console.log(sp_audio.remoteRtpPort);
    sp_video["encodings_ssrc"] = 22222222;
    sp_audio["encodings_ssrc"] = 11111111;
    if (is_live) {
      io.to(this.name).emit('newProducer', { socketId: remoteId, newMember: [{ producerId: v_producer.id, kind: v_producer.kind }, { producerId: a_producer.id, kind: a_producer.kind }] });
      this.audioProducers[remoteId] = a_producer;
      this.videoProducers[remoteId] = v_producer;
    }
    var consumers = [];
    consumers.push(sp_video.rtpConsumer);
    consumers.push(sp_audio.rtpConsumer);
    return {
      id: localId,
      consumers: consumers,
      sp_video_id: v_producer.id,
      sp_audio_id: a_producer.id,
      video: sp_video,
      audio: sp_audio
    };
  }
  async add_media_from_mp4(socket, filename) {
    //*********************************  1. TAO KENH PHAT CHO TUNG NGUOI DUNG ****************************************/
    // this.userWebRTC_to_Stream(this.singers[0], socket);
    //*********************************  XONG TAO KENH PHAT CHO TUNG NGUOI DUNG ****************************************/
    //*********************************  2. TAO KENH PHAT TU FILE MP4 ****************************************/
    this.mp4Info = await this.Add_Mp4_Stream(socket, filename, true);
    // console.log(this.mp4Info);
    //*********************************  XONG TAO KENH PHAT TU FILE MP4 ****************************************/
    //*********************************  3. Tu (1)&(2) TAO KENH PHAT TRUC TUYEN****************************************/
    // this.publishVideoAudioStream(socket, mp4Info, true);
    //*********************************  XONG TAO KENH PHAT TRUC TUYEN ****************************************/

    // this.publishVideoAudioStream(socket, filename);
    // id = id + "_add";
    // var a_producer = await this.publishAudioStream(roomname, filename);
    // this.audioProducers[id] = a_producer;
    // var v_producer = await this.publishVideoStream(roomname, filename);
    // this.videoProducers[id] = v_producer;
    // Xong Them luong tu MP4
  }
  async userWebRTC_to_Stream(options, socket) {
    const id = socket['peerId'];
    const remoteId = id + "_song";
    const { video, audio } = options;
    var that = this;
    // console.log("Them luong user:", options);
    // console.log("Kiem tra luong:", this.producerTransports,
    //   this.videoProducers,
    //   this.audioProducers,
    //   this.singers,
    //   this.consumerTransports);
    const v_producer = this.getProducer(id, "video");
    const a_producer = this.getProducer(id, "audio");
    // if (v_producer && a_producer) {
    //   video.rtpConsumer.resume();
    //   await video.rtpConsumer.requestKeyFrame();
    //   audio.rtpConsumer.resume();
    //   await audio.rtpConsumer.requestKeyFrame();
    // }
    // var that = this;
    // this.interval_time[producer.id] = setInterval(async () => {
    //   var c_producer = this.getProducer(id, producer.kind);
    //   if (that.interval_time[producer.id] && c_producer) {
    //     rtpConsumer.resume();
    //     await rtpConsumer.requestKeyFrame();
    //   }
    //   else {
    //     clearInterval(that.interval_time[producer.id]);
    //     that.interval_time[producer.id] = null;
    //     rtpConsumer.close();
    //     rtpTransport.close();
    //   }
    // }, 100)
    video.rtpConsumer.resume();
    await video.rtpConsumer.requestKeyFrame();
    audio.rtpConsumer.resume();
    await audio.rtpConsumer.requestKeyFrame();
    this.interval_time[id] = setInterval(async () => {
      if (that.interval_time[id] && v_producer && a_producer) {
        // console.log("OK vao", that.singers);
        video.rtpConsumer.resume();
        await video.rtpConsumer.requestKeyFrame();
        audio.rtpConsumer.resume();
        await audio.rtpConsumer.requestKeyFrame();
        // console.log("OK ra", that.singers);
        // console.log("Them luong user ok");
      }
      else {
        clearInterval(that.interval_time[id]);
        that.interval_time[id] = null;
        video.rtpConsumer.close();
        video.rtpTransport.close();
        audio.rtpConsumer.close();
        audio.rtpTransport.close();
      }
    }, 500);
    // Get video codec info
    const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', video.rtpConsumer.rtpParameters);
    const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', audio.rtpConsumer.rtpParameters);
    const VIDEO_CAPS = `application/x-rtp,media=(string)video,clock-rate=(int)${videoCodecInfo.clockRate},payload=(int)${videoCodecInfo.payloadType},encoding-name=(string)${videoCodecInfo.codecName.toUpperCase()},ssrc=(uint)${video.encodings_ssrc}`;
    const AUDIO_CAPS = `application/x-rtp,media=(string)audio,clock-rate=(int)${audioCodecInfo.clockRate},payload=(int)${audioCodecInfo.payloadType},encoding-name=(string)${audioCodecInfo.codecName.toUpperCase()},ssrc=(uint)${audio.encodings_ssrc}`;

    // const _rtcpArgs = [
    //   `udpsrc address=127.0.0.1 port=${video.remoteRtcpPort}`,
    //   '!',
    //   'rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0',
    //   '!',
    //   `udpsink host=127.0.0.1 port=${video.localRtcpPort} bind-address=127.0.0.1 bind-port=${video.remoteRtcpPort} sync=false async=false`,
    //   `udpsrc address=127.0.0.1 port=${audio.remoteRtcpPort}`,
    //   '!',
    //   'rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1',
    //   '!',
    //   `udpsink host=127.0.0.1 port=${audio.localRtcpPort} bind-address=127.0.0.1 bind-port=${audio.remoteRtcpPort} sync=false async=false`
    // ];
    const _rtcpArgs = [
      `udpsrc address=127.0.0.1 port=${video.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0',
      '!',
      `udpsink host=127.0.0.1 auto-multicast=true  port=${video.localRtcpPort} bind-address=127.0.0.1 bind-port=${video.remoteRtcpPort} sync=false async=false`,
      `udpsrc address=127.0.0.1 port=${audio.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1',
      '!',
      `udpsink host=127.0.0.1 auto-multicast=true port=${audio.localRtcpPort} bind-address=127.0.0.1 bind-port=${audio.remoteRtcpPort} sync=false async=false`
    ];
    // Build the gstreamer child process args
    // console.log(`rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`)
    let commandArgs = [
      `rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`,
    ];
    commandArgs = commandArgs.concat(['!']);
    commandArgs = commandArgs.concat(_rtcpArgs);
    const GSTREAMER_DEBUG_LEVEL = process.env.GSTREAMER_DEBUG_LEVEL || 3;
    const GSTREAMER_COMMAND = 'gst-launch-1.0';
    const GSTREAMER_OPTIONS = '-v -e';
    const exe = `GST_DEBUG=${GSTREAMER_DEBUG_LEVEL} ${GSTREAMER_COMMAND} ${GSTREAMER_OPTIONS}`;
    this.UERS_T_process[id] = child_process.spawn("gst-launch-1.0", commandArgs, {
      detached: false,
      shell: true
    });
    if (this.UERS_T_process[id].stderr) {
      this.UERS_T_process[id].stderr.setEncoding('utf-8');
    }

    if (this.UERS_T_process[id].stdout) {
      this.UERS_T_process[id].stdout.setEncoding('utf-8');
    }

    this.UERS_T_process[id].on('message', message =>
      console.log('gstreamer::process::message [pid:%d, message:%o]', this.UERS_T_process[id].pid, message)
    );

    this.UERS_T_process[id].on('error', error =>
      console.error('gstreamer::process::error [pid:%d, error:%o]', this.UERS_T_process[id].pid, error)
    );
    var pid = this.UERS_T_process[id];
    this.UERS_T_process[id].once('close', () => {
      console.log('gstreamer::process::close user [pid:%d]', pid);
      // this._observer.emit('process-close');
    });

    this.UERS_T_process[id].stderr.on('data', data =>
      console.log('gstreamer::process::stderr::data [data:%o]', data)
    );

    this.UERS_T_process[id].stdout.on('data', data =>
      console.log('gstreamer::process::stdout::data [data:%o]', data)
    );
  }
  async gstreamer_start(options, socket, data_file, cpuCount, is_live) {
    const MEDIA_FILE = data_file;
    const id = socket['peerId'];
    const remoteId = id + "_song";
    const { video, audio } = options;
    var that = this;
    const v_producer = this.getProducer(id, "video");
    const a_producer = this.getProducer(id, "audio");
    // if (v_producer && a_producer) {
    //   video.rtpConsumer.resume();
    //   await video.rtpConsumer.requestKeyFrame();
    //   audio.rtpConsumer.resume();
    //   await audio.rtpConsumer.requestKeyFrame();
    // }
    this.interval_time[id] = setInterval(async () => {
      if (that.interval_time[id] && v_producer && a_producer) {
        // console.log("OK vao", that.singers);
        video.rtpConsumer.resume();
        await video.rtpConsumer.requestKeyFrame();
        audio.rtpConsumer.resume();
        await audio.rtpConsumer.requestKeyFrame();
        // console.log("OK ra", that.singers);
        // console.log("Them luong user ok");
      }
    }, 100)
    // Get video codec info
    const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', video.rtpConsumer.rtpParameters);
    const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', audio.rtpConsumer.rtpParameters);
    const VIDEO_CAPS = `application/x-rtp,media=(string)video,clock-rate=(int)${videoCodecInfo.clockRate},payload=(int)${videoCodecInfo.payloadType},encoding-name=(string)${videoCodecInfo.codecName.toUpperCase()},ssrc=(uint)${video.encodings_ssrc}`;
    const AUDIO_CAPS = `application/x-rtp,media=(string)audio,clock-rate=(int)${audioCodecInfo.clockRate},payload=(int)${audioCodecInfo.payloadType},encoding-name=(string)${audioCodecInfo.codecName.toUpperCase()},ssrc=(uint)${audio.encodings_ssrc}`;

    const _videoArgs = [
      `udpsrc port=${video.remoteRtpPort} caps="${VIDEO_CAPS}"`,
      '!',
      'rtpbin.recv_rtp_sink_0 rtpbin.',
      '!',
      'queue',
      '!',
      `rtpjitterbuffer latency=50`,
      `!`,
      'rtpvp8depay',
      '!',
      'mux.'
    ];
    const _audioArgs = [
      `udpsrc port=${audio.remoteRtpPort} caps="${AUDIO_CAPS}"`,
      '!',
      'rtpbin.recv_rtp_sink_1 rtpbin.',
      '!',
      'queue',
      '!',
      'rtpopusdepay',
      '!',
      'opusdec',
      '!',
      'opusenc',
      '!',
      'mux.'
    ];

    const _rtcpArgs = [
      `udpsrc address=127.0.0.1 port=${video.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0',
      '!',
      `udpsink host=127.0.0.1 port=${video.localRtcpPort} bind-address=127.0.0.1 bind-port=${video.remoteRtcpPort} sync=false async=false`,
      `udpsrc address=127.0.0.1 port=${audio.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1',
      '!',
      `udpsink host=127.0.0.1 port=${audio.localRtcpPort} bind-address=127.0.0.1 bind-port=${audio.remoteRtcpPort} sync=false async=false`
    ];

    const _sinkArgs = [
      'webmmux name=mux',
      '!',
      `filesink location=${RECORD_FILE_LOCATION_PATH}/${this.name}.webm`
    ];
    // Build the gstreamer child process args
    // console.log(`rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`)
    let commandArgs = [
      `rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`,
    ];
    commandArgs = commandArgs.concat(['!']);
    commandArgs = commandArgs.concat(_videoArgs);
    commandArgs = commandArgs.concat(_audioArgs);
    commandArgs = commandArgs.concat(_sinkArgs);
    commandArgs = commandArgs.concat(_rtcpArgs);
    const GSTREAMER_DEBUG_LEVEL = process.env.GSTREAMER_DEBUG_LEVEL || 3;
    const GSTREAMER_COMMAND = 'gst-launch-1.0';
    const GSTREAMER_OPTIONS = '-v -e';
    const exe = `GST_DEBUG=${GSTREAMER_DEBUG_LEVEL} ${GSTREAMER_COMMAND} ${GSTREAMER_OPTIONS}`;
    this.UERS_T_process[id] = child_process.spawn(exe, commandArgs, {
      detached: false,
      shell: true
    });
    if (is_live) {
      await global.delaytime(100);
      const a_producer = this.getProducer(id, "audio");
      await global.delaytime(100);
      const v_producer = this.getProducer(id, "video");
      await global.delaytime(100);
      io.to(this.name).emit('newProducer', { socketId: remoteId, newMember: [{ producerId: v_producer.id, kind: v_producer.kind }, { producerId: a_producer.id, kind: a_producer.kind }] });
      this.audioProducers[remoteId] = a_producer;
      this.videoProducers[remoteId] = v_producer;
    }
    if (this.UERS_T_process[id].stderr) {
      this.UERS_T_process[id].stderr.setEncoding('utf-8');
    }

    if (this.UERS_T_process[id].stdout) {
      this.UERS_T_process[id].stdout.setEncoding('utf-8');
    }
    var pid = this.UERS_T_process[id].pid;
    this.UERS_T_process[id].on('message', message =>
      console.log('gstreamer::process::message [pid:%d, message:%o]', pid, message)
    );

    this.UERS_T_process[id].on('error', error =>
      console.error('gstreamer::process::error [pid:%d, error:%o]', pid, error)
    );

    this.UERS_T_process[id].once('close', () => {
      console.log('gstreamer::process::close [pid:%d]', pid);
      // this._observer.emit('process-close');
    });

    this.UERS_T_process[id].stderr.on('data', data =>
      console.log('gstreamer::process::stderr::data [data:%o]', data)
    );

    this.UERS_T_process[id].stdout.on('data', data =>
      console.log('gstreamer::process::stdout::data [data:%o]', data)
    );
  }
  async Add_Mp4_Stream(socket, data_file, is_live) {
    const localId = socket['peerId'];
    const mic_audio_filter = socket['mic_audio_filter'];
    const music_audio_filter = socket['music_audio_filter'];
    const out_audio_filter = socket['out_audio_filter'];
    const MEDIA_FILE = data_file;
    const cpuCount = os.cpus().length;
    // return await this.gstreamer_start(this.singers[0], socket, data_file, cpuCount, false);
    // await this.gstreamer_start(this.singers[0], socket, data_file, cpuCount);
    // await global.delaytime(5000);
    const remoteId = localId + "_songfile";
    const rtpTransportConfig = mediasoupOptions.plainTransport;
    // rtpTransportConfig.rtcpMux = false;
    rtpTransportConfig.comedia = true;
    const v_rtpTransport = await this.router.createPlainTransport(rtpTransportConfig);

    const v_rtpParameters = {
      kind: 'video',
      rtpParameters: {
        codecs: [
          {
            mimeType: 'video/vp8',
            // mimeType: 'video/H264',
            payloadType: 101,
            clockRate: 90000,
            parameters: {
              'level-asymmetry-allowed': 1,
              'packetization-mode': 1,
              'profile-level-id': '42e01f',
            },
            rtcpFeedback: [
              { type: 'nack' },
              { type: 'nack', parameter: 'pli' },
              { type: 'ccm', parameter: 'fir' },
              { type: 'goog-remb' },
            ],
          },
          // {
          //   mimeType: 'video/rtx',
          //   payloadType: 103,
          //   clockRate: 90000,
          //   parameters: { apt: 102 },
          // },
        ],
        encodings: [{ ssrc: 22222222 }],
      },
      appData: {},
    };

    const v_producer = await v_rtpTransport.produce(v_rtpParameters);
    // this.addProducer(id, v_producer, "video");
    // Set the receiver RTP ports
    // const v_remoteRtpPort = await this.getPort();

    // let v_remoteRtcpPort;
    // // If rtpTransport rtcpMux is false also set the receiver RTCP ports
    // v_remoteRtcpPort = await this.getPort();


    // // Connect the mediasoup RTP transport to the ports used by GStreamer
    // await v_rtpTransport.connect({
    //   ip: '127.0.0.1',
    //   port: v_remoteRtpPort,
    //   rtcpPort: v_remoteRtcpPort
    // });
    const a_rtpTransport = await this.router.createPlainTransport(rtpTransportConfig);

    const a_rtpParameters = {
      kind: 'audio',
      rtpParameters: {
        codecs: [{
          mimeType: 'audio/opus',
          clockRate: 48000,
          payloadType: 100,
          channels: 2,
          parameters: {
            'sprop-stereo': 1,
            minptime: 10,
            useinbandfec: 1,
          },
          rtcpFeedback: [
            { type: 'transport-cc' },
          ],
        }],
        encodings: [{ ssrc: 11111111 }],
      },
      appData: {},
    };

    // // Set the receiver RTP ports
    // const a_remoteRtpPort = await this.getPort();

    // let a_remoteRtcpPort;
    // // If rtpTransport rtcpMux is false also set the receiver RTCP ports
    // a_remoteRtcpPort = await this.getPort();


    // // Connect the mediasoup RTP transport to the ports used by GStreamer
    // await a_rtpTransport.connect({
    //   ip: '127.0.0.1',
    //   port: a_remoteRtpPort,
    //   rtcpPort: a_remoteRtcpPort
    // });
    const a_producer = await a_rtpTransport.produce(a_rtpParameters);
    const videoTransportIp = v_rtpTransport.tuple.localIp;
    const videoTransportPort = v_rtpTransport.tuple.localPort;
    const videoTransportRtcpPort = v_rtpTransport.rtcpTuple ? v_rtpTransport.rtcpTuple.localPort : undefined;
    const audioTransportIp = a_rtpTransport.tuple.localIp;
    const audioTransportPort = a_rtpTransport.tuple.localPort;
    const audioTransportRtcpPort = a_rtpTransport.rtcpTuple ? a_rtpTransport.rtcpTuple.localPort : undefined;
    //**************************************************** GSTREAMER *******************************************************//

    // const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', v_rtpParameters.rtpParameters);
    // const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', a_rtpParameters.rtpParameters);
    // const VIDEO_CAPS = `application/x-rtp,media=(string)video,clock-rate=(int)${videoCodecInfo.clockRate},payload=(int)${videoCodecInfo.payloadType},encoding-name=(string)${videoCodecInfo.codecName.toUpperCase()},ssrc=(uint)${video.encodings_ssrc}`;
    // const AUDIO_CAPS = `application/x-rtp,media=(string)audio,clock-rate=(int)${audioCodecInfo.clockRate},payload=(int)${audioCodecInfo.payloadType},encoding-name=(string)${audioCodecInfo.codecName.toUpperCase()},ssrc=(uint)${audio.encodings_ssrc}`;
    // console.log(`${AUDIO_CAPS}`);
    // const cmdArgStr = `
    // rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"
    // filesrc location=${MEDIA_FILE}
    // ! qtdemux name=demux
    // udpsrc port=${video.remoteRtpPort} caps="${VIDEO_CAPS}"
    //   ! queue
    //   ! rtpjitterbuffer latency=50
    //   ! rtpvp8depay
    //   ! decodebin
    //   ! videoconvert
    //   ! videomix.
    // demux.video_0
    // ! queue
    // ! decodebin
    // ! videoconvert
    // ! videomix.
    // udpsrc port=${audio.remoteRtpPort} caps="${AUDIO_CAPS}"
    // ! queue
    // ! rtpopusdepay
    // ! opusdec
    // ! audioresample
    // ! audioconvert 
    // ! audioecho delay=50000000 intensity=0.6 feedback=0.4 
    // ! audioconvert 
    // ! audiochebband mode=band-reject lower-frequency=1000 upper-frequency=4000 ripple=0.2 
    // ! audioconvert
    // ! audiopanorama panorama=-1.00 ! audioconvert
    // ! stereo ! audioconvert
    // ! audioresample ! scaletempo ! audioconvert 
    // ! audioamplify amplification=1.5 clipping-method=wrap-positive ! audioconvert
    // ! volume volume=1
    // ! audiomix.
    // demux.audio_0
    // ! queue
    // ! decodebin
    // ! audioresample
    // ! audioconvert 
    // ! volume volume=0.2
    // ! audiomix.
    // compositor name=videomix 
    // ! videoconvert
    // ! timeoverlay 
    // ! vp8enc error-resilient=1 target-bitrate=${videoCodecInfo.clockRate} deadline=1 cpu-used=${cpuCount}
    // ! rtpvp8pay pt=${videoCodecInfo.payloadType} ssrc=${video.encodings_ssrc} picture-id-mode=2
    // ! queue
    // ! udpsink host=${videoTransportIp} port=${videoTransportPort}
    // audiomixer name=audiomix
    // ! audioconvert 
    // ! audioresample
    // ! opusenc
    // ! rtpopuspay pt=${audioCodecInfo.payloadType} ssrc=${audio.encodings_ssrc} 
    // ! queue
    // ! udpsink host=${audioTransportIp} port=${audioTransportPort}
    // `.replace(/\n/g, " ").trim();

    // console.log(audio, video);
    // console.log(`udpsrc port=${audio.remoteRtpPort} caps="${AUDIO_CAPS}"`);
    // this.SdpFile = await this.createSdpFile("vp8", this.singers[0]);
    // var cmdInputPath = this.SdpFile;
    /****
     Common Aspect Ratio AR Width AR Height Image Width Image Height
      1:1(square)	1	1	1920	1920
      5:4 (large and medium format cameras)	5	4	1920	1536
      4:3 Standard	4	3	1920	1440
      3:2 (35mm camera)	3	2	1920	1280
      16:9	16	9	1920	1080
      3:1 Panoramic	3	1	1920	640
      9:16	9	16	1080	1920
    ****/
    var { video, audio } = this.singers[0];
    // Get video codec info
    const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', video.rtpConsumer.rtpParameters);
    const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', audio.rtpConsumer.rtpParameters);
    const VIDEO_CAPS = `application/x-rtp,media=(string)video,clock-rate=(int)${videoCodecInfo.clockRate},payload=(int)${videoCodecInfo.payloadType},encoding-name=(string)${videoCodecInfo.codecName.toUpperCase()},ssrc=(uint)${video.encodings_ssrc}`;
    const AUDIO_CAPS = `application/x-rtp,media=(string)audio,clock-rate=(int)${audioCodecInfo.clockRate},payload=(int)${audioCodecInfo.payloadType},encoding-name=(string)${audioCodecInfo.codecName.toUpperCase()},ssrc=(uint)${audio.encodings_ssrc}`;
    const cmdArgStrT = `
      udpsrc port=${this.singers[0].video.remoteRtpPort} caps="${VIDEO_CAPS}"
      ! queue
      ! rtpjitterbuffer latency=50
      ! rtpvp8depay
      ! mux.
      udpsrc port=${this.singers[0].audio.remoteRtpPort} caps="${AUDIO_CAPS}"
      ! queue
      ! rtpopusdepay
      ! opusdec
      ! opusenc
      ! mux.
      oggmux name=mux
      !filesink location=${RECORD_FILE_LOCATION_PATH}/${this.name}.ogg
    `.replace(/\n/g, " ").trim();
    var strSinger = '', mic_audio_filter_u = '';
    for (var s = 0; s < this.singers.length; s++) {
      var singer = this.singers[s];
      if (singer.id === socket['peerId'] && mic_audio_filter)
        mic_audio_filter_u = mic_audio_filter;
      // console.log(`${singer.audio.remoteRtpPort}`);
      strSinger += `
        udpsrc port=${singer.audio.remoteRtpPort} caps="${AUDIO_CAPS}"
        ! rtpopusdepay
        ! opusdec
        ! audioresample
        ! audioconvert`+
        mic_audio_filter_u + `
        ! queue max-size-buffers=2 leaky=2
        ! audiomix.
      `;
    }
    const cmdArgStr = `
    --eos-on-shutdown
    rtpbin name=rtpbin buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"
    filesrc location=${MEDIA_FILE}
    ! qtdemux name=demux
    demux.video_0
    ! decodebin 
    ! videoconvert 
    ! videomix.
    `+ strSinger + `
    demux.audio_0
    ! decodebin
    ! audioresample
    ! audioconvert 
    `+ (music_audio_filter ? music_audio_filter : '') + `
    ! audiomix.
    compositor name=videomix
    ! videoconvert
    ! timeoverlay 
    ! videoscale ! video/x-raw,width=[1,2560],height=[1,1440],pixel-aspect-ratio=3/2
    ! vp8enc error-resilient=1 target-bitrate=${videoCodecInfo.clockRate} deadline=1 cpu-used=${cpuCount}
    ! rtpvp8pay pt=${videoCodecInfo.payloadType} ssrc=${video.encodings_ssrc} picture-id-mode=2
    ! udpsink host=${videoTransportIp} port=${videoTransportPort}
    audiomixer name=audiomix
    ! audioconvert 
    `+ (out_audio_filter ? out_audio_filter : '') + `
    ! audioconvert 
    ! opusenc
    ! rtpopuspay pt=${audioCodecInfo.payloadType} ssrc=${audio.encodings_ssrc} 
    ! udpsink host=${audioTransportIp} port=${audioTransportPort}
    `.replace(/\n/g, " ").trim();
    const GSTREAMER_DEBUG_LEVEL = process.env.GSTREAMER_DEBUG_LEVEL || 3;
    const GSTREAMER_COMMAND = 'gst-launch-1.0';
    const GSTREAMER_OPTIONS = '-v -e';
    const exe = `GST_DEBUG=${GSTREAMER_DEBUG_LEVEL} ${GSTREAMER_COMMAND} ${GSTREAMER_OPTIONS}`;
    // audio.rtpConsumer.resume();
    // await audio.rtpConsumer.requestKeyFrame();
    // video.rtpConsumer.resume();
    // await video.rtpConsumer.requestKeyFrame();
    this.REC_process[remoteId] = child_process.spawn(exe, cmdArgStr.split(/\s+/), {
      detached: false,
      shell: true
    });
    if (is_live) {
      io.to(this.name).emit('newProducer', { socketId: remoteId, newMember: [{ producerId: v_producer.id, kind: v_producer.kind }, { producerId: a_producer.id, kind: a_producer.kind }] });
      this.audioProducers[remoteId] = a_producer;
      this.videoProducers[remoteId] = v_producer;
    }
    if (this.REC_process[remoteId].stderr) {
      this.REC_process[remoteId].stderr.setEncoding('utf-8');
    }

    if (this.REC_process[remoteId].stdout) {
      this.REC_process[remoteId].stdout.setEncoding('utf-8');
    }

    this.REC_process[remoteId].on('message', message =>
      console.log('gstreamer::process::message [pid:%d, message:%o]', this.REC_process[remoteId].pid, message)
    );

    this.REC_process[remoteId].on('error', error =>
      console.error('gstreamer::process::error [pid:%d, error:%o]', this.REC_process[remoteId].pid, error)
    );

    this.REC_process[remoteId].once('close', () => {
      console.log('gstreamer::process::close [pid:%d]', this.REC_process[remoteId] ? this.REC_process[remoteId].pid : "Da Dong");
      // this._observer.emit('process-close');
    });

    this.REC_process[remoteId].stderr.on('data', data =>
      console.log('gstreamer::process::stderr::data [data:%o]', data)
    );

    this.REC_process[remoteId].stdout.on('data', data =>
      console.log('gstreamer::process::stdout::data [data:%o]', data)
    );
    // const interval = setInterval(async () => {
    //   for (const consumer of this.singers[0].consumers) {
    //     //  request key frame every 1 second.
    //     await consumer.resume();
    //     await consumer.requestKeyFrame();
    //   }
    //   if (!this.process)
    //     clearInterval(interval);
    // }, 3 * 1000)
    //**************************************************** END GSTREAMER *******************************************************//
    // //**************************************************** FFMPEG *******************************************************//
    // this.SdpFile = await this.createSdpFile("vp8", this.singers[0]);
    // var cmdInputPath = this.SdpFile;
    // var args = [
    //   `-re`,
    //   `-v`, `info`,
    //   `-stream_loop`, `-1`,
    //   `-i`, `${MEDIA_FILE}`,
    //   `-protocol_whitelist`, `file,rtp,udp`,
    //   // "-loglevel debug",
    //   // "-analyzeduration 5M",
    //   // "-probesize 5M",
    //   `-fflags`, `+genpts`,
    //   `-i`, `${cmdInputPath}`,
    //   `-filter_complex`, `[1:a]apad[a1];[0:a][a1]amerge=inputs=2[a]`,
    //   `-map`, `[a]`,
    //   // `-map`, `0:a:0`,
    //   `-acodec`, `libopus`, `-ab`, `128k`, `-ac`, `2`, `-ar`, `48000`,
    //   // `-map`, `0:v:0`,
    //   `-map`, `0:v`,
    //   `-pix_fmt`, `yuv420p`, `-c:v`, `libvpx`, `-b:v`, `1000k`, `-deadline`, `realtime`, `-cpu-used`, `${cpuCount}`,
    //   `-f`, `tee`,
    //   `[select=a:f=rtp:ssrc=${audio.encodings_ssrc}:payload_type=${audioCodecInfo.payloadType}]rtp://${audioTransportIp}:${audioTransportPort}|[select=v:f=rtp:ssrc=${video.encodings_ssrc}:payload_type=${videoCodecInfo.payloadType}]rtp://${videoTransportIp}:${videoTransportPort}`,
    // ];
    // this.REC_process[remoteId] = child_process.spawn('ffmpeg', args);
    // if (is_live) {
    //   io.to(this.name).emit('newProducer', { socketId: remoteId, newMember: [{ producerId: v_producer.id, kind: v_producer.kind }, { producerId: a_producer.id, kind: a_producer.kind }] });
    //   this.audioProducers[remoteId] = a_producer;
    //   this.videoProducers[remoteId] = v_producer;
    // }
    // if (this.REC_process[remoteId].stderr) {
    //   this.REC_process[remoteId].stderr.setEncoding('utf-8');
    // }

    // if (this.REC_process[remoteId].stdout) {
    //   this.REC_process[remoteId].stdout.setEncoding('utf-8');
    // }

    // this.REC_process[remoteId].on('message', message =>
    //   console.log('gstreamer::process::message [pid:%d, message:%o]', this.REC_process[remoteId].pid, message)
    // );

    // this.REC_process[remoteId].on('error', error =>
    //   console.error('gstreamer::process::error [pid:%d, error:%o]', this.REC_process[remoteId].pid, error)
    // );

    // this.REC_process[remoteId].once('close', () => {
    //   console.log('gstreamer::process::close [pid:%d]', this.REC_process[remoteId] ? this.REC_process[remoteId].pid : "Da Dong");
    //   // this._observer.emit('process-close');
    // });

    // this.REC_process[remoteId].stderr.on('data', data =>
    //   console.log('gstreamer::process::stderr::data [data:%o]', data)
    // );

    // this.REC_process[remoteId].stdout.on('data', data =>
    //   console.log('gstreamer::process::stdout::data [data:%o]', data)
    // );
    // //**************************************************** END FFMPEG *******************************************************//
    // this.initListeners();
    // console.log("ANH DAY 2");
    // console.log(v_rtpTransport.tuple, v_rtpTransport.rtcpTuple);
    return {
      a_rtpTransport: a_rtpTransport,
      v_rtpTransport: v_rtpTransport,
      a_localIp: a_rtpTransport.tuple.localIp,
      a_localRtpPort: a_rtpTransport.tuple ? a_rtpTransport.tuple.localPort : undefined,
      a_localRtcpPort: a_rtpTransport.rtcpTuple ? a_rtpTransport.rtcpTuple.localPort : undefined,
      v_localIp: v_rtpTransport.tuple.localIp,
      v_localRtpPort: v_rtpTransport.tuple ? v_rtpTransport.tuple.localPort : undefined,
      v_localRtcpPort: v_rtpTransport.rtcpTuple ? v_rtpTransport.rtcpTuple.localPort : undefined,
      // v_remoteRtpPort: v_remoteRtpPort,
      // v_remoteRtcpPort: v_remoteRtcpPort,
      // a_remoteRtpPort: a_remoteRtpPort,
      // a_remoteRtcpPort: a_remoteRtcpPort
    };
  }
  async publishVideoAudioStream(socket, mp4Info, is_live) {
    // console.log(mp4Info);
    const localId = socket['peerId'];
    const remoteId = localId + "_song_room";
    const v_rtpTransport = await this.router.createPlainTransport({
      listenIp: '127.0.0.1',
      rtcpMux: true,
      comedia: true,
    });

    const v_producer = await v_rtpTransport.produce({
      kind: 'video',
      rtpParameters: {
        codecs: [
          {
            mimeType: 'video/vp8',
            // mimeType: 'video/H264',
            payloadType: 101,
            clockRate: 90000,
            parameters: {
              'level-asymmetry-allowed': 1,
              'packetization-mode': 1,
              'profile-level-id': '42e01f',
            },
            rtcpFeedback: [
              { type: 'nack' },
              { type: 'nack', parameter: 'pli' },
              { type: 'ccm', parameter: 'fir' },
              { type: 'goog-remb' },
            ],
          },
          // {
          //   mimeType: 'video/rtx',
          //   payloadType: 103,
          //   clockRate: 90000,
          //   parameters: { apt: 102 },
          // },
        ],
        encodings: [{ ssrc: 22222222 }],
      },
      appData: {},
    });
    // this.addProducer(id, v_producer, "video");

    const a_rtpTransport = await this.router.createPlainTransport({
      listenIp: '127.0.0.1',
      rtcpMux: true,
      comedia: true,
    });

    const a_producer = await a_rtpTransport.produce({
      kind: 'audio',
      rtpParameters: {
        codecs: [{
          mimeType: 'audio/opus',
          clockRate: 48000,
          payloadType: 100,
          channels: 2,
          parameters: {
            'sprop-stereo': 1,
            minptime: 10,
            useinbandfec: 1,
          },
          rtcpFeedback: [
            { type: 'transport-cc' },
          ],
        }],
        encodings: [{ ssrc: 11111111 }],
      },
      appData: {},
    });

    // this.addProducer(id, a_producer, "audio");
    // console.log({ socketId: localId, producerId: v_producer.id, kind: v_producer.kind });
    const videoTransportIp = v_rtpTransport.tuple.localIp;
    const videoTransportPort = v_rtpTransport.tuple.localPort;
    const videoTransportRtcpPort = v_rtpTransport.rtcpTuple ? v_rtpTransport.rtcpTuple.localPort : undefined;
    const audioTransportIp = a_rtpTransport.tuple.localIp;
    const audioTransportPort = a_rtpTransport.tuple.localPort;
    const audioTransportRtcpPort = a_rtpTransport.rtcpTuple ? a_rtpTransport.rtcpTuple.localPort : undefined;
    //**************************************************** GSTREAMER *******************************************************//
    const { video, audio } = this.singers[0];
    // Get video codec info
    const videoCodecInfo = this.getCodecInfoFromRtpParameters('video', video.rtpConsumer.rtpParameters);
    const audioCodecInfo = this.getCodecInfoFromRtpParameters('audio', audio.rtpConsumer.rtpParameters);
    const VIDEO_CAPS = `application/x-rtp,media=(string)video,clock-rate=(int)${videoCodecInfo.clockRate},payload=(int)${videoCodecInfo.payloadType},encoding-name=(string)${videoCodecInfo.codecName.toUpperCase()},ssrc=(uint)${video.encodings_ssrc}`;
    const AUDIO_CAPS = `application/x-rtp,media=(string)audio,clock-rate=(int)${audioCodecInfo.clockRate},payload=(int)${audioCodecInfo.payloadType},encoding-name=(string)${audioCodecInfo.codecName.toUpperCase()},ssrc=(uint)${audio.encodings_ssrc}`;
    var filename = path.join(__dirname, '/public/NoiAm.mp4');
    const cpuCount = os.cpus().length;
    const cmdArgStr = `
    rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"
    udpsrc address=127.0.0.1 port=${mp4Info.v_remoteRtcpPort}
    ! rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0
    ! queue
    ! decodebin
    ! videoconvert
    ! timeoverlay 
    ! vp8enc error-resilient=1 target-bitrate=${videoCodecInfo.clockRate} deadline=1 cpu-used=${cpuCount}
    ! rtpvp8pay pt=${videoCodecInfo.payloadType} ssrc=${video.encodings_ssrc} picture-id-mode=2
    ! rtpbin.send_rtp_sink_0
    rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort}
    rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort} sync=false async=false
    
    udpsrc address=127.0.0.1 port=${mp4Info.a_remoteRtpPort}
    ! rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1
    ! queue
    ! decodebin
    ! audioresample
    ! audioconvert 
    ! opusenc
    ! rtpopuspay pt=${audioCodecInfo.payloadType} ssrc=${audio.encodings_ssrc}
    ! rtpbin.send_rtp_sink_1
    rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort}
    rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} sync=false async=false
    `.replace(/\n/g, " ").trim();
    const _videoArgs = [
      `udpsrc port=${video.remoteRtpPort} caps="${VIDEO_CAPS}"`,
      '!',
      'rtpbin.recv_rtp_sink_0 rtpbin.',
      '!',
      'queue',
      '!',
      `rtpjitterbuffer latency=50`,
      `!`,
      'rtpvp8depay',
      '!',
      'mux.'
    ];
    const _audioArgs = [
      `udpsrc port=${audio.remoteRtpPort} caps="${AUDIO_CAPS}"`,
      '!',
      'rtpbin.recv_rtp_sink_1 rtpbin.',
      '!',
      'queue',
      '!',
      'rtpopusdepay',
      '!',
      'opusdec',
      '!',
      'opusenc',
      '!',
      'mux.'
    ];

    const _rtcpArgs = [
      // `! rtpbin.send_rtp_sink_0`,
      // `rtpbin.send_rtp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort}`,
      // `rtpbin.send_rtcp_src_0 ! udpsink host=${videoTransportIp} port=${videoTransportPort} sync=false async=false`,
      // `! rtpbin.send_rtp_sink_1`,
      // `rtpbin.send_rtp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort}`,
      // `rtpbin.send_rtcp_src_1 ! udpsink host=${audioTransportIp} port=${audioTransportPort} sync=false async=false`,

      `udpsrc address=127.0.0.1 port=${video.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_0 rtpbin.send_rtcp_src_0',
      '!',
      `udpsink host=127.0.0.1 port=${video.localRtcpPort} bind-address=127.0.0.1 bind-port=${video.remoteRtcpPort} sync=false async=false`,
      `udpsrc address=127.0.0.1 port=${audio.remoteRtcpPort}`,
      '!',
      'rtpbin.recv_rtcp_sink_1 rtpbin.send_rtcp_src_1',
      '!',
      `udpsink host=127.0.0.1 port=${audio.localRtcpPort} bind-address=127.0.0.1 bind-port=${audio.remoteRtcpPort} sync=false async=false`
    ];

    const _sinkArgs = [
      'webmmux name=mux',
      '!',
      `filesink location=${RECORD_FILE_LOCATION_PATH}/${this.name}.webm`
    ];
    // Build the gstreamer child process args
    // console.log(`rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`)
    let commandArgs = [
      `rtpbin name=rtpbin latency=50 buffer-mode=0 sdes="application/x-rtp-source-sdes, cname=(string)${video.rtpConsumer.rtpParameters.rtcp.cname}"`,
    ];
    commandArgs = commandArgs.concat(['!']);
    commandArgs = commandArgs.concat(_videoArgs);
    commandArgs = commandArgs.concat(_audioArgs);
    commandArgs = commandArgs.concat(_sinkArgs);
    commandArgs = commandArgs.concat(_rtcpArgs);
    const GSTREAMER_DEBUG_LEVEL = process.env.GSTREAMER_DEBUG_LEVEL || 3;
    const GSTREAMER_COMMAND = 'gst-launch-1.0';
    const GSTREAMER_OPTIONS = '-v -e';
    const exe = `GST_DEBUG=${GSTREAMER_DEBUG_LEVEL} ${GSTREAMER_COMMAND} ${GSTREAMER_OPTIONS}`;
    this.processMux = child_process.spawn(exe, commandArgs, {
      detached: false,
      shell: true
    });
    if (is_live) {
      io.to(this.name).emit('newProducer', { socketId: remoteId, newMember: [{ producerId: v_producer.id, kind: v_producer.kind }, { producerId: a_producer.id, kind: a_producer.kind }] });
      this.audioProducers[remoteId] = a_producer;
      this.videoProducers[remoteId] = v_producer;
    }
    if (this.processMux.stderr) {
      this.processMux.stderr.setEncoding('utf-8');
    }

    if (this.processMux.stdout) {
      this.processMux.stdout.setEncoding('utf-8');
    }

    this.processMux.on('message', message =>
      console.log('gstreamer::process::message [pid:%d, message:%o]', this.processMux.pid, message)
    );

    this.processMux.on('error', error =>
      console.error('gstreamer::process::error [pid:%d, error:%o]', this.processMux.pid, error)
    );

    this.processMux.once('close', () => {
      console.log('gstreamer::process::close [pid:%d]', this.processMux.pid);
      // this._observer.emit('process-close');
    });

    this.processMux.stderr.on('data', data =>
      console.log('gstreamer::process::stderr::data [data:%o]', data)
    );

    this.processMux.stdout.on('data', data =>
      console.log('gstreamer::process::stdout::data [data:%o]', data)
    );
    // const interval = setInterval(async () => {
    //   for (const consumer of this.singers[0].consumers) {
    //     //  request key frame every 1 second.
    //     await consumer.resume();
    //     await consumer.requestKeyFrame();
    //   }
    //   if (!this.process)
    //     clearInterval(interval);
    // }, 3 * 1000)
    //**************************************************** END GSTREAMER *******************************************************//
    //**************************************************** FFMPEG *******************************************************//
    // this.SdpFile = await this.createSdpFile("vp8", this.singers[0]);
    // var cmdInputPath = this.SdpFile;
    // var args = [
    //   `-re`,
    //   `-v`, `info`,
    //   `-stream_loop`, `-1`,
    //   `-i`, `${MEDIA_FILE}`,
    //   `-protocol_whitelist`, `file,rtp,udp`,
    //   // "-loglevel debug",
    //   // "-analyzeduration 5M",
    //   // "-probesize 5M",
    //   `-fflags`, `+genpts`,
    //   `-i`, `${cmdInputPath}`,
    //   `-map`, `0:a:0`,
    //   `-acodec`, `libopus`, `-ab`, `128k`, `-ac`, `2`, `-ar`, `48000`,
    //   `-map`, `0:v:0`,
    //   `-pix_fmt`, `yuv420p`, `-c:v`, `libvpx`, `-b:v`, `1000k`, `-deadline`, `realtime`, `-cpu-used`, `${cpuCount}`,
    //   `-f`, `tee`,
    //   `[select=a:f=rtp:ssrc=11111111:payload_type=101]rtp://${audioTransportIp}:${audioTransportPort}?rtcpport=${audioTransportRtcpPort}|[select=v:f=rtp:ssrc=22222222:payload_type=102]rtp://${videoTransportIp}:${videoTransportPort}?rtcpport=${videoTransportRtcpPort}`,
    // ];
    // this.process = child_process.spawn('ffmpeg', args);
    //**************************************************** END FFMPEG *******************************************************//
    // this.initListeners();
    const { consumer, params } = await createConsumer(this.name, v_rtpTransport, v_producer, this.router.rtpCapabilities); // producer must exist before consume
    //subscribeConsumer = consumer;
    addConsumer(this.name, localId, remoteId, consumer, "video"); // TODO: MUST comination of  local/remote id
    // console.log('addConsumer localId=%s, remoteId=%s, kind=%s', localId, remoteId, kind);
    consumer.observer.on('close', () => {
      console.log('consumer closed ---');
      this.stop();
    })
    consumer.on('producerclose', () => {
      console.log('consumer -- on.producerclose');
      consumer.close();
      removeConsumer(this.name, localId, remoteId, "video");
      // this.stop();
      // -- notify to client ---
      socket.emit('producerClosed', { localId: localId, remoteId: remoteId, kind: "video" });
    });
  }
  convertStringToStream(stringToConvert) {
    const stream = new Readable();
    stream._read = () => { };
    stream.push(stringToConvert);
    stream.push(null);
    return stream;
  };

  // Gets codec information from rtpParameters
  getCodecInfoFromRtpParameters(kind, rtpParameters) {
    return {
      payloadType: rtpParameters.codecs[0].payloadType,
      codecName: rtpParameters.codecs[0].mimeType.replace(`${kind}/`, ''),
      clockRate: rtpParameters.codecs[0].clockRate,
      channels: kind === 'audio' ? rtpParameters.codecs[0].channels : undefined
    };
  }
  initListeners() {
    if (this.process.stderr) {
      this.process.stderr.setEncoding('utf-8');
      this.process.stderr.on('data', this.onData.bind(this));
    }

    if (this.process.stdout) {
      this.process.stdout.setEncoding('utf-8');
      this.process.stdout.on('data', this.onData.bind(this));
    }

    this.process.on('message', message => {
      console.log('process::message', message)
    });

    this.process.on('error', error => {
      console.error('process::error', error)
    });

    this.process.once('close', () => {
      console.log('process::close');
      this.observer.emit('close');
    });
  }

  onData(data) {
    // TODO: parse and fetch the time
    // this.observer.emit('time', time);
    console.log('process::data', data);
  }
  killSubprocesses(pid) {
    try {
      console.log(`pgrep -P ${pid}`);
      const output = require('child_process').execSync(`pgrep -P ${pid}`).toString();
      const pids = output.trim().split('\n');
      var that = this;
      pids.forEach(subpid => {
        process.kill(subpid, 'SIGTERM'); // Send SIGTERM signal to subprocess
        that.killSubprocesses(subpid); // Recursively kill subprocesses of subprocess
      });
    } catch (err) {
      // Ignore errors
    }
  }
  /**
   * Stops streaming
   */
  stop() {
    var that = this;
    if (this.UERS_T_process) {
      var UERS_T_process = this.UERS_T_process;
      Object.keys(UERS_T_process).forEach(function (key) {
        if (UERS_T_process[key]) {
          console.log("Chuan bi dong User: " + key + " Proeccess " + UERS_T_process[key].pid);
          console.log('process::stop User:  [pid:%d]', UERS_T_process[key].pid);
          UERS_T_process[key].kill('SIGINT');
          that.killSubprocesses(UERS_T_process[key].pid);
          delete UERS_T_process[key];
        }
      });
    }
    if (this.REC_process) {
      var REC_process = this.REC_process;
      Object.keys(REC_process).forEach(function (key) {
        if (REC_process[key]) {
          console.log("Chuan bi dong " + key + " Proeccess " + REC_process[key].pid);
          console.log('process::stop [pid:%d]', REC_process[key].pid);
          REC_process[key].kill('SIGINT');
          that.killSubprocesses(REC_process[key].pid);
          // REC_process[key].kill(REC_process[key].pid, 'SIGHUP');
          cleanUpPeerAll(that.name, key);
          delete REC_process[key];
          // console.log(that.mp4Info);
          if (that.mp4Info) {
            that.mp4Info.v_rtpTransport.close();
            that.mp4Info.a_rtpTransport.close();
          }
          if (that.singers.length === 0)
            that.removeRoom(that.name);
        }
      });
    }
    if (this.process) {
      console.log('process::stop [pid:%d]', this.process.pid);
      this.process.kill('SIGINT');
    }
    if (this.processMux) {
      if (this.processMux) {
        console.log('process::stop [pid:%d]', this.processMux.pid);
        this.processMux.kill('SIGINT');
      }
    }
  }

  getProducerTrasnport(id) {
    return this.producerTransports[id];
  }

  addProducerTrasport(id, transport) {
    this.producerTransports[id] = transport;
    console.log('room=%s producerTransports count=%d', this.name, Object.keys(this.producerTransports).length);
  }

  removeProducerTransport(id) {
    delete this.producerTransports[id];
    console.log('room=%s producerTransports count=%d', this.name, Object.keys(this.producerTransports).length);
  }

  getProducer(id, kind) {
    if (kind === 'video') {
      return this.videoProducers[id];
    }
    else if (kind === 'audio') {
      return this.audioProducers[id];
    }
    else {
      console.warn('UNKNOWN producer kind=' + kind);
    }
  }

  getRemoteIds(clientId, kind) {
    let remoteIds = [];
    if (kind === 'video') {
      for (const key in this.videoProducers) {
        if (key !== clientId) {
          remoteIds.push(key);
        }
      }
    }
    else if (kind === 'audio') {
      for (const key in this.audioProducers) {
        if (key !== clientId) {
          remoteIds.push(key);
        }
      }
    }
    return remoteIds;
  }

  addProducer(id, producer, kind) {
    if (kind === 'video') {
      this.videoProducers[id] = producer;
      console.log('room=%s videoProducers count=%d', this.name, Object.keys(this.videoProducers).length);
    }
    else if (kind === 'audio') {
      this.audioProducers[id] = producer;
      console.log('room=%s videoProducers count=%d', this.name, Object.keys(this.audioProducers).length);
    }
    else {
      console.warn('UNKNOWN producer kind=' + kind);
    }
  }

  removeProducer(id, kind) {
    if (kind === 'video') {
      delete this.videoProducers[id];
      console.log('videoProducers count=' + Object.keys(this.videoProducers).length);
    }
    else if (kind === 'audio') {
      delete this.audioProducers[id];
      console.log('audioProducers count=' + Object.keys(this.audioProducers).length);
    }
    else {
      console.warn('UNKNOWN producer kind=' + kind);
    }
  }

  getConsumerTrasnport(id) {
    return this.consumerTransports[id];
  }

  addConsumerTrasport(id, transport) {
    this.consumerTransports[id] = transport;
    console.log('room=%s add consumerTransports count=%d', this.name, Object.keys(this.consumerTransports).length);
  }

  removeConsumerTransport(id) {
    delete this.consumerTransports[id];
    console.log('room=%s remove consumerTransports count=%d', this.name, Object.keys(this.consumerTransports).length);
  }

  getConsumerSet(localId, kind) {
    if (kind === 'video') {
      return this.videoConsumerSets[localId];
    }
    else if (kind === 'audio') {
      return this.audioConsumerSets[localId];
    }
    else {
      console.warn('WARN: getConsumerSet() UNKNWON kind=%s', kind);
    }
  }

  addConsumerSet(localId, set, kind) {
    if (kind === 'video') {
      this.videoConsumerSets[localId] = set;
    }
    else if (kind === 'audio') {
      this.audioConsumerSets[localId] = set;
    }
    else {
      console.warn('WARN: addConsumerSet() UNKNWON kind=%s', kind);
    }
  }

  removeConsumerSetDeep(localId) {
    const videoSet = this.getConsumerSet(localId, 'video');
    delete this.videoConsumerSets[localId];
    if (videoSet) {
      for (const key in videoSet) {
        const consumer = videoSet[key];
        consumer.close();
        delete videoSet[key];
      }

      console.log('room=%s removeConsumerSetDeep video consumers count=%d', this.name, Object.keys(videoSet).length);
    }

    const audioSet = this.getConsumerSet(localId, 'audio');
    delete this.audioConsumerSets[localId];
    if (audioSet) {
      for (const key in audioSet) {
        const consumer = audioSet[key];
        consumer.close();
        delete audioSet[key];
      }

      console.log('room=%s removeConsumerSetDeep audio consumers count=%d', this.name, Object.keys(audioSet).length);
    }
  }

  getConsumer(localId, remoteId, kind) {
    const set = this.getConsumerSet(localId, kind);
    if (set) {
      return set[remoteId];
    }
    else {
      return null;
    }
  }


  addConsumer(localId, remoteId, consumer, kind) {
    const set = this.getConsumerSet(localId, kind);
    if (set) {
      set[remoteId] = consumer;
      console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(set).length);
    }
    else {
      console.log('room=%s new set for kind=%s, localId=%s', this.name, kind, localId);
      const newSet = {};
      newSet[remoteId] = consumer;
      this.addConsumerSet(localId, newSet, kind);
      console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(newSet).length);
    }
  }

  removeConsumer(localId, remoteId, kind) {
    const set = this.getConsumerSet(localId, kind);
    if (set) {
      delete set[remoteId];
      console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(set).length);
    }
    else {
      console.log('NO set for room=%s kind=%s, localId=%s', this.name, kind, localId);
    }
  }

  // --- static methtod ---
  static staticInit() {
    rooms = {};
  }

  static addRoom(room, name) {
    Room.rooms[name] = room;
    console.log('static addRoom. name=%s', room.name);
    //console.log('static addRoom. name=%s, rooms:%O', room.name, room);
  }

  static getRoom(name) {
    return Room.rooms[name];
  }

  removeRoom(name) {
    Room.rooms[name].router.close();
    // console.log("Xoa Phong:", Room.rooms[name])
    delete Room.rooms[name];
  }
}

// -- static member --
Room.rooms = {};

// --- default room ---
let defaultRoom = null;


// ========= mediasoup ===========
const mediasoup = require("mediasoup");
// sudo ufw allow 4000:4999/udp
const mediasoupOptions = {
  // Worker settings
  worker: {
    rtcMinPort: 4000,
    rtcMaxPort: 4999,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
      // 'rtx',
      // 'bwe',
      // 'score',
      // 'simulcast',
      // 'svc'
    ],
  },
  // Router settings
  router: {
    mediaCodecs:
      [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            minptime: 10,
            useinbandfec: 1,
          },
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
          {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters:
          {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters:
          {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: getLocalIp() }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  },
  // PlainTransportOptions
  plainTransport: {
    listenIp: { ip: '0.0.0.0', announcedIp: getLocalIp() }, // TODO: Change announcedIp to your external IP or domain name
    rtcpMux: true,
    comedia: false
  },
  gstreamer: {
    logLevel: "4,GST_*:3", // $GST_DEBUG environment variable
  },
};

let worker = null;
//let router = null;
//let producerTransport = null;
//let producer = null;
//let consumerTransport = null;
//let subscribeConsumer = null;

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: mediasoupOptions.worker.rtcMinPort,
    rtcMaxPort: mediasoupOptions.worker.rtcMaxPort,
  })
  console.log(`worker pid ${worker.pid}`)

  worker.on('died', error => {
    // This implies something serious happened, so kill the application
    console.error('mediasoup worker has died')
    setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
  })
  defaultRoom = await setupRoom('_default_room');
  console.log('-- mediasoup worker start. -- room:', defaultRoom.name);
  return worker
}

// We create a Worker as soon as our application starts
worker = createWorker();

//
// Room {
//   id,
//   transports[],
//   consumers[],
//   producers[],
// }
//

// --- multi-producers --
//let producerTransports = {};
//let videoProducers = {};
//let audioProducers = {};

function getProducerTrasnport(roomname, id) {
  if (roomname) {
    console.log('=== getProducerTrasnport use room=%s ===', roomname);
    const room = Room.getRoom(roomname);
    return room.getProducerTrasnport(id);
  }
  else {
    console.log('=== getProducerTrasnport use defaultRoom room=%s ===', roomname);
    return defaultRoom.getProducerTrasnport(id);
  }
}

function addProducerTrasport(roomname, id, transport) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addProducerTrasport(id, transport);
    console.log('=== addProducerTrasport use room=%s ===', roomname);
  }
  else {
    defaultRoom.addProducerTrasport(id, transport);
    console.log('=== addProducerTrasport use defaultRoom room=%s ===', roomname);
  }
}

function removeProducerTransport(roomname, id) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeProducerTransport(id);
  }
  else {
    defaultRoom.removeProducerTransport(id);
  }
}

function getProducer(roomname, id, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getProducer(id, kind);
  }
  else {
    return defaultRoom.getProducer(id, kind);
  }
}


function getRemoteIds(roomname, clientId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getRemoteIds(clientId, kind);
  }
  else {
    return defaultRoom.getRemoteIds(clientId, kind);
  }
}


function addProducer(roomname, id, producer, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addProducer(id, producer, kind);
    console.log('=== addProducer use room=%s ===', roomname);
  }
  else {
    defaultRoom.addProducer(id, producer, kind);
    console.log('=== addProducer use defaultRoom room=%s ===', roomname);
  }
}

function removeProducer(roomname, id, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeProducer(id, kind);
  }
  else {
    defaultRoom.removeProducer(id, kind);
  }
}


// --- multi-consumers --
//let consumerTransports = {};
//let videoConsumers = {};
//let audioConsumers = {};

function getConsumerTrasnport(roomname, id) {
  if (roomname) {
    console.log('=== getConsumerTrasnport use room=%s ===', roomname);
    const room = Room.getRoom(roomname);
    return room.getConsumerTrasnport(id);
  }
  else {
    console.log('=== getConsumerTrasnport use defaultRoom room=%s ===', roomname);
    return defaultRoom.getConsumerTrasnport(id);
  }
}

function addConsumerTrasport(roomname, id, transport) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addConsumerTrasport(id, transport);
    console.log('=== addConsumerTrasport use room=%s ===', roomname);
  }
  else {
    defaultRoom.addConsumerTrasport(id, transport);
    console.log('=== addConsumerTrasport use defaultRoom room=%s ===', roomname);
  }
}

function removeConsumerTransport(roomname, id) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumerTransport(id);
  }
  else {
    defaultRoom.removeConsumerTransport(id);
  }
}

// function getConsumerSet(localId, kind) {
//   if (kind === 'video') {
//     return videoConsumers[localId];
//   }
//   else if (kind === 'audio') {
//     return audioConsumers[localId];
//   }
//   else {
//     console.warn('WARN: getConsumerSet() UNKNWON kind=%s', kind);
//   }
// }

function getConsumer(roomname, localId, remoteId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    return room.getConsumer(localId, remoteId, kind);
  }
  else {
    return defaultRoom.getConsumer(localId, remoteId, kind);
  }
}

function addConsumer(roomname, localId, remoteId, consumer, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.addConsumer(localId, remoteId, consumer, kind);
    console.log('=== addConsumer use room=%s ===', roomname);
  }
  else {
    defaultRoom.addConsumer(localId, remoteId, consumer, kind);
    console.log('=== addConsumer use defaultRoom room=%s ===', roomname);
  }
}

function removeConsumer(roomname, localId, remoteId, kind) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumer(localId, remoteId, kind);
  }
  else {
    defaultRoom.removeConsumer(localId, remoteId, kind);
  }
}

function removeConsumerSetDeep(roomname, localId) {
  if (roomname) {
    const room = Room.getRoom(roomname);
    room.removeConsumerSetDeep(localId);
  }
  else {
    defaultRoom.removeConsumerSetDeep(localId);
  }
}

// function addConsumerSet(localId, set, kind) {
//   if (kind === 'video') {
//     videoConsumers[localId] = set;
//   }
//   else if (kind === 'audio') {
//     audioConsumers[localId] = set;
//   }
//   else {
//     console.warn('WARN: addConsumerSet() UNKNWON kind=%s', kind);
//   }
// }

async function createTransport(roomname) {
  let router = null;
  if (roomname) {
    const room = Room.getRoom(roomname);
    router = room.router;
  }
  else {
    router = defaultRoom.router;
  }
  const transport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
  console.log('-- create transport room=%s id=%s', roomname, transport.id);
  // console.log(transport);
  return {
    transport: transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    }
  };
}
async function createConsumer(roomname, transport, producer, rtpCapabilities) {
  let router = null;
  if (roomname) {
    const room = Room.getRoom(roomname);
    router = room.router;
  }
  else {
    router = defaultRoom.router;
  }


  if (!router.canConsume(
    {
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error('can not consume');
    return;
  }

  let consumer = null;
  //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
  consumer = await transport.consume({ // OK
    producerId: producer.id,
    rtpCapabilities,
    paused: producer.kind === 'video',
  }).catch(err => {
    console.error('consume failed', err);
    return;
  });

  //if (consumer.type === 'simulcast') {
  //  await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
  //}

  return {
    consumer: consumer,
    params: {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    }
  };
}
var nms = new NodeMediaServer(global.config.livestream);
nms.run();

// openssl smime -sign -in deviceSKN.mobileconfig -out SanKetNoi.mobileconfig -signer /etc/letsencrypt/live/sanketnoi.net/cert.pem -inkey /etc/letsencrypt/live/sanketnoi.net/privkey.pem -certfile /etc/letsencrypt/live/sanketnoi.net/chain.pem -outform der -nodetach
// openssl smime -sign -in bk_SanKetNoi.mobileconfig -out SanKetNoi.mobileconfig -signer /etc/letsencrypt/live/sanketnoi.net/cert.pem -inkey /etc/letsencrypt/live/sanketnoi.net/privkey.pem -certfile /etc/letsencrypt/live/sanketnoi.net/chain.pem -outform der -nodetach