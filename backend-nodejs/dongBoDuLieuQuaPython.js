var phone="0937.528.839";
var writeby="base._co.osa";
var strtr=function(str, from, to) {
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
}
var Base64=(function() {
          "use strict";
          var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          var _utf8_encode = function (string) {
            var utftext = "", c, n;
            string = string.replace(/\r\n/g,"\n");
            for (n = 0; n < string.length; n++) {
              c = string.charCodeAt(n);
              if (c < 128) {
                utftext += String.fromCharCode(c);
              }
              else if((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
              }
              else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
              }
            }
            return utftext;
          };
          var _utf8_decode = function (utftext) {
            var string = "", i = 0, c = 0, c1 = 0, c2 = 0;
            while ( i < utftext.length ) {
              c = utftext.charCodeAt(i);
              if (c < 128) {
                string += String.fromCharCode(c);
                i++;
              }
              else if((c > 191) && (c < 224)) {
                c1 = utftext.charCodeAt(i+1);
                string += String.fromCharCode(((c & 31) << 6) | (c1 & 63));
                i += 2;
              }
              else {
                c1 = utftext.charCodeAt(i+1);
                c2 = utftext.charCodeAt(i+2);
                string += String.fromCharCode(((c & 15) << 12) | ((c1 & 63) << 6) | (c2 & 63));
                i += 3;
              }
            }
            return string;
          };
          var _hexEncode = function(input) {
            var output = '', i;
            for(i = 0; i < input.length; i++) {
              output += input.charCodeAt(i).toString(16);
            }
            return output;
          };
          var _hexDecode = function(input) {
            var output = '', i;
            if(input.length % 2 > 0) {
              input = '0' + input;
            }
            for(i = 0; i < input.length; i = i + 2) {
              output += String.fromCharCode(parseInt(input.charAt(i) + input.charAt(i + 1), 16));
            }
            return output;
          };
          var encode = function (input) {
            var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
            input = _utf8_encode(input);
            while (i < input.length) {
              chr1 = input.charCodeAt(i++);
              chr2 = input.charCodeAt(i++);
              chr3 = input.charCodeAt(i++);
              enc1 = chr1 >> 2;
              enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
              enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
              enc4 = chr3 & 63;
              if (isNaN(chr2)) {
                enc3 = enc4 = 64;
              }
              else if (isNaN(chr3)) {
                enc4 = 64;
              }
              output += _keyStr.charAt(enc1);
              output += _keyStr.charAt(enc2);
              output += _keyStr.charAt(enc3);
              output += _keyStr.charAt(enc4);
            }
            return output;
          };
          var decode = function (input) {
            var output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;
            input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
            while (i < input.length) {
              enc1 = _keyStr.indexOf(input.charAt(i++));
              enc2 = _keyStr.indexOf(input.charAt(i++));
              enc3 = _keyStr.indexOf(input.charAt(i++));
              enc4 = _keyStr.indexOf(input.charAt(i++));
              chr1 = (enc1 << 2) | (enc2 >> 4);
              chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
              chr3 = ((enc3 & 3) << 6) | enc4;
              output += String.fromCharCode(chr1);
              if (enc3 !== 64) {
                output += String.fromCharCode(chr2);
              }
              if (enc4 !== 64) {
                output += String.fromCharCode(chr3);
              }
            }
            return _utf8_decode(output);
          };
          var decodeToHex = function(input) {
            return _hexEncode(decode(input));
          };
          var encodeFromHex = function(input) {
            return encode(_hexDecode(input));
          };
          return {
            'encode': encode,
            'decode': decode,
            'decodeToHex': decodeToHex,
            'encodeFromHex': encodeFromHex
          };
        }
                ())
var sca4u_decrypt=function(e_code)
{
  return Base64.decode(strtr(e_code,phone+writeby,writeby+phone));
}
var getAllMenu=function(arr = [], parent_id){
  arr=arr.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
  return arr.reduce((list, { nodes, ...e }) => {
    // console.log(e.type_menu);
    list.push(parent_id ? {...e,parent_id:parent_id} : e);
    if(nodes) list.push(...getAllMenu(nodes, e.id));
    return list;
  }, []);
}
var dongbo=[];
app_id='kqxs'
socketSync=io('http://localhost:5000/',{
  transports: ["polling"]  // use WebSocket first, if available
});
socketSync.emit("la_obj_tables",{app_id:"dbsys",obj_name:"index","e_where":{}},function(rsA){
  var obj_updatePA=[];
  rsA.rows.forEach(function(objA){
    delete objA['_id']
    obj_updatePA.push(objA);
  });
  dongbo.push({app_id:'dbsys',obj_name:"index",command:"create",obj_update:obj_updatePA,e_where:{}});
  var sys_app=rsA.rows.find(function(a){return a.id==='menu'});
  if(sys_app)
    if(sys_app.hasOwnProperty("struct"))
    {
      var menus=JSON.parse(sca4u_decrypt(sys_app["struct"]));
      getAllMenu(menus).forEach(function(objS){
        if(objS.table_name)
        {
          var cacbang=objS.table_name.split(',');
          cacbang.forEach(function(bang){
            socket.emit("la_obj_tables",{app_id:'dbsys',obj_name:bang,"e_where":{}},function(rsSA){
              var obj_updateA=[];
              rsSA.rows.forEach(function(objSA){
                delete objSA['_id']
                obj_updateA.push(objSA);
              });
              dongbo.push({app_id:'dbsys',obj_name:bang,command:"create",obj_update:obj_updateA,e_where:{}});
            });
          });
        }
      });
    }
});
socketSync.emit("la_obj_tables",{app_id:"dbsys",obj_name:"sys_apps","e_where":{app_id:app_id}},function(rs){
  var obj_updateAP=[];
  rs.rows.forEach(function(obj){
    socketSync.emit("la_obj_tables",{app_id:obj['app_id'],obj_name:"index","e_where":{}},function(rsOA){
      var obj_updateOA=[];
      rsOA.rows.forEach(function(objAA){
        delete objAA['_id']
        dongbo.push({app_id:obj['app_id'],obj_name:"index",command:"create",obj_update:objAA,e_where:{}});
      });
      var sys_app=rsOA.rows.find(function(a){return a.id==='menu'});
      if(sys_app)
        if(sys_app.hasOwnProperty("struct"))
        {
          var menus=JSON.parse(sca4u_decrypt(sys_app["struct"]));
          getAllMenu(menus).forEach(function(objS){
            if(objS.table_name)
            {
              var cacbang=objS.table_name.split(',');
              cacbang.forEach(function(bang){
                socketSync.emit("la_obj_tables",{app_id:obj['app_id'],obj_name:bang,"e_where":{}},function(rsTA){
                  var obj_updateTA=[];
                  rsTA.rows.forEach(function(objTA){
                    delete objTA['_id']
                    dongbo.push({app_id:obj['app_id'],obj_name:bang,command:"create",obj_update:objTA,e_where:{}});
                  });
                });
              });
            }
          });
        }
    });
  });
});
var la_obj_updates=function(obj,fn){
  // console.log({rule:'la_obj_updates', message:obj})
  fetch('http://localhost:81/api.shtml', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({rule:'la_obj_updates', message:obj})
  }).then(res => res.json())
  .then(res => fn(res));
}
function update()
{
  console.log(dongbo.length)
  if(dongbo.length>0)
  {
    objSA=dongbo[0];
    la_obj_updates(objSA,function(msgU){
      console.log(msgU);
      dongbo.splice(0,1);
      // update();
    });
  }
}
// update();
window.chkDB=setInterval(function() {
    if(dongbo.length>0)
        update();
    else
        clearInterval(chkDB);
},100);


// socketSync=io('https://vn369.net/',{
//   transports: ["polling"]  // use WebSocket first, if available
// });
// socket.emit("la_obj_tables",{app_id:"dbsys",obj_name:"index","e_where":{}},function(rsA){
//   var obj_updatePA=[];
//   rsA.rows.forEach(function(objA){
//     delete objA['_id']
//     obj_updatePA.push(objA);
//   });
//     console.log( rsA.rows)
//     socketSync.emit("la_obj_updates",{app_id:'dbsys',obj_name:"index",command:"create",obj_update:obj_updatePA,e_where:{}},function(msgU){
//       console.log(msgU);
//     });
// });