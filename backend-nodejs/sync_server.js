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
      try
      {
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
              d:    d,
              dd:   pad(d),
              ddd:  dF.i18n.dayNames[D],
              dddd: dF.i18n.dayNames[D + 7],
              m:    m + 1,
              mm:   pad(m + 1),
              mmm:  dF.i18n.monthNames[m],
              mmmm: dF.i18n.monthNames[m + 12],
              yy:   String(y).slice(2),
              yyyy: y,
              h:    H % 12 || 12,
              hh:   pad(H % 12 || 12),
              H:    H,
              HH:   pad(H),
              M:    M,
              MM:   pad(M),
              s:    s,
              ss:   pad(s),
              l:    pad(L, 3),
              L:    pad(L > 99 ? Math.round(L / 10) : L),
              t:    H < 12 ? "a"  : "p",
              tt:   H < 12 ? "am" : "pm",
              T:    H < 12 ? "A"  : "P",
              TT:   H < 12 ? "AM" : "PM",
              Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
              o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
              S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
            };
        return mask.replace(token, function ($0) {
          return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
        });
      }
      catch(ex){
        return "";
      }
    };
  }
  ();
  // Some common format strings
  dateFormat.masks = {
    "default":      "ddd mmm dd yyyy HH:MM:ss",
    shortDate:      "m/d/yy",
    mediumDate:     "mmm d, yyyy",
    longDate:       "mmmm d, yyyy",
    fullDate:       "dddd, mmmm d, yyyy",
    shortTime:      "h:MM TT",
    mediumTime:     "h:MM:ss TT",
    longTime:       "h:MM:ss TT Z",
    isoDate:        "yyyy-mm-dd",
    isoTime:        "HH:MM:ss",
    isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
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
const Datastore = require('nedb')
const crypto = require('crypto');
let algorithm = 'aes-256-cbc' // you can choose many algorithm from supported openssl
const guid=function(tbl_prefix_pk)
{
    var time_id=dateFormat(new Date(),"yymmddhhMMss");
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return (tbl_prefix_pk!=""?tbl_prefix_pk+"_":"")+time_id+"_" + s4() + s4() + s4();
}
function chuyenNgay(st)
{
  try
  {
    var pattern = /(\d{2})\/(\d{2})\/(\d{4})/;
    return new Date(st.replace(pattern,'$3/$2/$1'));
    //      return dateFormat(dt,"dd/mm/yyyy");
  }
  catch(ex)
  {
    return false;
  }
}
var dataKQ=require('./anhld_kqxs.json')
dataKQ=dataKQ.filter(t=>t.type==='table')
// console.log(guid('kqxs'),data);
function lowercaseKeys(obj) {
  return Object.keys(obj).reduce((accumulator, key) => {
    accumulator[key.toLowerCase()] = obj[key];
    return accumulator;
  }, {});
}
global.la_DBtables={};
let secret = 'Công Ty Cổ Phần CODSY'
let key = crypto.createHash('sha256').update(String(secret)).digest('base64').substr(0, 32);
global.la_store=function(f_name)
{
  const dbBK= new Datastore({
    filename:f_name,
    autoload: true,
    afterSerialization(plaintext) {
      const iv = crypto.randomBytes(16)
      const aes = crypto.createCipheriv(algorithm, key, iv)
      let ciphertext = aes.update(plaintext)
      ciphertext = global.Buffer.concat([iv, ciphertext, aes.final()])
      return ciphertext.toString('base64')
    },
    beforeDeserialization(ciphertext) {
      const ciphertextBytes = global.Buffer.from(ciphertext, 'base64')
      const iv = ciphertextBytes.slice(0, 16)
      const data = ciphertextBytes.slice(16)
      const aes = crypto.createDecipheriv(algorithm, key, iv)
      let plaintextBytes = global.Buffer.from(aes.update(data))
      plaintextBytes = global.Buffer.concat([plaintextBytes, aes.final()])
      return plaintextBytes.toString()
    },
  });
  dbBK.persistence.setAutocompactionInterval(5*60000);
  return dbBK;
}
var path = require("path");
global.rootPath = path.join(__dirname, '/');
var la_obj_updates=function(msg,fn){
  try
  {
    msg.command=msg.command.toLowerCase();
    if(!global.la_DBtables[msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')])
      global.la_DBtables[msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')]=global.la_store(global.rootPath+'data/'+msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')+'.db');
    if(msg.command==="create"||msg.command==="update")
    {
      if(!msg["obj"])
        msg["obj"]=msg.obj_update;
      if(!global.la_DBtables[msg.app_id+'/index'])
        global.la_DBtables[msg.app_id+'/index']=global.la_store(global.rootPath+'data/'+msg.app_id+'/index.db');
      if(msg.obj_name.replace(/#dbsys#/g,'')==="index")
      {
        var e_where={id:msg.obj_update.id};
        global.la_DBtables[msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')].update(e_where, msg.obj_update, { upsert: true }, function (err, numReplaced, upsert) {
          if(err)
          {
            msg["status"]=false;
            if(fn)
              fn(msg);
          }
          else
          {
            if(numReplaced===0)
              msg.command="create";
            else if(numReplaced>0)
              msg.command="update";
            msg["status"]=true;
            msg["data_row"]=msg.obj_update; 
            if(fn)
              fn(msg);
          }
        });
      }
      else
        global.la_DBtables[msg.app_id+'/index'].findOne({id:msg.obj_name.replace(/#dbsys#/g,'')}, (err, findStruct) => {
          var e_where={"$and":[]};
          if(findStruct)
          {
            findStruct.struct.fieldsPK.forEach(function(pK){
              var nObj={};
              nObj[pK]=msg.obj[pK];
              e_where["$and"].push(nObj);
            });
          }
          else
            e_where={id:msg.obj_update.id};
          global.la_DBtables[msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')].update(e_where, msg.obj_update, { upsert: true }, function (err, numReplaced, upsert) {
            if(err)
            {
              msg["status"]=false;
              if(fn)
                fn(msg);
            }
            else
            {
              if(numReplaced===0)
                msg.command="create";
              else if(numReplaced>0)
                msg.command="update";
              msg["status"]=true;
              msg["data_row"]=msg.obj_update; 
              if(fn)
                fn(msg);
            }
          });
        });
    }
    else if(msg.command==="delete")
    {
      global.la_DBtables[msg.app_id+'/'+msg.obj_name.replace(/#dbsys#/g,'')].remove(msg.e_where, { multi: true }, function (err, numRemoved) {
        if(err)
        {
          msg["status"]=false;
          if(fn)
            fn(msg);
        }
        else if(numRemoved>0)
        {
          msg["status"]=true;
          if(fn)
            fn(msg);
        }
      });
    }     
  } catch (e) 
  {
    // console.log(e);
    // return io.emit('la_show_error', {"app_id":msg.app_id,"error":e.message,"data_send":msg});
    msg["status"]=false;
    if(fn)
      return fn(msg);
  } 
}
var days = ['CN','T2','T3','T4','T5','T6','T7'];
// console.log(days[d.getDay()]);
var dongbo=[];
dataKQ.forEach(function(dai){
  dai.data.forEach(function(kq){
    var objN=JSON.parse(JSON.stringify(lowercaseKeys(kq)));
    try{
      if(objN['field_ngay'])
      {
        objN['id']=guid('kqxs');
        objN['thu']=days[chuyenNgay(objN['field_ngay']).getDay()];
        dongbo.push({app_id:'kqxs',obj_name:'kqxs_'+dai.name,command:"create",obj_update:objN,e_where:{}});
      }
    }catch(ex){
      console.log(objN['field_ngay'],ex)
    }
    // console.log(objN)
  })
});
function update()
{
  console.log(dongbo.length)
  if(dongbo.length>0)
  {
    objSA=dongbo[0];
    la_obj_updates(objSA,function(msgU){
      console.log(msgU);
      dongbo.splice(0,1);
      update();
    });
  }
}
update();
// var ktDB=-1;
// var chkDB=setInterval(function() {
//     if(dongbo.length!==ktDB)
//         ktDB=dongbo.length;
//     else
//     {
//         clearInterval(chkDB);
//         update();
//     }
// },100);
