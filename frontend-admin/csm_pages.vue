{
  name: 'Pages',
  props: ['Uinfos', 'base', 'database'],
  data: function() {
    // console.log(this.base.la_decrypt(this.Uinfos.group_right));
    // thongbao(JSON.stringify(this.$route.params.m_configs));
    return {
      v_links:{},
      key_menu: dateFormat(new Date(), 'yyyymmddHHMMss') + Math.floor(Math.random() * 1000),
      key_open: dateFormat(new Date(), 'yyyymmddHHMMss') + Math.floor(Math.random() * 1000),
      frmChangepass: false,
      com_logo: false,
      permissions: -1,
      menus_permissions: {},
      frmAccount: false,
      cunrent_pass: false,
      user_info: false,
      account_name: this.Uinfos.email,
      real: new Vue(),
      chuongtrinh: [],
      editableApps: false,
      app_id: 'dbsys',
      optionMenu: [],
      optionMenuSys: [],
      objCopy: false,
      optionMenuSetting: [],
      auto_code: '',
      tabsOpensItems: [],
      tabsOpens: false,
      ribbonMenu: false,
      ribbonMenuData: [],
      ribbonMenuItem: false
    };
  },
  created: function() {
    var seft = this;
    seft.app_id = app_id;
    if (seft.Uinfos["permissions"])
      seft.permissions = seft.Uinfos["permissions"];
    if (seft.Uinfos["menus_permissions"])
      seft.menus_permissions = JSON.parse(seft.Uinfos["menus_permissions"]);
    socket.on('la_sign_in', function (msg) {
      if (msg) {
        if (msg.app_id === seft.app_id && msg.email === seft.account_name && seft.Uinfos['socket_id'] !== socket.id)
          seft.logout(true);
      }
    });
    socket.on('la_obj_updates', function (msg) {
      if (msg.status && seft.database[msg.obj_name]) {
        var chkKhoa = "";
        var oldData = msg.obj;
        var dataUp = (msg.data_row != null ? msg.data_row : msg.obj);
        if (!dataUp["id"])
          return;
        if (!oldData)
          oldData = dataUp;
        if (seft.database[msg.obj_name].fieldsPK.length === 0) {
          chkKhoa = "obj.id===`" + oldData["id"] + "`";
        }
        else
          seft.database[msg.obj_name].fieldsPK.forEach(function (objPK) {
            if ((typeof dataUp[objPK]) === "number")
              chkKhoa += (chkKhoa !== "" ? " && " : "") + "obj." + objPK + "===" + oldData[objPK];
            else
              chkKhoa += (chkKhoa !== "" ? " && " : "") + "obj." + objPK + "===`" + oldData[objPK] + "`";
          });
        var idxRowSV = -1;
        if (chkKhoa !== "")
          idxRowSV = seft.database[msg.obj_name].rows.findIndex(Function("obj", "return " + chkKhoa));
        else
          idxRowSV = seft.database[msg.obj_name].rows.findIndex((obj) => {
            return obj.id === dataUp.id;
          });
        var cmd = '';
        if (idxRowSV === -1)
          cmd = 'create';
        else
          cmd = 'update';
        if (msg.command.toLowerCase() === "create" && idxRowSV === -1) {
          seft.database[msg.obj_name].rows.push(msg.data_row);
          seft.$emit('update:database', seft.database);
        }
        else if (msg.command.toLowerCase() == "update") {
          if (idxRowSV !== -1)
            seft.database[msg.obj_name].rows[idxRowSV] = msg.data_row;
          else
            seft.database[msg.obj_name].rows.push(msg.data_row);
          seft.$emit('update:database', seft.database);
        }
        else if (msg.command.toLowerCase() === "delete") {
          cmd = 'delete';
          if (idxRowSV !== -1)
            seft.database[msg.obj_name].rows.splice(idxRowSV, 1);
          seft.$emit('update:database', seft.database);
        }
        seft.real.$emit('updatedb', { cmd: cmd, obj_name: msg.obj_name, data: (msg.data_row != null ? msg.data_row : msg.obj) });
      }
    });
    var obj_name = [];
    obj_name.push({ app_id: "dbsys", obj_name: "sys_la_accounts", e_where: { app_id: seft.app_id } });
    if (seft.Uinfos["dev"]) {
      obj_name.push({ app_id: "dbsys", obj_name: "sys_autos", e_where: {} });
      obj_name.push({ app_id: "dbsys", obj_name: "sys_la_routers", e_where: {} });
      obj_name.push({ app_id: "dbsys", obj_name: "sys_apps", e_where: {} });
    }
    const queue = new FunctionQueue(500, 3000);
    obj_name.forEach(function(objTable){
      queue.add(() => new Promise((resolve, reject) => {
          seft.la_obj_tables(objTable, function (objT) {
              resolve(objT); // Hoàn thành công việc, trả về kết quả
          });
      })).then(objT => {
        var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
        seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
        seft.$emit('update:database', seft.database);
        if (seft.Uinfos["dev"]) {
          if (seft.database['sys_apps'])
          {
            seft.chuongtrinh = seft.database['sys_apps'].rows;
            seft.chuongtrinh.push({ id: seft.guid("dbsys"), app_id: "dbsys", app_name: "Cấu trúc Hệ thống" });
            seft.chuongtrinh.push({ id: seft.guid("web"), app_id: "web", app_name: "Cho trang Web" });
          }
        }
      });
    })
    seft.chonUngdung(seft.app_id);
    seft.la_obj_tables({
      app_id: "dbsys", obj_name: "sys_la_accounts", e_where: { email: seft.account_name }, ex_where: `
      if(obj["group_rights"])
      { 
        var user=obj["group_rights"].find(f=>f.users?f.users.find(u=>u.actived && u.email==='`+ seft.account_name + `'):false);
        if(user)
          return true;
      }
      return false;`}, function (msg) {
      if (msg.rows.length > 0) {
        var user = msg.rows[0];
        var acc = user;
        if (user.email !== seft.account_name) {
          var grpIDX = user["group_rights"].findIndex(f => (f.users||[]).find(u => u.actived && u.email === seft.account_name));
          if (grpIDX !== -1) {
            var usIDX = user["group_rights"][grpIDX]["users"].findIndex(u => u.actived && u.email === seft.account_name);
            if (usIDX != -1)
              acc = user["group_rights"][grpIDX]["users"][usIDX];
          }
        }
        seft.user_info = acc;
        acc = seft.base.la_decrypt(acc.pass).split('_____');
        if (acc.length === 2)
          seft.cunrent_pass = acc[1];
      }
    });
  },
  mounted: function() {
  },
  methods: {
    chonUngdung(app_id){
      var seft = this;
      seft.la_obj_tables({ app_id: "dbsys", obj_name: "sys_apps", e_where: { app_id: app_id } }, function (msg) {
        if (msg.rows.length > 0)
          seft.com_logo = msg.rows[0]["f_logo"];
      });
      seft.optionMenuSetting = [];
      seft.la_obj_tables({ app_id: "dbsys", obj_name: "index", e_where: { id: 'menu' } }, function (msgS) {
        if (msgS.rows.length > 0) {
          var sys_app = msgS.rows.find(function (a) { return a.id === 'menu' });
          if (sys_app)
            if (sys_app.hasOwnProperty("struct"))
              seft.optionMenuSys = JSON.parse(seft.la_decrypt(sys_app["struct"]));
          var arrTable = [];
          seft.getAllMenu(seft.optionMenuSys).filter(function (objT) {
            if (objT.table_name && objT.table_name !== '') {
              if (!objT["table"])
                objT["table"] = [];
              objT.table_name.split(/\,/g).forEach(function (oT) {
                if (oT !== "" && !seft.database[oT]) {
                  seft.la_crt_table({
                    app_id: 'dbsys', obj_table: {
                      id: oT, struct: {
                        defaultValue: objT.table.reduce((acc, elem) => {
                          if (!elem["f_types"])
                            elem["f_types"] = "ed";
                          acc[elem.f_name] = elem.f_types.indexOf("num") !== -1 ? 0 : ""
                          return acc;
                        }, {}), fieldsPK: objT.table.filter(f => 1 * f.f_pkid === 1).map(o => o.f_name), fields: objT.table.reduce((acc, elem) => {
                          acc[Object.keys(acc).length] = elem.f_name
                          return acc;
                        }, {})
                      }
                    }
                  }, function () {
                    // seft.la_obj_tables({app_id:'dbsys',obj_name:oT,e_where:{}},function(msgT){
                    //   var dtRows=msgT.rows.filter(r=>(r['app_id'] && !seft.Uinfos["dev"]?r['app_id']===seft.app_id:true));
                    //   seft.database[oT]={id:msgT.id,fields:msgT.fields,fieldsPK:msgT.fieldsPK,rows:dtRows,app_id:'dbsys'};
                    //   seft.$emit('update:database', seft.database);
                    // });
                  });
                  arrTable.push({ app_id: 'dbsys', obj_name: oT, e_where: {} });
                }
              });
            }
          });
          arrTable.forEach(function(objTable){
            seft.la_obj_tables(objTable, function (objT) {
              var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
              seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
              seft.$emit('update:database', seft.database);
            });
          })
          // seft.la_obj_tables({ obj_name: arrTable }, function (msgTables) {
          //   var msgA = [];
          //   if (Array.isArray(msgTables))
          //     msgA = msgTables;
          //   else
          //     msgA.push(msgTables)
          //   msgA.forEach(function (objT) {
          //     var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
          //     seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
          //   });
          //   seft.$emit('update:database', seft.database);
          // });
          // seft.la_obj_tables({ obj_name: arrTable }, function (msgTables) {
          //   var msgA = [];
          //   if (Array.isArray(msgTables))
          //     msgA = msgTables;
          //   else
          //     msgA.push(msgTables)
          //   msgA.forEach(function (objT) {
          //     var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
          //     seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
          //   });
          //   seft.$emit('update:database', seft.database);
          // });
          seft.la_obj_tables({ app_id: seft.app_id, obj_name: "index", e_where: { id: "menu" } }, function (msg) {
            if (msg.rows.length > 0) {
              // if(seft.app_id!=="dbsys")
              // {
              var curent_app = msg.rows.find(function (a) { return a.id === "menu" });
              if (curent_app)
                if (curent_app.hasOwnProperty("struct"))
                  seft.optionMenu = JSON.parse(seft.la_decrypt(curent_app["struct"]));
              // console.log(JSON.stringify(seft.optionMenu));
              var arrTableA = [];
              var TatCaMenu=seft.getAllMenu(seft.optionMenu);
              seft.getAllMenu(seft.optionMenu).filter(function (objT) {
                if (objT.table_name && objT.table_name !== '') {
                  if (!objT["table"])
                    objT["table"] = [];
                  objT.table_name.split(/\,/g).forEach(function (oT) {
                    if (oT !== "" && !seft.database[oT]) {
                      var objBang=TatCaMenu.find(bang=>(bang.table_name?bang.table_name:"").trim()===oT.trim());
                      if(objBang)
                        seft.la_crt_table({
                          app_id: seft.app_id, obj_table: {
                            id: oT, struct: {
                              defaultValue: objBang.table.reduce((acc, elem) => {
                                if (!elem["f_types"])
                                  elem["f_types"] = "ed";
                                acc[elem.f_name] = elem.f_types.indexOf("num") !== -1 ? 0 : ""
                                return acc;
                              }, {}), fieldsPK: objBang.table.filter(f => 1 * f.f_pkid === 1).map(o => o.f_name), fields: objBang.table.reduce((acc, elem) => {
                                acc[Object.keys(acc).length] = elem.f_name
                                return acc;
                              }, {})
                            }
                          }
                      }, function (msgCRT) {

                      });
                      arrTableA.push({ app_id: seft.app_id, obj_name: oT, e_where: {} });
                    }
                  });
                }
              });
              arrTableA.forEach(function(objTable){
                seft.la_obj_tables(objTable, function (objT) {
                  // console.log(objT);
                  var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
                  seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
                  seft.$emit('update:database', seft.database);
                });
              })
              // seft.la_obj_tables({ obj_name: arrTableA }, function (msgTables) {
              //   var msgA = [];
              //   if (Array.isArray(msgTables))
              //     msgA = msgTables;
              //   else
              //     msgA.push(msgTables)
              //   msgA.forEach(function (objT) {
              //     var dtRows = objT.rows.filter(r => (r['app_id'] && !seft.Uinfos["dev"] ? r['app_id'] === seft.app_id : true) && (r['domain'] && !seft.Uinfos["dev"] ? r['domain'] === location.hostname.replace(/www\./g, '') : true));
              //     seft.database[objT['id']] = { id: objT.id, fields: objT.fields, fieldsPK: objT.fieldsPK, rows: dtRows, app_id: seft.app_id };
              //   });
              //   seft.$emit('update:database', seft.database);
              // });
            }
            else if (seft.Uinfos["dev"])
              seft.optionMenu = [];
            // seft.v_links
            seft.la_obj_tables({ app_id: "dbsys", obj_name: "sys_autos", 
              e_where:null,ex_where:`return obj.id.startsWith("`+seft.app_id+`_") && 1*obj.p_type===0;`}, function (objAutos) {
              if (objAutos) {
                objAutos.rows.forEach(function(objC){
                  var code=seft.la_decrypt(objC.p_code);
                  seft.v_links[objC.id]=Function("seft", 'return new Vue('+code+').$mount("#'+objC.id+'")');
                });
              }
            });
            seft.la_obj_tables({ app_id: "dbsys", obj_name: "sys_autos", e_where: { id: seft.app_id, p_type: 0 } }, function (objAutos) {
              if (objAutos) {
                if (objAutos.rows.length > 0)
                  seft.auto_code = seft.la_decrypt(objAutos.rows[0].p_code);
              }
              var tUser = [];
              if (seft.Uinfos["dev"] || (seft.optionMenu.length > 0 && seft.permissions===-1)) 
                tUser.push({ id: "access_rights", label: '01.06. Phân quyền', type_menu: 1, m_icons: 'fa fa-globe', m_show: true });
              tUser = tUser.concat([
                  { id: "changepass", label: '01.07. Mật khẩu', type_menu: 1, m_icons: 'fa fa-key', m_show: true ,permissions:-1},
                  { id: "chat", label: '01.08. Tin Nhắn', type_menu: 1, m_icons: 'far fa-comments', m_show: true ,permissions:-1}
              ]);
              if (seft.Uinfos["dev"])
                tUser.push({ id: "code", label: "01.09. Lập trình", type_menu: 1, m_icons: 'fa fa-code', m_show: true });
              if (seft.auto_code !== "" && (window.hasOwnProperty("process") || window.hasOwnProperty("pywebview"))) {
                if (window.hasOwnProperty("process"))
                  process.setMaxListeners(0);
                tUser.push({ id: "auto", label: '01.00. Cài đặt tự động', m_icons: 'fa fa-magic', m_show: true });
              }
              // tUser.push({ id: "auto", label: '01.00. Cài đặt tự động', m_icons: 'fa fa-magic', m_show: true });
              tUser.push({ id: "logout", label: '01.20. Đăng Xuất', type_menu: 1, m_icons: 'fa fa-power-off text-red', m_show: true ,permissions:-1});
              // console.log(seft.optionMenuSys.filter(function(mnuS){return (seft.Uinfos["dev"]?mnuS["dev"]:!mnuS["dev"]);}));
              var mnuDev = [];
              if (!seft.Uinfos["dev"]) {
                if (seft.optionMenu.length > 0)
                  mnuDev = seft.optionMenuSys.filter(function (mnuS) { return !mnuS["dev"] && seft.permissions===-1; });
              }
              else
                mnuDev = seft.optionMenuSys;
              tUser = tUser.concat(mnuDev);
              seft.optionMenuSetting.push({ id: "user", label: "01. " + (seft.Uinfos["full_name"] || seft.Uinfos["userid"] || "Thông Tin"), m_icons: '', nodes: tUser, m_show: true ,permissions:-1});
              seft.loadRibbonMenuApp();
            });
          });
        }
      });
    },
    assignHierarchicalIds:function(node, parentId = "") {
      var self = this;
      let currentId = parentId ? `${parentId}.` : ""; // Tạo tiền tố ID dựa vào parentId
      let index = 1;

      node.forEach((item) => {
        item.menu_id = `${currentId}${index}`; // Gán menu_id

        // Nếu có các node con, đệ quy xử lý
        if (item.nodes && Array.isArray(item.nodes)) {
          self.assignHierarchicalIds(item.nodes, item.menu_id);
        }
        index++; // Tăng chỉ số cho node tiếp theo
      });
    },
    getAllMenu(arr = [], parent_id){
      var seft = this;
      arr = arr.sort((a, b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
      return arr.reduce((list, { nodes, ...e }) => {
        // console.log(e.type_menu);
        list.push(parent_id ? { ...e, parent_id: parent_id } : e);
        if (nodes) list.push(...seft.getAllMenu(nodes, e.id));
        return list;
      }, []);
    },
    setMenuSetting(){
      var seft = this;
      var mnuApps = JSON.parse(JSON.stringify(seft.optionMenu));
      var mnuSysApps = JSON.parse(JSON.stringify(seft.optionMenuSetting));
      mnuApps.push({ id: "setting", label: 'Hệ thống', m_icons: 'fa fa-cog', nodes: mnuSysApps, m_show: true,permissions:-1});
      seft.ribbonMenuData = seft.sAutoFixMenu(mnuApps, !seft.Uinfos["dev"]);
      // console.log(seft.ribbonMenuData);
      if (seft.ribbonMenuData.length > 0) {
        seft.ribbonMenu.option("items", seft.ribbonMenuData);
        seft.ribbonMenu.option("selectedIndex", 0);
        seft.createContextMenu();
      }
    },
    closeTabs(id){
      var seft = this;
      const selectedIndex = seft.tabsOpens.option("selectedIndex"); // Lấy chỉ số của tab đã chọn
      if (selectedIndex >= 0) {
        const items = seft.tabsOpens.option("items"); // Lấy danh sách các tab
        items.splice(selectedIndex, 1); // Huỷ tab đã chọn
        seft.tabsOpensItems=items;
        seft.key_open = dateFormat(new Date(), 'yyyymmddHHMMss') + Math.floor(Math.random() * 1000);
        // console.log(seft.tabsOpensItems);
        seft.tabsOpens.option("items", items); // Cập nhật lại danh sách tab
        seft.tabsOpens.option("selectedIndex",selectedIndex > 0 ? selectedIndex - 1 : 0); // Chọn tab trước đó hoặc tab đầu tiên
        // if (document.querySelector('#context-' + id))
        //   document.querySelector('#context-' + id).remove();
      }
    },
    menu_call(mnu){
      var seft = this;
      switch (mnu.id) {
        case "account":
          var account_info = DevExpress.ui.dialog.confirm('<div id="tagetApp" class="form-control" style="width: 300px;"></div>', "Thay đổi thông tin tài khoản");
          return account_info.done(function (xacnhan) {
            if (xacnhan) {

            }
          });
        case "changepass":
          var changepass = DevExpress.ui.dialog.confirm('<div id="cPass" style="width: 350px;"></div>', "Đổi mật khẩu");
          seft.frmChangepass = $("#cPass").dxForm({
            formData: { account_name: seft.account_name },
            readOnly: false,
            showColonAfterLabel: true,
            showValidationSummary: true,
            validationGroup: "customerData",
            items: [
              {
                label: {
                  text: "Tài khoản"
                },
                editorOptions: {
                  readOnly: true
                },
                dataField: "account_name"
              },
              {
                label: {
                  text: "Mật khẩu cũ"
                },
                dataField: "opassword",
                editorOptions: {
                  mode: "password",
                  buttons: [{
                    name: 'opassword',
                    location: 'after',
                    options: {
                      icon: 'fa fa-eye',
                      type: 'normal',
                      onClick(e) {
                        var nIcon = '';
                        if (e.component.option('icon').indexOf('fa-eye-slash') !== -1)
                          nIcon = 'fa fa-eye';
                        else
                          nIcon = 'fa fa-eye-slash';
                        seft.frmChangepass.itemOption("opassword").editorOptions.buttons[0].options["icon"] = nIcon;
                        // e.component.option('icon', nIcon);
                        var oe_Options = seft.frmChangepass.itemOption("opassword").editorOptions;
                        var ne_Options = seft.frmChangepass.itemOption("password").editorOptions;
                        var nce_Options = seft.frmChangepass.itemOption("cpassword").editorOptions;
                        if (oe_Options.mode === 'text') {
                          oe_Options.mode = 'password';
                          ne_Options.mode = 'password';
                          nce_Options.mode = 'password';
                        }
                        else {
                          oe_Options.mode = 'text';
                          ne_Options.mode = 'text';
                          nce_Options.mode = 'text';
                        }
                        seft.frmChangepass.itemOption("opassword", "editorOptions", oe_Options);
                        seft.frmChangepass.itemOption("password", "editorOptions", ne_Options);
                        seft.frmChangepass.itemOption("cpassword", "editorOptions", nce_Options);
                        // e.component.option('mode', e.component.option('mode') === 'text' ? 'password' : 'text');
                      },
                    },
                  }]
                },
                validationRules: [{
                  type: "required",
                  message: "Phải nhập mật khẩu cũ"
                }]
              },
              {
                label: {
                  text: "Mật khẩu mới"
                },
                dataField: "password",
                editorOptions: {
                  mode: "password"
                },
                validationRules: [{
                  type: "required",
                  message: "Mật khẩu mới không được để trống"
                }]
              },
              {
                label: {
                  text: "Xác nhận mật khẩu"
                },
                dataField: "cpassword",
                editorType: "dxTextBox",
                editorOptions: {
                  mode: "password"
                },
                validationRules: [{
                  type: "required",
                  message: "Xác nhận mật khẩu mới không được để trống"
                },
                {
                  type: "compare",
                  message: "'Mật khẩu' và 'Xác nhận mật khẩu' không khớp",
                  comparisonTarget: function () {
                    return seft.frmChangepass.getEditor('password').option('value');
                    // return formWidget.option("formData").Password;
                  }
                }]
              }]
          }).dxForm("instance");
          return changepass.done(function (xacnhan) {
            if (xacnhan) {
              var email = seft.frmChangepass.getEditor('account_name').option('value');
              var oPass = seft.frmChangepass.getEditor('opassword').option('value');
              if (oPass !== seft.cunrent_pass)
                canhbao('Mật khẩu cũ chưa đúng');
              else {
                var nPass = seft.frmChangepass.getEditor('password').option('value');
                var ncPass = seft.frmChangepass.getEditor('cpassword').option('value');
                if (nPass === '')
                  canhbao("Mật khẩu mới được để trống");
                else if (nPass === ncPass) {
                  var strPass = seft.base.la_encrypt(email.concat("_____" + nPass));
                  seft.user_info['pass'] = strPass;
                  seft.la_obj_tables({
                    app_id: "dbsys", obj_name: "sys_la_accounts", e_where: { email: seft.account_name }, ex_where: `
                      if(obj["group_rights"])
                      { 
                        var user=obj["group_rights"].find(f=>f.users?f.users.find(u=>u.actived && u.email==='`+ seft.account_name + `'):false);
                        if(user)
                          return true;
                      }
                      return false;`
                  }, function (msg) {
                    if (msg.rows.length > 0) {
                      var user = msg.rows[0];
                      if (user.email !== seft.account_name) {
                        var grpIDX = user["group_rights"].findIndex(f => f.users.find(u => u.actived && u.email === seft.account_name));
                        if (grpIDX !== -1) {
                          var usIDX = user["group_rights"][grpIDX]["users"].findIndex(u => u.actived && u.email === seft.account_name);
                          if (usIDX != -1)
                            user["group_rights"][grpIDX]["users"][usIDX]['pass'] = seft.user_info['pass'];
                        }
                      }
                      else
                        user["pass"] = seft.user_info['pass'];
                      seft.la_obj_updates({ app_id: "dbsys", obj_name: "sys_la_accounts", command: "update", obj_update: user, e_where: { email: user.email } }, function (msgU) {
                        if (msgU.status) {
                          thongbao("Đã cập nhật mật khẩu mới");
                          seft.la_dbs.delete().then(() => {
                            location.reload();
                          }).catch((err) => {
                            thongbao("Could not delete database");
                          }).finally(() => {
                            // Do what should be done next...
                          });
                        }
                        else
                          canhbao("Không thể đổi mật khẩu");
                      });
                    }
                  });
                }
                else
                  canhbao("'Mật khẩu' và 'Xác nhận mật khẩu' không khớp");
              }
            }
          });
        case "logout":
          return seft.logout();
          break;
        default:
          break;
      }
      var fItem = seft.tabsOpens.option("items").findIndex(function (o) { return o.id === mnu.id });
      if (fItem === -1) {
        seft.tabsOpens.option("items").push({ id: mnu.id, data: mnu, close: true }); // Thêm tab mới vào danh sách
        seft.tabsOpens.option("items", seft.tabsOpens.option("items")); // Cập nhật lại các tab
        seft.tabsOpensItems=seft.tabsOpens.option("items");
        seft.tabsOpens.option("selectedIndex",seft.tabsOpens.option("items").length - 1); // Chọn tab mới
      }
      else
        seft.tabsOpens.option("selectedIndex", fItem);
      // seft.tabsOpens.option("selectedIndex", fItem);
      switch (mnu.id) {
        case "code":
          // code block
          break;
        case "auto":
          var func = new Function("seft", 'try{\n ' + seft.auto_code + ' \n} catch (sca_err) {alert(sca_err)}');
          return setTimeout(function () { func(seft) }, 100);
          break;
        case "app":
          // code block
          break;
        case "company":
          break;
        case "access_rights":
          // code block
          break;
        case "notification":
          // code block
          break;
        case "chat":
          break;
        default:
          //Phần này chỉ tải lên những bảng dữ liệu lên lưới và báo cáo
          break;
      }
      if(mnu.v_link)
        setTimeout(function () {seft.v_links[mnu.v_link](seft)}, 300);
    },
    findOption(arrayR, id){
      var seft = this;
      var result;
      arrayR.some(o => result = o.id === id ? o : seft.findOption(o.nodes || [], id));
      return result;
    },
    removeMenu(data, id){
      var seft = this;
      // look to see if object exists
      const index = data.findIndex(x => x.id === id);
      if (index > -1) {
        data.splice(index, 1); // remove the object
      } else {
        // loop over the indexes of the array until we find one with the key
        data.some(x => {
          if (!x.nodes)
            x.nodes = []
          if (x.nodes.length > 0) {
            seft.removeMenu(x.nodes, id);
          }
        })
      }
      seft.updateMenu(data);
    },
    saveMenuApp(){
      var seft = this;
      if(seft.app_id)
      {
        var fApp=seft.chuongtrinh.find(ap=>ap.app_id===seft.app_id);
        if(fApp)
        {
          var newM = JSON.parse(JSON.stringify(fApp));
          newM["nodes"]=seft.optionMenu;
          seft.assignHierarchicalIds(seft.optionMenu);
          seft.optionMenu=newM["nodes"];
          // console.log(newM);
        }
      }
      // seft.removeMenu(seft.optionMenu,'setting');
      seft.la_obj_tables({ app_id: seft.app_id, obj_name: "index", e_where: { id: "menu" } }, function (msg) {
        var info = { id: "menu" }, where = {};
        var cmd = "create";
        if (msg.rows.length > 0) {
          info = msg.rows[0];
          where = { id: "menu" };
          cmd = "update"
        }
        info["struct"] = seft.la_encrypt(JSON.stringify(seft.optionMenu));
        seft.la_obj_updates({ app_id: seft.app_id, obj_name: "index", obj_update: info, command: cmd, e_where: where }, function (msgU) {
          setTimeout(seft.setMenuSetting, 100);
          if (msgU.status)
            thongbao("Đã lưu lại thông tin Menu");
          else
            thongbao("Không thể lưu thông tin Menu");
        });
      });
    },
    updateNestedObj(data, objU){
      var seft = this;
      // look to see if object exists
      const index = data.findIndex(x => x.id === objU.id);
      if (index > -1) {
        data[index] = objU; // remove the object
      } else {
        // loop over the indexes of the array until we find one with the key
        data.some(x => {
          if (!x.nodes)
            x.nodes = []
          if (x.nodes.length > 0) {
            seft.updateNestedObj(x.nodes, objU);
          }
        })
      }
    },
    updateMenu(optionConfig)
    {
      var seft = this;
      seft.updateNestedObj(seft.optionMenu, optionConfig);
      seft.setMenuSetting();
      seft.key_menu = dateFormat(new Date(), 'yyyymmddHHMMss') + Math.floor(Math.random() * 1000);
    },
    menu_config(id, cmd){
      var seft = this;
      id = id.replace("_nodes", "");
      var mnu = seft.findOption(seft.optionMenu, id);
      // console.log(id,mnu,seft.optionMenu);
      if (cmd === 'addchild') {
        if (id === 'root') {
          var newID = seft.guid("");
          seft.optionMenu.push({ id: newID, label: "Tên menu mới" });
          mnu = seft.findOption(seft.optionMenu, newID);
          seft.updateMenu(mnu);
          // console.log(mnu);
        }
        else {
          var newC = JSON.parse(JSON.stringify(mnu));
          if (!mnu.hasOwnProperty("nodes"))
            mnu["nodes"] = [];
          newC.id = seft.guid("");
          newC.label = "Tên menu mới";
          newC["table_name"] = "";
          newC["table"] = [];
          delete newC["nodes"];
          mnu["nodes"].push(newC);
          seft.updateMenu(mnu);
          mnu = seft.findOption(seft.optionMenu, newC.id);
        }
      }
      else if (cmd === 'delete') {
        seft.closeTabs(id);
        seft.removeMenu(seft.optionMenu, id);
        // seft.saveMenuApp();
        seft.key_menu = dateFormat(new Date(), 'yyyymmddHHMMss') + Math.floor(Math.random() * 1000);
        return;
      }
      else if (cmd === "editnode") {
        var fItem = seft.tabsOpensItems.findIndex(function (o) { return o.id === mnu.id });
        if (fItem === -1) {
          var itemAdd = { id: mnu.id, data: mnu, edit: true, close: true };
          seft.tabsOpensItems.push(itemAdd);
          seft.tabsOpens.option("items", seft.tabsOpensItems);
          fItem = seft.tabsOpensItems.findIndex(function (o) { return o.id === mnu.id });
        }
        seft.tabsOpens.option("selectedIndex", fItem);
        // seft.setMenuSetting();
      }
      else if (cmd === 'copy')
        seft.objCopy = JSON.parse(JSON.stringify(mnu));
      else if (cmd === 'pasteConfig') {
        if (!seft.objCopy) {
          canhbao('Bạn chưa chép menu nào để sao chép qua đây')
          return;
        }
        var newC = JSON.parse(JSON.stringify(seft.objCopy));
        newC["id"] = mnu["id"];
        newC["label"] = mnu["label"];
        newC["m_icons"] = mnu["m_icons"];
        mnu = newC;
        if (newC["nodes"]) {
          var mnuNodes = [];
          newC["nodes"].forEach(function (mnuC) {
            mnuC.id = seft.guid("");
            mnuNodes.push(mnuC);
          });
          if (mnuNodes.length > 0)
            mnu["nodes"] = mnuNodes;
        }
        seft.updateMenu(mnu);
        seft.objCopy = false;
      }
      else if (cmd === 'paste') {
        if (!seft.objCopy) {
          canhbao('Bạn chưa chép menu nào để sao chép qua đây')
          return;
        }
        var newC = JSON.parse(JSON.stringify(seft.objCopy));
        if (mnu) {
          if (!mnu.hasOwnProperty("nodes"))
            mnu["nodes"] = [];
        }
        newC.id = seft.guid("");
        if (id === 'root') {
          seft.optionMenu.push(newC);
          mnu = seft.findOption(seft.optionMenu, newC.id);
        }
        else
          mnu["nodes"].push(newC);
        seft.updateMenu(mnu);
        seft.objCopy = false;
      }
      else if (cmd === 'move') {
        var optString = '';
        seft.getAllMenu(seft.optionMenu).forEach(function (mnu) {
          optString += `<option value="${mnu.id}">${mnu.label}</option>`;
        });
        var template = `<select id="tagetMenu" class="select2 form-control">${optString}</select>`;
        var chonGoc = DevExpress.ui.dialog.confirm(`${template}`, "Di chuyển đến menu");
        chonGoc.done(function (dialogResult) {
          if (dialogResult) {
            if (document.querySelector('.dx-dialog-message #tagetMenu')) {
              var pNodeID = document.querySelector('.dx-dialog-message #tagetMenu').value;
              seft.objCopy = JSON.parse(JSON.stringify(mnu));
              seft.closeTabs(seft.objCopy.id);
              seft.removeMenu(seft.optionMenu, seft.objCopy.id);
              mnu = seft.findOption(seft.optionMenu, pNodeID);
              var newC = JSON.parse(JSON.stringify(seft.objCopy));
              if (!mnu.hasOwnProperty("nodes"))
                mnu["nodes"] = [];
              //seft.getAllMenu(seft.optionMenu)
              mnu["nodes"].push(newC);
              seft.updateMenu(mnu);
              seft.objCopy = false;
            }
          }
        });
      }
    },
    createContextMenu(){
      var seft = this;
      if (!seft.Uinfos["dev"])
        return;
      setTimeout(function () {
        $('.ribbon-context-menu-root').dxContextMenu({
          dataSource: [
            // {
            //   text: 'Share',
            //   items: [
            //     { text: 'Facebook' },
            //     { text: 'Twitter' }],
            // },
            { id: 'addchild', parent: 'root', text: 'Thêm con' },
            { id: 'paste', parent: 'root', text: 'Dán vào menu chính' },
            { id: 'choseapp', parent: 'root', text: 'Thiết lập menu' },
            { id: 'save', parent: 'root', text: 'Lưu' }
          ],
          width: 200,
          target: '.ribbon-menu .dx-tabs-wrapper',
          onItemClick(e) {
            if (!e.itemData.items) {
              if (e.itemData.id === 'addchild' || e.itemData.id === 'paste')
                seft.menu_config(e.itemData.parent, e.itemData.id);
              else if (e.itemData.id === 'choseapp') {
                var chonApp = DevExpress.ui.dialog.confirm('<div id="tagetApp" class="form-control"></div>', "CHỌN CHƯƠNG TRÌNH");
                setTimeout(function () {
                  seft.editableApps = $("#tagetApp").dxSelectBox({
                    searchEnabled: true,
                    items: seft.chuongtrinh,
                    acceptCustomValue: true,
                    onCustomItemCreating: function (data) {
                      var d = $.Deferred();
                      var result = DevExpress.ui.dialog.confirm('<input type="text" id="app_id_new" value="" placeholder="Mã Chương Trình" class="form-control"/>', "Thêm chương trình mới?");
                      result.done(function (rApp) {
                        if (rApp) {
                          if (document.querySelector('.dx-dialog-message #app_id_new')) {
                            var newItem = { id: document.querySelector('.dx-dialog-message #app_id_new').value, app_id: document.querySelector('.dx-dialog-message #app_id_new').value, app_name: data.text };
                            seft.la_obj_update({ app_id: "dbsys", obj_name: "sys_apps", obj_update: newItem, command: "create", e_where: {} }, function (msgA) {
                              seft.chuongtrinh.push(newItem);
                              seft.editableApps.option("items", seft.chuongtrinh);
                              d.resolve(newItem);
                              thongbao("Đã tạo xong ứng dụng mới");
                            });
                          }
                        }
                        else {
                          thongbao("Đã hủy việc tạo mới ứng dụng");
                          d.reject();
                        }
                      });
                      return d;
                    },
                    valueExpr: "app_id",
                    displayExpr: "app_name"
                  }).dxSelectBox("instance");
                }, 50);
                chonApp.done(function (cApp) {
                  if (cApp) {
                    if (seft.editableApps) {
                      seft.app_id = seft.editableApps.option('value');
                      seft.chonUngdung(seft.app_id);
                    }
                  }
                });
              }
              else if (e.itemData.id === 'save')
                seft.saveMenuApp();
              // DevExpress.ui.notify(`The "${e.itemData.text}" item was clicked`, 'success', 1500);
            }
          },
        });
        document.querySelectorAll('.ribbon-menu .dx-tabs-wrapper .dx-tab-text:not(#setting)').forEach(function (el) {
          var qry = '.ribbon-menu .dx-tabs-wrapper .dx-tab-text[id="' + el.getAttribute('id') + '"]';
          $('.' + el.getAttribute('id')).remove();
          $('<div class="' + el.getAttribute('id') + '"></div>').appendTo(qry);
          $('.' + el.getAttribute('id')).dxContextMenu({
            dataSource: [
              { id: 'addchild', parent: el.getAttribute('id'), text: 'Thêm con cho ' + el.innerText },
              { id: 'editnode', parent: el.getAttribute('id'), text: 'Cấu hình cho ' + el.innerText },
              { id: 'copy', parent: el.getAttribute('id'), text: 'Sao chép ' + el.innerText },
              { id: 'paste', parent: el.getAttribute('id'), text: 'Dán vào ' + el.innerText },
              { id: 'pasteConfig', parent: el.getAttribute('id'), text: 'Dán chỉ nội dung vào ' + el.innerText },
              { id: 'move', parent: el.getAttribute('id'), text: 'Di chuyển ' + el.innerText },
              { id: 'delete', parent: el.getAttribute('id'), text: 'Xóa cho ' + el.innerText }
            ],
            width: 200,
            target: qry,
            onItemClick(e) {
              if (!e.itemData.items) {
                seft.menu_config(e.itemData.parent, e.itemData.id);
                // // // console.log(e.itemData)
                // DevExpress.ui.notify(`The "${e.itemData.text}" item was clicked`, 'success', 1500);
              }
            },
          });
        });
        document.querySelectorAll('.ribbon-menu .dx-tabpanel-container .office-outer:not(#setting) .office-note').forEach(function (el) {
          var qry = '.ribbon-menu .dx-tabpanel-container .office-outer:not(#setting) .office-note[id="' + el.getAttribute('id') + '"]';
          $('.' + el.getAttribute('id')).remove();
          $('<div class="' + el.getAttribute('id') + '"></div>').appendTo(qry);
          $('.' + el.getAttribute('id')).dxContextMenu({
            dataSource: [
              { id: 'addchild', parent: el.getAttribute('id'), text: 'Thêm con cho ' + el.innerText },
              { id: 'editnode', parent: el.getAttribute('id'), text: 'Cấu hình cho ' + el.innerText },
              { id: 'copy', parent: el.getAttribute('id'), text: 'Sao chép ' + el.innerText },
              { id: 'paste', parent: el.getAttribute('id'), text: 'Dán vào ' + el.innerText },
              { id: 'pasteConfig', parent: el.getAttribute('id'), text: 'Dán chỉ nội dung vào ' + el.innerText },
              { id: 'move', parent: el.getAttribute('id'), text: 'Di chuyển ' + el.innerText },
              { id: 'delete', parent: el.getAttribute('id'), text: 'Xóa cho ' + el.innerText }
            ],
            width: 200,
            target: qry,
            onItemClick(e) {
              if (!e.itemData.items) {
                seft.menu_config(e.itemData.parent, e.itemData.id);
                // // console.log(e.itemData)
                // DevExpress.ui.notify(`The "${e.itemData.text}" item was clicked`, 'success', 1500);
              }
            },
          });
        });
        document.querySelectorAll('.ribbon-menu .dx-tabpanel-container .office-outer:not(#setting) .btn').forEach(function (el) {
          if (!document.querySelector('.ribbon-menu .dx-tabs-wrapper .dx-tab-text[id="' + el.getAttribute('id') + '"]')) {
            // console.log(el.getAttribute('id'))
            var qry = '.ribbon-menu .dx-tabpanel-container .office-outer:not(#setting) .btn[id="' + el.getAttribute('id') + '"]';
            $('.' + el.getAttribute('id')).remove();
            $('<div class="' + el.getAttribute('id') + '"></div>').appendTo(qry);
            $('.' + el.getAttribute('id')).dxContextMenu({
              dataSource: [
                { id: 'addchild', parent: el.getAttribute('id'), text: 'Thêm con cho ' + el.innerText },
                { id: 'editnode', parent: el.getAttribute('id'), text: 'Cấu hình cho ' + el.innerText },
                { id: 'copy', parent: el.getAttribute('id'), text: 'Sao chép ' + el.innerText },
                { id: 'paste', parent: el.getAttribute('id'), text: 'Dán vào ' + el.innerText },
                { id: 'pasteConfig', parent: el.getAttribute('id'), text: 'Dán chỉ nội dung vào ' + el.innerText },
                { id: 'move', parent: el.getAttribute('id'), text: 'Di chuyển ' + el.innerText },
                { id: 'delete', parent: el.getAttribute('id'), text: 'Xóa cho ' + el.innerText }
              ],
              width: 200,
              target: qry,
              onItemClick(e) {
                if (!e.itemData.items) {
                  seft.menu_config(e.itemData.parent, e.itemData.id);
                  // console.log(e.itemData)
                  // DevExpress.ui.notify(`The "${e.itemData.text}" item was clicked`, 'success', 1500);
                }
              },
            });
          }
        });
      }, 100);
    },
    loadRibbonMenuApp(){
      var seft = this;
      seft.tabsOpens = $(".ribbon-content-wrapper .sca4u-tabs-open").dxTabs({
        animationEnabled: false,
        scrollingEnabled: true,
        scrollByContent: true,
        showNavButtons: true,
        swipeEnabled: false,
        deferRendering: true,
        repaintChangesOnly: true,
        noDataText: "",
        onSelectionChanged: function (e) {
          var mnu = e.addedItems[0];
          if (mnu) {
            $('.sca4u-tabs-context .dx-multiview-item-container [id^="context"]').removeClass("dx-multiview-item-hidden");
            $('.sca4u-tabs-context .dx-multiview-item-container [id^="context"]').removeClass("dx-item-selected");
            $('.sca4u-tabs-context .dx-multiview-item-container [id^="context"]').addClass("dx-multiview-item-hidden");
            setTimeout(function () {
              $("#context-" + mnu.id).removeClass("dx-multiview-item-hidden");
              $("#context-" + mnu.id).addClass("dx-item-selected");
            }, 50);
          }
        },
        itemTemplate: function (itemData, itemIndex, itemElement) {
          if (itemData.close) {
            itemElement.append("<span class='dx-tab-text' style='padding-right: 5px;' id='title_" + itemData.id + "'><span>" + seft.getNameMenu(itemData.data.label) + "</span><i class='fa fa-times text-red' id='close-" + itemData.id + "' style='top: 1px; position: absolute; right: 3px;'></i></span>");
            setTimeout(function () {
              if (document.querySelector('#close-' + itemData.id))
                document.querySelector('#close-' + itemData.id).addEventListener("click", function () {
                  seft.closeTabs(itemData.id);
                });
            }, 0)
          }
          else
            itemElement.append("<span class='dx-tab-text' id='" + itemData.id + "'>" + seft.getNameMenu(itemData.data.label) + "</span>");
        },
        onItemClick(e) {
          // $(".tab-pane").removeClass( "show active" )
          // $("#panel-"+e.itemData.id).addClass( "show active" )
        },
        width: '100%',
        items: []
      }).dxTabs('instance');
      // alert(seft.ribbonMenuData.length);
      seft.ribbonMenu = $(".ribbon-menu .sca4u-tabs").dxTabs({
        items: [],
        animationEnabled: false,
        scrollingEnabled: true,
        scrollByContent: true,
        showNavButtons: true,
        swipeEnabled: false,
        onSelectionChanged: function (e) {
          var mnu = e.addedItems[0];
          if (mnu) {
            seft.ribbonMenuItem = mnu;
            $(".ribbon-menu .dx-tabpanel-container .dx-multiview-item-container>.dx-item").removeClass("dx-multiview-item-hidden");
            $(".ribbon-menu .dx-tabpanel-container .dx-multiview-item-container>.dx-item").removeClass("dx-item-selected");
            $(".ribbon-menu .dx-tabpanel-container .dx-multiview-item-container>.dx-item").addClass("dx-multiview-item-hidden");
            setTimeout(function () {
              $("#panel-" + mnu.id).removeClass("dx-multiview-item-hidden");
              $("#panel-" + mnu.id).addClass("dx-item-selected");
            }, 50);
          }
        },
        itemTemplate: function (itemData, itemIndex, itemElement) {
          itemElement.append("<span class='dx-tab-text' id='" + itemData.id + "'><i class='dx-icon " + (itemData.m_icons ? itemData.m_icons : 'fa fa-question') + "'></i>" + seft.getNameMenu(itemData.label) + "</span>");
        },
        onItemClick(e) {

        },
        width: '100%'
      }).dxTabs('instance');
      seft.setMenuSetting();
    },
    sAutoFixMenu(arr = [], chkRight = false){
      var seft = this;
      arr = arr.sort((a, b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
      if (!seft.Uinfos["dev"])
        arr = arr.filter(m => m.m_show === true);
      var nArr = [], cItem = 0;
      var oidP = false;
      arr.forEach(function (oT) {
        if (chkRight && seft.permissions!==-1 && oT.permissions!==-1) {
          if((seft.menus_permissions[oT.menu_id]&1)===0)
            oT = false;
        }
        if (oT) {
          if (!oT["nodes"])
            oT["nodes"] = [];
          if (oT["nodes"].length > 0) {
            if (!seft.Uinfos["dev"])
              oT["nodes"] = seft.sAutoFixMenu(oT["nodes"].filter(m => m.m_show === true), chkRight);
            else
              oT["nodes"] = seft.sAutoFixMenu(oT["nodes"], chkRight);
          }
          if (1 * oT["type_menu"] === 1) {
            if (!oidP || cItem === 3) {
              cItem = 0;
              var nItem = JSON.parse(JSON.stringify(oT));
              oidP = oT.id + "_nodes";
              nItem["id"] = oidP;
              nItem["nodes"] = [];
              nItem["nodes"].push(oT);
              nArr.push(nItem);
            }
            else {
              var idxP = nArr.findIndex((obj) => {
                return obj.id === oidP;
              });
              if (idxP !== -1)
                nArr[idxP]["nodes"].push(oT);
            }
            cItem++;
          }
          else {
            oidP = false;
            nArr.push(oT);
          }
        }
      });
      return nArr;
    },
    sortAllMenu(arr = []){
      var seft = this;
      arr = arr.sort((a, b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
      var oidP = false;
      return arr.reduce((list, { nodes, ...e }) => {
        if (nodes) {
          nodes = seft.sortAllMenu(nodes);
          e["nodes"] = nodes;
        }
        list.push(e);
        return list;
      }, []);
    },
    mnu_call(m_app_id, m_configs){
      var seft = this;
      seft.$router.replace({ name: "grid", force: true, params: { app_id: m_app_id, id: dateFormat(new Date(), 'yymmddHHMMss'), Uinfos: seft.Uinfos, m_configs: m_configs } });
      // this.$router.replace({name: "Home" });
      // alert(JSON.stringify(this.$router.resolve({name: "writer"})));
      // this.$router.replace({name: "writer", force: true,params:{id:dateFormat(new Date(),'yymmddHHMMss'),Uinfos:this.Uinfos}});
    },
    logout(hideAsk){
      var seft = this;
      if (hideAsk) {
        seft.la_dbs.delete().then(() => {
          location.reload();
        }).catch((err) => {
          thongbao("Could not delete database");
        }).finally(() => {
          // Do what should be done next...
        });
      }
      else {
        var dxuat = DevExpress.ui.dialog.confirm("<i class='text-red text-bold'>Có chắc bạn là kết thúc phiên làm việc không?</i>", "THÔNG BÁO");
        dxuat.done(function (dialogResult) {
          if (dialogResult)
            seft.la_dbs.delete().then(() => {
              location.reload();
            }).catch((err) => {
              thongbao("Could not delete database");
            }).finally(() => {
              // Do what should be done next...
            });
        });
      }
    },
    getIMG: function() {
      // alert(JSON.stringify(this.user_infos))
      return "";
      // return './'+comInfoBase.f_logo;
    },
    reloadToHome: function() {
      if (vm.extention)
        location.href = "/app/apps.html";
      else
        location.href = "/";
    },
    menu_toggle: function() {
      $(".sidebar").toggle();
    },
    setLang(lang) {
      this.$translate.setLang(lang);
    },
    translatedInput: function(value) {
      return this.t(value);
    },
    getNameMenu(label){
      if (label) {
        var splName = label.split(/\./g);
        return splName[splName.length - 1];
      }
      else
        return '';
    }
  },
  template: `
    <div class="wrapper">
      <div class="ribbon-context-menu-root"></div>
      <div class="ribbon-menu dx-multiview dx-swipeable dx-tabpanel dx-widget dx-visibility-change-handler dx-collection" style="height: 133px;">
        <div class="dx-tabpanel-tabs">
          <div class="sca4u-tabs"></div>
        </div>
        <div class="dx-tabpanel-container" style="margin-top: -31px; padding-top: 31px;">
          <div class="dx-multiview-wrapper">
            <div class="dx-multiview-item-container" :key="key_menu">
              <div v-for="lvl in ribbonMenuData" class="dx-item dx-multiview-item dx-multiview-item-hidden" role="tabpanel" :id="'panel-'+lvl.id" style="transform: translate(0px, 0px);">
                <div class="dx-item-content dx-multiview-item-content">
                  <div class="office-outer" :id="lvl.id">
                    <div class="office-inner">
                      <div v-if="!lvl['nodes']" class="office-panel" style="height: 83px;">
                        <div class="office-grp">
                          <div class="btn btn-app" v-on:click="menu_call(lvl)" :id="lvl.id" style="height: 80px;border: none;margin: 0px;background: transparent;">
                            <i :class="lvl.m_icons?lvl.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl.label)}}
                          </div>
                        </div>
                      </div>
                      <div v-else-if="lvl['nodes'].length===0" class="office-panel" style="height: 83px;">
                        <div class="office-grp">
                          <div class="btn btn-app" v-on:click="menu_call(lvl)" :id="lvl.id" style="height: 80px;border: none;margin: 0px;background: transparent;">
                            <i :class="lvl.m_icons?lvl.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl.label)}}
                          </div>
                        </div>
                      </div>
                      <div v-else-if="!Uinfos['dev'] && lvl['nodes'].length>0 && 1*lvl.type_form===2" class="office-panel" style="height: 83px;">
                        <div class="office-grp">
                          <div class="btn btn-app" v-on:click="menu_call(lvl)" :id="lvl.id" style="height: 80px;border: none;margin: 0px;background: transparent;">
                            <i :class="lvl.m_icons?lvl.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl.label)}}
                          </div>
                        </div>
                      </div>
                      <div v-else v-for="lvl2 in lvl.nodes" class="office-panel">
                        <div v-if="!lvl2['nodes']" class="office-grp" style="height: 80px;">
                          <div v-on:click="menu_call(lvl2)" class="btn btn-app" :id="lvl2.id" style="height: 80px;border: none;margin: 0px;background: transparent;">
                            <i :class="lvl2.m_icons?lvl2.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl2.label)}}
                          </div>
                        </div>
                        <div v-else-if="lvl2['nodes'].length===0" class="office-grp" style="height: 80px;">
                          <div v-on:click="menu_call(lvl2)" class="btn btn-app" :id="lvl2.id" style="height: 80px;border: none;margin: 0px;background: transparent;">
                            <i :class="lvl2.m_icons?lvl2.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl2.label)}}
                          </div>
                        </div>
                        <div class="office-grp" v-else-if="Uinfos['dev'] || 1*lvl2.type_form!==2" >
                          <div v-if="1*lvl2.type_form===2" class="dropdown">
                              <button class="btn btn-app dropdown-toggle" type="button" :id="lvl2.id" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i :class="lvl2.m_icons?lvl2.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl2.label)}}
                              </button>
                              <div class="dropdown-menu" :aria-labelledby="lvl2.id">
                                <button type="button" v-on:click="menu_call(lvl3)" :id="lvl3.id" v-for="lvl3 in lvl2.nodes" class="btn btn-xs btn-flat text-left text-white p-1">
                                  <i :class="lvl3.m_icons?lvl3.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl3.label)}}
                                </button>
                              </div>
                          </div>
                          <div v-else v-for="lvl3 in lvl2.nodes">
                            <div v-if="Uinfos['dev'] && 1*lvl3.type_form===2" class="dropdown">
                                <button class="btn btn-app dropdown-toggle" type="button" :id="lvl3.id" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                  <i :class="lvl3.m_icons?lvl3.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl3.label)}}
                                </button>
                                <div class="dropdown-menu" :aria-labelledby="lvl3.id">
                                  <button type="button" :id="lvl4.id" v-for="lvl4 in lvl3.nodes" class="btn btn-xs btn-flat text-left text-white p-1">
                                    <i :class="lvl4.m_icons?lvl4.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl4.label)}}
                                  </button>
                                </div>
                            </div>
                            <div v-else-if="1*lvl3['type_menu']!==1" :id="lvl3.id" v-on:click="menu_call(lvl3)" class="btn btn-app"><i :class="lvl3.m_icons?lvl3.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl3.label)}}</div>
                            <div v-else-if="lvl3['nodes']&&lvl3['nodes'].length>0" class="d-flex flex-column">
                              <button type="button" v-on:click="menu_call(lvl4)" :id="lvl4.id" v-for="lvl4 in lvl3.nodes" style="padding: 0px 3px 0px 3px !important;" class="btn btn-xs btn-flat text-left text-white p-0">
                                <i :class="lvl4.m_icons?lvl4.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl4.label)}}
                              </button>
                            </div>
                          </div>
                        </div>
                        <div class="office-grp" v-else>
                          <div v-if="1*lvl2['type_menu']!==1" :id="lvl2.id" v-on:click="menu_call(lvl2)" class="btn btn-app" :style="1*lvl2.type_form===2?'height: 80px;':''"><i :class="lvl2.m_icons?lvl2.m_icons:'fa fa-question'"></i>{{getNameMenu(lvl2.label)}}</div>
                          <div v-else-if="lvl2['nodes']&&lvl2['nodes'].length>0" class="d-flex flex-column"></div>
                        </div>
                        <div v-if="(Uinfos['dev'] || 1*lvl2.type_form!==2) && lvl2['nodes'] && lvl2['nodes'].length>0" :id="lvl2.id" class="office-note">{{getNameMenu(lvl2.label)}}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="ribbon-content-wrapper dx-multiview dx-swipeable dx-tabpanel dx-widget dx-visibility-change-handler dx-collection">
        <div class="dx-tabpanel-tabs">
          <div class="sca4u-tabs-open"></div>
        </div>
        <div class="dx-tabpanel-container sca4u-tabs-context" style="margin-top: -31px; padding-top: 31px;">
          <div class="dx-multiview-wrapper">
            <div class="dx-multiview-item-container">
              <div v-for="tapO in tabsOpensItems" class="dx-item dx-multiview-item dx-multiview-item-hidden" role="tabpanel" :key="key_open+tapO.id" :id="'context-'+tapO.id" style="transform: translate(0px, 0px);">
                <div class="dx-item-content dx-multiview-item-content">
                  <baocao :real="real" :menus_permissions="menus_permissions" :com_logo="com_logo" :database.sync="database" :base="base" :menusapp="optionMenu" :getAllMenu="getAllMenu" class="la_full_width" v-if="!tapO.edit && !tapO.data.table_name && !(tapO.data.trigger?tapO.data.trigger['load_db']:false) && tapO.data.report_name" :Uinfos="Uinfos" :m_configs="tapO.data" :app_id="app_id"></baocao>
                  <grid :real="real" :permissions="permissions" :menus_permissions="menus_permissions" :com_logo="com_logo" :database.sync="database" :base="base" :menusapp="optionMenu" :getAllMenu="getAllMenu" class="la_full_width" v-else-if="!tapO.edit && (tapO.data.table_name||(tapO.data.trigger?tapO.data.trigger['load_db']:false))" :Uinfos="Uinfos" :m_configs="tapO.data" :app_id="app_id"></grid>
                  <dev :real="real" :menus_permissions="menus_permissions" :database.sync="database" :base="base" class="la_full_width" v-else-if='tapO.id==="code"'></dev>
                  <div :real="real" :menus_permissions="menus_permissions" :database.sync="database" :base="base" class="la_full_width" id="autoPanel" v-else-if='tapO.id==="auto"'></div>
                  <config :real="real" :menus_permissions="menus_permissions" :database.sync="database" :base="base" style="overflow: scroll;" class="la_full_width" v-else-if='tapO.edit' :Uinfos="Uinfos" :m_configs="tapO.data" :updateMenu="updateMenu" :app_menus="optionMenu" :app_id="app_id"></config>
                  <chat :real="real" :menus_permissions="menus_permissions" :Uinfos="Uinfos" :database.sync="database" :base="base" class="la_full_width" :m_configs="tapO.data" v-else-if='tapO.id==="chat"'></chat>
                  <access_right :real="real" :app_id="app_id" :Uinfos="Uinfos" :app_menus="optionMenu" :app_menus_sys="optionMenuSys" :database.sync="database" :base="base" class="la_full_width" :m_configs="tapO.data" v-else-if='tapO.id==="access_rights"'></access_right>
                  <div v-else-if='tapO.data.v_link!==""' :id="tapO.data.v_link"></div>
                  <div v-else>Tính năng này đang phát triển và sẽ được cập nhật sớm nhất</div>
                </div>
              </div> 
            </div>
          </div>
        </div>
      </div>
    </div>`,
    components: {
    "grid": la_grid,
      "dev": la_dev,
        "chat": la_chat,
          "access_right": la_access_right,
            "config": la_config,
              "baocao": la_baocao
  },
  style: `
    .wrapper {
      background: white;
    }
    ::-webkit-scrollbar-corner { background: rgba(0,0,0,0.5); }
    * {
        scrollbar-width: thin;
        scrollbar-color: var(--scroll-bar-color) var(--scroll-bar-bg-color);
    }

    /* Works on Chrome, Edge, and Safari */
    *::-webkit-scrollbar {
        width: 12px;
        height: 12px;
    }

    *::-webkit-scrollbar-track {
        background: var(--scroll-bar-bg-color);
    }

    *::-webkit-scrollbar-thumb {
        background-color: var(--scroll-bar-color);
        border-radius: 20px;
        border: 3px solid var(--scroll-bar-bg-color);
    }
    .ribbon-content-wrapper{
      height: calc(100vh - calc(3.5rem + 17px) - calc(3.5rem + 17px)) !important;
      max-height: calc(100vh - calc(3.5rem + 17px) - calc(3.5rem + 17px)) !important;
      margin: 5px;
      overflow: auto;
    }
    .ribbon-content-wrapper .grdSCA4U {
      height: inherit;
      width: inherit;
      padding: 5px;
    }
    .ribbon-content-wrapper .dx-tabpanel-tabs .dx-tab{
      border-top-left-radius: 9px;
      border-top-right-radius: 9px;
    }
    .ribbon-content-wrapper .dx-tabpanel-tabs .dx-tab-selected::after
    {
      border:none
    }
    .ribbon-menu .dx-tabs-wrapper{
      background:transparent !important;
    }
    .ribbon-menu .dx-tab:not(.dx-tab-selected){
      background:transparent !important;
      border:none;
      -webkit-box-shadow: none !important;
      box-shadow: none !important;
    }
    .ribbon-menu .dx-tab-selected{
      background: white !important;
      font-weight: bold;
      border: 1px solid;
      border-bottom: none;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
    }
    .ribbon-menu .dx-tab:not(.dx-tab-selected):hover{
      color:#243b6a;
      font-weight: bold;
      background-color: rgba(189, 196, 210, 0.3) !important;
      background: rgba(189, 196, 210, 0.3) !important;
      box-shadow: rgba(189, 196, 210, 0.35) 0px 5px 15px;
    }
    .ribbon-content-wrapper .dx-tabpanel-tabs .dx-tabs{
      border: none;
      background-color: transparent;
      -webkit-box-shadow: none !important;
      box-shadow: none !important;
    }
    .layout-navbar-fixed .content-wrapper{
      background: transparent;
    }
    .layout-navbar-fixed .wrapper{
      background: #567887;
    }
    .layout-fixed .ribbon-tabs-open{
      padding-left: 5px;
      padding-right: 5px;
      border: none;
      margin-top: 3px;
      border-bottom: 1px solid #fff;
    }
    .layout-fixed .ribbon-menu
    {
      padding: 5px;
      background: transparent;
      background: linear-gradient(rgb(174 178 203) 0%,#1c325c 15%,#2D4370 100%) !important;
      background: -moz-linear-gradient(rgb(174 178 203) 0%,#1c325c 15%,#2D4370 100%) !important;
      background: -webkit-linear-gradient(rgb(174 178 203) 0%,#1c325c 15%,#2D4370 100%) !important;
    }
    .layout-fixed .ribbon-menu .dx-tabpanel-tabs .dx-tabs {
      -webkit-box-shadow: none;
      box-shadow: none;
    }
    .layout-fixed .dx-tabpanel-container {
      background: transparent;
    }
    .layout-fixed .dx-multiview-wrapper {
      background: white;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tabs
    {
      background: transparent !important;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tabs .dx-tab-selected .dx-tab-content {
      color: #243b6a;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tabs .dx-tab-selected .dx-icon{
      color: #243b6a;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tabs .dx-tab:not(.dx-tab-selected) .dx-tab-content {
      color: #fff;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tabs .dx-tab:not(.dx-tab-selected) .dx-tab-content .dx-icon{
      color: #fff;
    }
    .office-outer .office-note{
      color:white !important;
      background:#243b6a !important;
      font-weight: bold;
    }
    .office-grp .flex-column{
      height: 60px;
      color:#fff;
      background: linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -moz-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -webkit-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      margin-left: 1px !important;
    }
    .office-grp .flex-column button>i{
      padding-right: 2px;
    }
    .office-grp .btn-app{
      color:#fff;
      background: linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -moz-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -webkit-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      margin-left: 1px !important;
    }
    .office-grp .dropdown-menu{
      padding: 3px;
    }
    .office-grp .dropdown-menu i{
      padding-right: 3px;
    }
    .office-grp .dropdown-menu button{
      color:#fff;
      background: linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -moz-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      background: -webkit-linear-gradient(#667697 0%,#3a4f79 17%, #243b6a 81%) !important;
      border: 1px solid;
      border-radius: 3px;
    }
    .office-grp .dropdown-menu button:hover{
      background: linear-gradient(#667697 0%,#3a4f79 45%, #243b6a 70%) !important;
      background: -moz-linear-gradient(#667697 0%,#3a4f79 45%, #243b6a 70%) !important;
      background: -webkit-linear-gradient(#667697 0%,#3a4f79 45%, #243b6a 70%) !important;
      border: 1px solid;
      border-radius: 3px;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tab{
      border: none;
    }
    .ribbon-menu .dx-tabpanel-tabs .dx-tab:hover{
      border: none;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
      background-color: rgba(0, 0, 0, 0.18);
    }
    .dx-item-content .office-grp .btn-app:hover
    {
      box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px !important;
      border-radius: 3px;
      border: 1px solid #7E7E7E !important;
    }
    .dx-item-content .office-grp .flex-column .btn-xs:hover
    {
      box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px !important;
      border-radius: 3px;
      border: 1px solid #7E7E7E !important;
    }
    .dx-tabpanel-container {
      background: white;
    }
    .dx-tab {
      padding: 3px !important;
    }
    .office-outer {
      width:100%;
      display:block;
      margin: 3px;
      height: 80px;
    }
    .office-inner {
      width:100%;
      display: -webkit-inline-box;
      scroll-behavior: smooth;
      overflow-x: scroll;
    }
    .office-grp {
      height: 60px;
      background:#fff;
      margin: 1px;
      padding: 0px;
      border: none;
      display: flex;
      width: max-content;
    }
    .office-panel {
      background: white;
      border: 1px solid rgba(0, 0, 0, 0.68);
      box-shadow: inset 1px 1px 1px 1px #fff;
      border-radius: 4px;
      margin-right: 2px;
    }
    .office-note{
      background: white; 
      width: inherit; 
      text-align: center;
      border: none;
      border-top: 1px solid #ddd;
    }
    .ribbon-content-wrapper .dx-tabs-wrapper {
      border-bottom: 1px solid #ddd;
    }
    .ribbon-content-wrapper .dx-tabpanel-tabs .dx-tabs-wrapper .dx-tab {
      -webkit-box-shadow:none !important;
      box-shadow: none !important;
      border: 1px solid #ddd;
      border-bottom: none;
    }
    .ribbon-content-wrapper .dx-tab-selected {
      top: 2px;
    }
    .ribbon-content-wrapper .la_full_width{
			max-width: 100% !important;
      min-width: 100% !important;
      height: inherit !important;
      padding: 5px;
			border:none;
    }
    .ribbon-content-wrapper .la_full_width50{
			max-width: 100% !important;
      min-width: 100% !important;
      height: 50% !important;
      padding: 5px;
			border:none;
    }
    #context-auto{
      overflow-y: auto;
    }
    #context-auto .modalLA {
      width: 100% !important;
      min-height: 500px !important;
      border: 1px solid #ddd !important;
      margin-bottom: 10px !important;
      background: white !important;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2) !important;
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 999999999999 !important;
      resize: both !important;
      overflow: hidden !important;
    }

    #context-auto .toolbar {
      padding: 10px;
      background: #007bff;
      color: white;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    #context-auto .modal-content {
      padding: 10px;
      height: 400px;
    }

    #context-auto .resize-handle {
      width: 20px;
      height: 20px;
      position: absolute;
      right: 0;
      bottom: 0;
      cursor: se-resize;
      background: #007bff;
    }

    #context-auto .fullscreen {
      position: fixed;
      width: 100vw;
      height: 100vh;
      top: 0;
      left: 0;
      z-index: 9999999;
    }
`
}