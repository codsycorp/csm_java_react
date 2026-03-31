{
    name:"csm_grid",
    props: ['Uinfos','permissions','menus_permissions','com_logo','m_configs','menusapp','getAllMenu','app_id','base','database','real'],
    data:function(){
      var seft=this;
      var filter_data=function(obj){return true;};
      if(seft.m_configs.table_name==="")
        seft.m_configs.g_readonly=true;
      return {
        searchForm:{},
        ColumnData:[],
        menus:this.getAllMenu(this.menusapp),
        filter_data:filter_data,
        load_db:[],
        ten_chuc_nang:this.m_configs.label.split('.')[this.m_configs.label.split('.').length-1],
        languageDTB: {
          "lengthMenu": "Display _MENU_ dòng trên trang",
          "zeroRecords": "Không có kết quả nào",
          "info": "Đang hiển thị trang _PAGE_ trên tổng _PAGES_ trang",
          "infoEmpty": "Không có thông tin nào",
          "infoFiltered": "(Tìm được _MAX_ dòng dữ liệu)",
          "sSearch":"Tìm kiếm "+this.m_configs.label.split('.')[this.m_configs.label.split('.').length-1]
        },
        m_id:"tbl_"+this.m_configs.id,
        L_table_name:this.m_configs.table_name.split(/\,/g),
        gm_id:this.m_configs.id+this.id,
        editorDTB:{},
        worker:false,
        limitRows:20,
        curent_grid:false,
        master_form:false,
        editors_controls:{},
        select_row:false,
        detail_grid:{},
        importDataEx:[],
        importDataCBOEx:[],
        importDataSuccess:[],
        optionsSelect:{},
        editorOpen:false,
        editorARemove:false,
        // tableConfig:{},
        defaultValRow:{},
        filesUploader:{},
        colsGrid:false,
        copyRow:false,
        tableFields:this.m_configs.table.filter(f=>1*f.f_show===1 && f.f_name.toLowerCase()!=='id').sort(function(a, b){return 1*a.f_stt-1*b.f_stt})
      }
    },
    created:function(){
      // alert(seft.m_configs.table_name);
      var seft=this;
      seft.setLoadDB();
      if(seft.m_configs.trigger["filter"])
      {
        var t_code=seft.csm_decrypt(seft.m_configs.trigger["filter"]);
        seft.filter_data=Function("obj",t_code);
      }
      if(!seft.m_configs["nodes"])
        seft.m_configs["nodes"]=[];
      seft.real.$on('updatedb',function(nDB){
        // console.log(nDB);
        if(seft.L_table_name[0]===nDB.obj_name && nDB.data.id)
        {
          if(seft.m_configs.trigger["filter"])
          {
            var dataF=[];
            var findOldRow=seft.load_db.find(r=>r.id===nDB.data.id);
            if(!findOldRow)
              findOldRow={};
            var newRow=Object.assign(findOldRow,nDB.data);
            dataF.push(newRow);
            if(!dataF.find(seft.filter_data))
            {
              seft.curent_grid.getDataSource().store().remove(nDB.data.id); 
              return;
            }
          }
          // if(nDB.cmd==='create')
          // {
          //   seft.curent_grid.getDataSource().store().push([{ type: "insert",index:0, data:nDB.data}]);
          // }
          // else if(nDB.cmd==='update')
          // {
          //   setTimeout(function(){seft.curent_grid.getDataSource().store().push([{ type: 'update', data: nDB.data, key:nDB.data.id }]);},50);
          // }
          // else if(nDB.cmd==='delete')
          // {
          //   var fIdxRow=seft.load_db.findIndex(r=>r.id===nDB.data.id);
          //   if(fIdxRow!==-1)
          //     seft.load_db.splice(fIdxRow, 1);
          //   seft.curent_grid.getDataSource().store().remove(nDB.data.id);
          // }
          seft.setLoadDB();
          seft.curent_grid.option("dataSource", JSON.parse(JSON.stringify(seft.load_db.filter(seft.filter_data))));
        }
      });
      seft.loadData(seft.m_configs.id,true);
      seft.m_configs["nodes"].forEach(function(mn) {
        seft.loadData(mn.id);
      });
    },
    methods:{
      renderDevExtremeControls() {
        this.m_configs.table
          .filter(f => 1 * f.f_report === 1 && 1 * f.f_show !== 0)
          .forEach(f => {
            const selector = '#control-'+this.m_id+'_'+ f.f_name
            const options = this.getDxOptions(f)
            this.searchForm[f.f_name] = null // default binding

            switch (f.f_types) {
              case 'price':
              case 'nummeric':
                $(selector).dxNumberBox({
                  ...options,
                  showSpinButtons: true,          // hiển thị nút tăng/giảm
                  mode: 'number',                 // đảm bảo kiểu input là số
                  min: 0,                         // tùy chọn: giới hạn nhỏ nhất
                  max: 1000000, 
                  inputAttr: {
                    inputmode: 'numeric',
                    type: 'number', // ép input type là number
                    pattern: '[0-9]*'
                  },
                  format: f.f_types.indexOf('price')!==-1?"#,##0"+(1*f.f_dec>0?".".padEnd(1*f.f_dec,"0"):""):"#",
                  elementAttr: {class: "num"},
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              case 'date':
                $(selector).dxDateBox({
                  ...options,
                  type: 'date',
                  elementAttr: {class: "date"},
                  displayFormat: 'dd/MM/yyyy',
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              case 'time':
                $(selector).dxDateBox({
                  ...options,
                  type: 'time',
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              case 'datetime':
                $(selector).dxDateBox({
                  ...options,
                  type: 'datetime',
                  // width: 1*Obj.f_width,
                  elementAttr: {class: "datetime"},
                  displayFormat: 'dd/MM/yyyy HH:mm:ss',
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              case 'txt':
                $(selector).dxTextArea({
                  ...options,
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              case 'co':
              case 'cp':
              case 'coro':
                $(selector).dxSelectBox({
                  ...options,
                  items: f.items || [],
                  searchEnabled: true,
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
              default:
                $(selector).dxTextBox({
                  ...options,
                  onValueChanged: e => (this.searchForm[f.f_name] = e.value)
                })
                break
            }
          })
      },
      getDxOptions(f) {
        return {
          value: this.searchForm[f.f_name] || null,
          placeholder: f.f_header,
          stylingMode: 'outlined',
          showClearButton: true
        }
      },
      xem_du_lieu(){
        var seft=this;
        seft.initTable();
        if(seft.curent_grid)
        {
          seft.setLoadDB();
          seft.curent_grid.option("dataSource", JSON.parse(JSON.stringify(seft.load_db.filter(seft.filter_data))));
        }
      },
      setLoadDB()
      {
        var seft=this;
        // console.log("Tải Lại dữ liệu cho bảng",seft.L_table_name[0],seft.database[seft.L_table_name[0]].rows);
        if(seft.m_configs.trigger["load_db"])
        {
          var t_code=seft.csm_decrypt(seft.m_configs.trigger["load_db"]);
          var fn_load_db=Function("seft","db",t_code);
          seft.load_db=fn_load_db(seft,seft.database);
        }
        else if(seft.database[seft.L_table_name[0]])
          seft.load_db=seft.database[seft.L_table_name[0]].rows;
        setTimeout(function() {
          window.dispatchEvent(new Event('resize'));
        },500);
      },
      getNameMenu(label){
        if(label)
        {
          var splName=label.split(/\./g);
          return splName[splName.length-1];
        }
        else
          return '';
      },
      loadData(tree_id,is_master)
      { 
        var seft=this;
        if(is_master)
        {
          seft.defaultValRow[tree_id]={};
          seft.filesUploader[tree_id]={};
          seft.colsGrid=seft.tableFields.filter(function(f){
            if(1*f.f_show===1 && 1*f.f_report!==1 && f.f_name.toLowerCase()!=='id' && f.f_name.toLowerCase()!=='parent_id')
            {
              if(f.f_types.indexOf('co')!==-1)
                seft.getOptionsSelect(f.f_cbo_query,tree_id,f.f_name);
              return true; 
            }
            else
              return false;
          }).map(function(Obj){
            var defCol=Obj;
            if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
              seft.defaultValRow[tree_id][Obj.f_name]=0;
            else
              seft.defaultValRow[tree_id][Obj.f_name]='';
            Obj=Object.assign(Obj,{
              dataField:Obj.f_name,showWhenGrouped:Obj.f_group_index?true:false,groupIndex:Obj.f_group_index?Obj.f_group_index:-1,
              caption:Obj.f_header,
              width:1*Obj.f_width,
              cssClass:Obj.f_types
            });
            if(Obj.f_sort!=='')
              Obj=Object.assign(Obj,{sortOrder:Obj.f_sort});
            if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
              Obj=Object.assign(Obj,{
                dataType: 'number',
                alignment: 'right',
                format:Obj.f_types.indexOf('price')!==-1?"#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""):"#",
                editCellTemplate: function (cellElement, cellInfo) {
                  const $ctrlE=$("<div />").dxNumberBox({
                    format: Obj.f_types.indexOf('price')!==-1?"#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""):"#",
                    elementAttr: {class: "num"},
                    onValueChanged: function (e) {
                      cellInfo.setValue(e.value);
                    },
                    readOnly:Obj.f_types.indexOf('ro')!==-1,
                    value: (cellInfo.value?cellInfo.value:'')
                  });
                  if(!seft.editors_controls[tree_id])
                    seft.editors_controls[tree_id]={};
                  seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxNumberBox("instance");
                  $ctrlE.appendTo(cellElement);
                },
              });
            else if(Obj.f_types.indexOf('datetime')!==-1)
            {
              Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) { 
                const $ctrlE=$("<div />").dxDateBox({
                  useMaskBehavior: true,
                  type: 'datetime',
                  // width: 1*Obj.f_width,
                  elementAttr: {class: "datetime"},
                  displayFormat: 'dd/MM/yyyy HH:mm:ss',
                  onValueChanged: function (e) {
                    if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"))
                    {
                      cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy HH:MM:ss");
                      cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"));
                    }
                  },
                  value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value.padEnd(19," "+dateFormat(new Date(),"HH:MM:ss")),"dd/mm/yyyy HH:MM:ss"):cellInfo.value)
                });
                if(!seft.editors_controls[tree_id])
                  seft.editors_controls[tree_id]={};
                seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxDateBox("instance")
                $ctrlE.appendTo(cellElement);
              },dataType: "datetime",editorType:"datetime",format:'dd/MM/yyyy HH:mm:ss',editorOptions:{type: "date",format:"dd/MM/yyyy HH:mm:ss"}});
            }
            else if(Obj.f_types.indexOf('date')!==-1)
            {
              Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) {
                // console.log(cellElement, cellInfo);
                const $ctrlE=$("<div />").dxDateBox({
                  useMaskBehavior: true,
                  type: 'date',
                  // width: 1*Obj.f_width,
                  elementAttr: {class: "date"},
                  displayFormat: 'dd/MM/yyyy',
                  onValueChanged: function (e) {
                    if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy") && e.value)
                    {
                      cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy");
                      cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy"));
                    }
                  },
                  value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value,"dd/mm/yyyy"):cellInfo.value)
                });
                if(!seft.editors_controls[tree_id])
                  seft.editors_controls[tree_id]={};
                seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxDateBox("instance")
                $ctrlE.appendTo(cellElement);
              },dataType: "date",editorType:"date",format:"dd/MM/yyyy",editorOptions:{type: "date",format:"dd/MM/yyyy"}});
            }
            else if(Obj.f_types.indexOf('time')!==-1)
            {
              Obj = Object.assign(Obj, {
                editCellTemplate: function (cellElement, cellInfo) {
                  // Tạo một thẻ input với type time
                  const $ctrlE = $("<input />").attr({
                    type: 'time',
                    class: 'time',
                    value: cellInfo.value
                  });

                  // Đặt sự kiện thay đổi giá trị
                  $ctrlE.on('input', function (e) {
                    const newValue = e.target.value;
                    if (cellInfo.data[cellInfo.column.dataField] !== newValue) {
                      cellInfo.data[cellInfo.column.dataField] = newValue;
                      cellInfo.setValue(newValue);
                    }
                  });

                  // Đảm bảo editor_controls tồn tại
                  if (!seft.editors_controls[tree_id]) {
                    seft.editors_controls[tree_id] = {};
                  }
                  seft.editors_controls[tree_id][Obj.f_name] = $ctrlE;

                  // Thêm input vào cellElement
                  $ctrlE.appendTo(cellElement);
                },
                dataType: "time",
                editorType: "time",
                format: "HH:mm:ss",
                editorOptions: {
                  type: "time",
                  format: "HH:mm:ss"
                }
              });
            }
            else if (Obj.f_types === 'btn')
            {
              Obj = Object.assign(Obj, {
                // Sử dụng f_header làm tiêu đề cột
                caption: Obj.f_header, 
                // Dữ liệu cột vẫn cần dataField, dù có thể không lưu giá trị trực tiếp
                dataField: Obj.f_name, 
                allowFiltering: false,
                allowSorting: false,

                // CELL TEMPLATE: Hiển thị Nút bấm DevExtreme
                cellTemplate: function(container, options) {
                  // 1. Dọn dẹp container để đảm bảo không có nội dung cũ (như &nbsp;)
                  container.empty(); 

                  // 2. Tạo element cho nút
                  let buttonElement = document.createElement("div");

                  // 3. Khởi tạo dxButton
                  $(buttonElement).dxButton({
                    // Sử dụng tiêu đề cột (caption) làm nội dung nút, nếu không có thì dùng 'Thực hiện'
                    text: options.column.caption || 'Thực hiện', 
                    type: 'default', // Loại nút
                    stylingMode: 'contained', // Nút có nền để dễ nhìn thấy

                    onClick: function(e) {
                      // seft.callRowPrint(options.data);
                      thongbao("Vui lòng chờ phiếu in");
                      // var load_report_db=Function("seft", "data","bang",t_code);
                      // var dataRP=load_report_db(seft,options.data,seft.database);
                      // dataRP["com_logo"]=seft.com_logo;
                      const formattedObject = {};
                      // Khởi tạo đối tượng định dạng tiền tệ Việt Nam
                      // maximumFractionDigits: 2 (Làm tròn tối đa 2 chữ số sau dấu phẩy)
                      const formatter = new Intl.NumberFormat('vi-VN', {
                          style: 'decimal', 
                          minimumFractionDigits: 0, // Không hiển thị số 0 nếu là số nguyên
                          maximumFractionDigits: 0  // Tối đa 2 chữ số thập phân
                      });
                      var objDT=options.data;
                      var nObj=JSON.parse(JSON.stringify(objDT));
                      for (const key in nObj) {
                          if (nObj.hasOwnProperty(key)) {
                            let value = nObj[key];
                            var cfCol=seft.m_configs.table.find(f=>f.f_name.toLowerCase()===key.toLowerCase());
                            if(cfCol&&!seft.searchForm[cfCol.f_name])
                            {
                              if(cfCol.f_types.indexOf('num')!==-1||cfCol.f_types.indexOf('price')!==-1||cfCol.f_types.indexOf('ron')!==-1)
                              {
                                const numberValue = parseFloat(value);
                                formattedObject[key] = formatter.format(numberValue);
                              } 
                              else
                                formattedObject[key] = value;
                            }
                            else
                              formattedObject[key] = value;
                          }
                      }
                      nObj=formattedObject;
                      seft.csm_print(seft.m_configs["report_name"],nObj,seft.m_configs.p_width,seft.m_configs.p_height,seft.m_configs.orientation,true)
                      //console.log(`Nút "${e.component.option('text')}" được bấm.`);
                      //console.log('Dữ liệu hàng:', options.data);

                      // *** THỰC HIỆN TÍNH NĂNG CỦA BẠN TẠI ĐÂY ***
                      //alert(`Đã click nút hành động cho ID: ${options.data.id}`);
                    }
                  });
                  // LƯU Ý: Không cần gọi .dxButton("instance") nếu bạn chỉ cần gắn nó vào container.

                  // 4. Thêm nút vào container
                  // DevExtreme khuyến nghị sử dụng append
                  container.append(buttonElement); 

                  // Quan trọng: Đặt class 'd-flex justify-content-center' để căn giữa nếu cần
                  // container.addClass('d-flex justify-content-center'); 
                },

                // EDIT CELL TEMPLATE: Giữ nguyên
                editCellTemplate: function(cellElement, cellInfo) {
                   cellElement.textContent = 'Hành động.'; 
                }
              });
            }
            else if(Obj.f_types==='img'||Obj.f_types==='file')
            {
              Obj=Object.assign(Obj,{
                allowFiltering: false,
                allowSorting: false,
                cellTemplate: function(container, options) {
                  let imgElement = document.createElement("img");
                  if(Obj.f_types==='file')
                  {
                    imgElement= document.createElement('a');
                    if(options.value)
                    {
                      var fileName = options.value.split('/').pop();
                      imgElement.target="_blank";
                      imgElement.download = fileName;
                      imgElement.textContent = 'Download '+fileName;
                      imgElement.name = fileName;
                    }
                    imgElement.href = options.value;
                  }
                  else
                  {
                    imgElement.setAttribute('height','18px');
                    imgElement.setAttribute('src',options.value);
                  }
                  container.append(imgElement);
                },
                editCellTemplate: function(cellElement, cellInfo) {
                  let buttonElement = document.createElement("div");
                  buttonElement.classList.add("retryButton");
                  let retryButton = $(buttonElement).dxButton({
                    text: "Retry",
                    visible: false,
                    onClick: function() {
                      // The retry UI/API is not implemented. Use a private API as shown at T611719.
                      for (var i = 0; i < fileUploader._files.length; i++) {
                        delete fileUploader._files[i].uploadStarted;
                      }
                      fileUploader.upload();
                    }
                  }).dxButton("instance");
                  let fileUploaderElement = document.createElement("div");
                  let fileUploader = $(fileUploaderElement).dxFileUploader({
                    multiple: false,
                    name: 'file',
                    accept: Obj.f_types==='img'?'image/*':'*.*',
                    invalidMaxFileSizeMessage: "Kích thước tệp quá lớn",  
                    uploadFailedMessage: "Tải lên không thành công",  
                    minFileSize: 1024, // 1 KB
                    maxFileSize: 512 * 1024, // 1 MB
                    onUploaded: function (e) {},
                    onValueChanged: function(e) {
                      let reader = new FileReader();
                      reader.onload = function(args) {
                        var objI={};
                        objI["name"]=e.value[0].name;
                        objI["app_id"]=seft.database[seft.L_table_name[0]].app_id;
                        objI["src"]=args.target.result;
                        objI["size"]=e.value[0].size;
                        objI["id"]=cellInfo.data["id"];
                        objI["f_name"]=Obj.f_name;
                        seft.filesUploader[tree_id][Obj.f_name]=objI;
                        var urlIMG='/app_images/'+objI.app_id+'/'+seft.doi_ten_hinh(objI["name"]);
                        cellInfo.setValue(urlIMG);
                        let imageElement = document.createElement("img");
                        if(Obj.f_types==='file')
                        {
                          imageElement= document.createElement('a');
                          if(urlIMG)
                          {
                            var fileName = cellInfo.value.split('/').pop();
                            imageElement.target="_blank";
                            imageElement.download = fileName;
                            imageElement.textContent = 'Download '+fileName;
                            imageElement.name = fileName;
                          }
                          imageElement.href = urlIMG;
                        }
                        else
                        {
                          imageElement.classList.add("uploadedImage");
                          imageElement.setAttribute('height','100px');
                          imageElement.setAttribute('src',urlIMG);
                        }
                        cellElement.append(imageElement);
                      }
                      if(e.value[0])
                        reader.readAsDataURL(e.value[0]); 
                    }
                  }).dxFileUploader("instance");
                  cellElement.append(fileUploaderElement);
                  cellElement.append(buttonElement);
                }
              });
            }
            else if(Obj.f_types==='edt')
            {
              Obj=Object.assign(Obj,{
                formItem: {
                  colSpan: 2,
                  editorOptions: {
                    height: 800,
                  },
                },
                visible:false,
                editCellTemplate: function (itemElement, cellInfo) {  
                  ($("<textarea>", { "id": "ckpeditor_"+seft.m_configs.id+'_'+Obj.f_name,height:800, "val": decodeURIComponent(cellInfo.value||'') })).appendTo(itemElement);  
                  $("<script>").append(CKEDITOR.replace("ckpeditor_"+seft.m_configs.id+'_'+Obj.f_name)).appendTo(itemElement);  
                  $("<script>").append(CKEDITOR.instances["ckpeditor_"+seft.m_configs.id+'_'+Obj.f_name].on("change", function () {
                    cellInfo.setValue(encodeURIComponent(CKEDITOR.instances["ckpeditor_"+seft.m_configs.id+'_'+Obj.f_name].getData().replace(location.origin,'')));
                  })).appendTo(itemElement); 
                },
              });
            }
            else if(Obj.f_types==='codejs')
            {
              Obj=Object.assign(Obj,{
                formItem: {
                  colSpan: 2,
                  editorOptions: {
                    height: 800,
                  },
                },
                visible:false,
                editCellTemplate:function(cellElement, cellInfo) {
                  var val=cellInfo.value;
                  ($("<textarea>", { "id": "ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_code", "val": "" })).appendTo(cellElement);  
                  var isMacLike = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)?true:false;
                  var m_extraKeys={
                    "F11": function(cm) {
                      cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                    },
                    "Esc": function(cm) {
                      if (cm.getOption("fullScreen")) cm.setOption("fullScreen", false);
                    }
                  };
                  m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-Space"]="autocomplete";
                  m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-S"]=function(cm) {
                    // that.fnSave();
                  };
                  m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-H"]=function(cm) {
                    // that.editorTG.execCommand('replace');
                  };
                  if(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_code"))
                  {
                    var f_editorTG = CodeMirror.fromTextArea(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_code"), {
                      lineNumbers: true,
                      mode: 'javascript',
                      keyMap: "sublime",
                      extraKeys:m_extraKeys,
                      autoCloseBrackets: true,
                      matchBrackets: true,
                      showCursorWhenSelecting: true,
                      theme: "monokai",
                      tabSize: 2
                    });
                    if(val)
                      f_editorTG.setValue(seft.csm_decrypt(val));
                    f_editorTG.on("change", function(cm, change) {
                      cellInfo.setValue(seft.csm_encrypt(cm.getValue()));
                    });
                  }
                }
              });
            }
            else if(Obj.f_types.indexOf('co')!==-1)
            {
              if(Obj["f_grid"] && Obj["f_grid_fields"])
              {
                var colGrid=false;
                var mnuColGrid=seft.menus.find(m=>m.id===Obj["f_grid"]);
                if(mnuColGrid)
                  colGrid=mnuColGrid.table.filter(f=>Obj["f_grid_fields"].find(fc=>fc===f.f_name));
                if(colGrid)
                {
                  var filter_data=function(obj){return true;};
                  if(mnuColGrid.trigger["filter"])
                  {
                    var t_code=seft.csm_decrypt(mnuColGrid.trigger["filter"]);
                    filter_data=Function("obj",t_code);
                  }
                  var g_load_db=[];
                  if(mnuColGrid.trigger["load_db"])
                  {
                    var t_code=seft.csm_decrypt(mnuColGrid.trigger["load_db"]);
                    var fn_load_db=Function("seft","db",t_code);
                    g_load_db=fn_load_db(seft,seft.database);
                  }
                  else
                    g_load_db=seft.database[mnuColGrid.table_name].rows;
                  colGrid=colGrid.filter(function(f){
                    if(f.f_types.indexOf('co')!==-1)
                      seft.getOptionsSelect(f.f_cbo_query,mnuColGrid.id,f.f_name);
                    return true; 
                  }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(f){
                    var ObjC={dataField:f.f_name,caption:f.f_header,width:1*f.f_width,cssClass:f.f_types};
                    if(f.f_types.indexOf('co')!==-1)
                      ObjC=Object.assign(ObjC,{
                        editorOptions: {
                          searchEnabled: true,
                          showClearButton: true
                        },
                        lookup: {
                            searchEnabled: true,
                            showClearButton: true,
                            dataSource: function (options) {  
                                return {  
                                    store: {
                                      type: 'array',  
                                      data:seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["options"],  
                                      key: "ma", 
                                    },  
                                    filter:function (item) { 
                                      if(options.data && seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name].hasOwnProperty('where'))
                                        if(seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"]!=="")
                                        {
                                          var str=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"];
                                          if(options.data.length>0)
                                          {
                                            var fields=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["fields"];
                                            var dataRow=options.data;
                                            var dataOps=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["data"];
                                            // alert(str+"=>"+JSON.stringify(dataOps))
                                            var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                            var fData=dataOps.filter(function(o){
                                              return fnFilter(dataRow,o);
                                            }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                            // alert(fields[0]+":"+fields[1]+"="+dataOps.length+"=>"+fData.length);
                                            var fData=fData.find(o=>o.ma===item.ma);
                                            if(fData)
                                              return true;
                                            else
                                              return false; 
                                          }
                                          else
                                          {
                                            var fnFilter=Function("bang",'data',str);
                                            fnFilter(seft.database,item);
                                          }
                                        }
                                      return true;
                                    } 
                                }  
                            },
                            displayExpr: 'ten',
                            valueExpr: 'ma',
                        }
                      });
                    return ObjC;
                  });
                  Obj=Object.assign(Obj,{
                    editorOptions: {
                      disabled: Obj.f_types.indexOf('ro')!==-1,
                      searchEnabled: true,
                      showClearButton: true
                    },
                    lookup: {
                      dataSource:g_load_db.filter(filter_data),
                      valueExpr: 'id',
                      displayExpr(item) {
                        if(item)
                        {
                          var ten=item[Obj["f_grid_fields"][1]];
                          var ma=item[Obj["f_grid_fields"][0]];
                          return item && `${ma} <${ten}>`;
                        }
                        return '';
                      },
                    },
                    editCellTemplate:function(cellElement, cellInfo) {
                      const $ctrlE=$('<div>').dxDropDownBox({
                        searchEnabled: true,
                        dropDownOptions: { width: 500 },
                        dataSource:g_load_db.filter(filter_data),
                        value: cellInfo.value,
                        valueExpr: 'id',
                        displayExpr(item) {
                          if(item)
                          {
                            var ten=item[Obj["f_grid_fields"][1]];
                            var ma=item[Obj["f_grid_fields"][0]];
                            return item && `${ma} <${ten}>`;
                          }
                          return '';
                        },
                        inputAttr: { 'aria-label': 'Owner' },
                        contentTemplate(eDD) {
                          const value = eDD.component.option('value');
                          const $dataGrid = $('<div>').dxDataGrid({
                            dataSource: g_load_db.filter(filter_data),
                            columns: colGrid?colGrid:Obj["f_grid_fields"],
                            hoverStateEnabled: true,
                            paging: { enabled: true, pageSize: 5 },
                            pager: {
                              visible: true,
                              // allowedPageSizes: [5, 10, 'all'],
                              showPageSizeSelector: true,
                              showInfo: true,
                              showNavigationButtons: true,
                            },
                            keyExpr: 'id',
                            searchPanel: {
                              visible: true,
                              width: 240,
                              placeholder: 'Tìm kiếm ...',
                            },
                            scrolling: { mode: 'virtual' },
                            selection: { mode: 'single' },
                            selectedRowKeys: value?[value]:[],
                            height: '100%',
                            onSelectionChanged(selectedItems) {
                              const keys = selectedItems.selectedRowKeys;
                              const hasSelection = keys.length;
                              try{
                                var rIDX=cellInfo.row.rowIndex;
                                if(rIDX!==-1)
                                {
                                  var dataR=selectedItems.selectedRowsData;
                                  cellInfo.setValue(keys[0]); 
                                  eDD.component.option('value', hasSelection>0 ? keys[0] : null);
                                  dataR.forEach(function(row){
                                    Object.keys(row).forEach(function(c){
                                      if(cellInfo.component.columnOption(c) && c!=="id" && c!=="_id")
                                        cellInfo.component.cellValue(rIDX,c,row[c]);
                                      else if(seft.tableFields.find(f=>f.f_name.toLowerCase()===c.toLowerCase()) && c!=="id" && c!=="_id")
                                        cellInfo.row.data[c]=row[c];
                                    });
                                  });
                                }
                              }catch(erE){}
                              // cellInfo.component.refresh();
                            },
                          });
                          var dataGrid = $dataGrid.dxDataGrid('instance');
                          eDD.component.on('valueChanged', (args) => {
                            
                            dataGrid.selectRows(args.value, false);
                            eDD.component.close();
                          });
                          return $dataGrid;
                        },
                      });
                      if(!seft.editors_controls[tree_id])
                        seft.editors_controls[tree_id]={};
                      seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxDropDownBox("instance")
                      $ctrlE.appendTo(cellElement);
                    }
                  });
                }
              }
              else
                Obj=Object.assign(Obj,{
                  editorOptions: {
                    disabled: Obj.f_types.indexOf('ro')!==-1,
                    searchEnabled: true,
                    showClearButton: true
                  },
                  editCellTemplate: function (cellElement, cellInfo) {
                    var dataSL=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["options"];
                    if(seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["where"])
                    {
                      var str=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["where"];
                      var fields=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["fields"];
                      var dataRow=cellInfo.data;
                      var dataOps=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["data"];
                      // alert(str+"=>"+JSON.stringify(dataOps))
                      var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                      dataSL=dataOps.filter(function(o){
                        return fnFilter(dataRow,o);
                      }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                    }
                    const $ctrlE=$('<div>').dxSelectBox({
                      disabled: Obj.f_types.indexOf('ro')!==-1,
                      dataSource:dataSL,
                      displayExpr: 'ten',
                      valueExpr: 'ma', 
                      searchEnabled: true,
                      showClearButton: true,
                      value: cellInfo.value, 
                      placeholder: "Vui lòng chọn...",
                      onValueChanged: function(e) {
                       cellInfo.setValue(e.value);  
                      }  
                   });
                    if(!seft.editors_controls[tree_id])
                      seft.editors_controls[tree_id]={};
                    seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxSelectBox("instance");
                    $ctrlE.appendTo(cellElement);
                  },
                  lookup: {
                    dataSource: function (options) {
                      return { 
                        store: {
                          type: 'array',  
                          data:seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["options"],  
                          key: "ma", 
                        }, 
                        filter:function (item) {
                          if(options.data &&seft.optionsSelect[tree_id+"_^_"+Obj.f_name].hasOwnProperty('where'))
                            if(seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["where"]!=="")
                            {
                              var str=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["where"];
                              if(options.data.length>0)
                              {
                                var fields=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["fields"];
                                var dataRow=options.data;
                                var dataOps=seft.optionsSelect[tree_id+"_^_"+Obj.f_name]["data"];
                                // alert(str+"=>"+JSON.stringify(dataOps))
                                var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                var fData=dataOps.filter(function(o){
                                  return fnFilter(dataRow,o);
                                }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                var fData=fData.find(o=>o.ma===item.ma);
                                if(fData)
                                  return true;
                                else
                                  return false; 
                              }
                              else
                              {
                                var fnFilter=Function("bang",'data',str);
                                fnFilter(seft.database,item);
                              }
                            }
                            return true;
                        }
                      }
                    },
                    displayExpr: 'ten',
                    valueExpr: 'ma',
                  }
                });
            }
            else
              Obj=Object.assign(Obj,{
                editCellTemplate: function (cellElement, cellInfo) {
                  const $ctrlE=$("<div />").dxTextBox({
                    onValueChanged: function (e) {
                        cellInfo.setValue(e.value);
                    },
                    readOnly:Obj.f_types.indexOf('ro')!==-1,
                    value: (cellInfo.value?cellInfo.value:'')
                  });
                  if(!seft.editors_controls[tree_id])
                    seft.editors_controls[tree_id]={};
                  seft.editors_controls[tree_id][Obj.f_name]=$ctrlE.dxTextBox("instance");
                  $ctrlE.appendTo(cellElement);
                },
                // setCellValue: function (rowData, value) {
                //   this.defaultSetCellValue(rowData, value);
                // }
              });
            return Obj;
          });
          setTimeout(function(){
            seft.initTable();
          },50);
        }
      },
      sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      },
      UpdateHeight() {  
        var seft=this;
        if(seft.curent_grid)
        {
          if(document.querySelector("#pcontent-tbl_"+seft.m_configs.id+">.form-horizontal") && document.querySelector("#tbl_"+seft.m_configs.id+".csm_full_width"))
            document.querySelector("#tbl_"+seft.m_configs.id+".csm_full_width").setAttribute("style","height: "+(document.querySelector("#pcontent-tbl_"+seft.m_configs.id).clientHeight-document.querySelector("#pcontent-tbl_"+seft.m_configs.id+">.form-horizontal").clientHeight)+"px !important;");
        }  
      },
      getOptionsSelect(f_cbo_query,tree_id,f_name){
        var seft=this;
        seft.optionsSelect[tree_id+"_^_"+f_name]={options:[]};
        if(f_cbo_query===''||!f_cbo_query)
          return seft.optionsSelect[tree_id+"_^_"+f_name];
        // await seft.sleep(300);
        var load_combo_db=Function("seft", "data",(f_cbo_query.indexOf('return ')===-1?'return ':'')+f_cbo_query);
        var objQa=load_combo_db(seft,seft.database);
        if(!objQa)
          objQa={options:[]};
        // {
        //   seft.optionsSelect[tree_id+"_^_"+f_name]=[];
        //   return seft.optionsSelect[tree_id+"_^_"+f_name];
        // }  
        
        if(objQa.hasOwnProperty('f_grid') && objQa.hasOwnProperty('f_grid_fields'))
        {
          seft.optionsSelect[tree_id+"_^_"+f_name]=objQa;
          return seft.optionsSelect[tree_id+"_^_"+f_name];
        }
        else if(!objQa.hasOwnProperty('options')||!objQa.hasOwnProperty('query'))
          return seft.optionsSelect[tree_id+"_^_"+f_name];
        if(objQa.query.length===1)
        {
          seft.optionsSelect[tree_id+"_^_"+f_name]["fields"]=["ma","ten"];
          seft.optionsSelect[tree_id+"_^_"+f_name]["data"]=[];
          seft.optionsSelect[tree_id+"_^_"+f_name]["options"]=[];
          var obj_name=objQa.query[0].obj_name,fields=objQa.query[0].fields,obj_where=objQa.query[0].obj_where;
          if(obj_name==='' && fields.length===0 && obj_where)
          { 
            if(obj_where!=='')
              seft.optionsSelect[tree_id+"_^_"+f_name]["where"]=obj_where;
          }
          else if(obj_name!=='' && fields.length===2)
          {
            var objTBL=seft.database[obj_name];
            if(objTBL)
            {
              seft.optionsSelect[tree_id+"_^_"+f_name]["table_name"]=obj_name;
              seft.optionsSelect[tree_id+"_^_"+f_name]["fields"]=fields;
              seft.optionsSelect[tree_id+"_^_"+f_name]["data"]=objTBL.rows;
              seft.optionsSelect[tree_id+"_^_"+f_name]["options"]=objTBL.rows.map(function(o){return {ma:o[fields[0]]?o[fields[0]]:'',ten:o[fields[1]]?o[fields[1]]:''};});
              // console.log(seft.optionsSelect[tb_name+"_^_"+f_name]["options"]);
              seft.optionsSelect[tree_id+"_^_"+f_name]["options"]=seft.optionsSelect[tree_id+"_^_"+f_name]["options"].sort(function(a, b){return a.ten.toString().localeCompare(b.ten.toString())});
              if(obj_where!=='')
                seft.optionsSelect[tree_id+"_^_"+f_name]["where"]=obj_where;
            }
          }
        }
        else if(objQa.options.length>0)
        {
          seft.optionsSelect[tree_id+"_^_"+f_name]["fields"]=["ma","ten"];
          seft.optionsSelect[tree_id+"_^_"+f_name]["data"]=objQa.options;
          seft.optionsSelect[tree_id+"_^_"+f_name]["options"]=objQa.options; 
          seft.optionsSelect[tree_id+"_^_"+f_name]["options"]=seft.optionsSelect[tree_id+"_^_"+f_name]["options"].sort(function(a, b){return a.ten.toString().localeCompare(b.ten.toString())});
        }
        return seft.optionsSelect[tree_id+"_^_"+f_name];
      },
      insertData(){
        var seft=this;
        if(seft.importDataEx.length>0)
        {
          var chkLen=seft.importDataSuccess.length;
          setTimeout(function(){
            if(chkLen===seft.importDataSuccess.length)
              seft.worker.postMessage("start");
          },2000);
          var obj=JSON.parse(JSON.stringify(seft.importDataEx[0]));
          var obj_name=seft.L_table_name[0];
          seft.importDataEx.shift();
          var objKeys="";
          var e_where_lunence={
            operator: 'AND',
            conditions: []
          };
          seft.database[obj_name].fieldsPK.forEach(function(objPK){
            // console.log(obj_name,objPK,seft.m_configs.table);
            e_where_lunence.conditions.push({ field: objPK.trim(), type: 'eq', value: obj[objPK]});
            var field=seft.m_configs.table.find(f=>f.f_name.toLowerCase().trim()===objPK.toLowerCase().trim());
            if(field)
            {
              if(field.f_types.indexOf('num')!==-1||field.f_types.indexOf('price')!==-1||field.f_types.indexOf('ron')!==-1)
                objKeys+=(objKeys?" && ":"")+"1*obj."+objPK+"==="+obj[objPK];
              else
                objKeys+=(objKeys?" && ":"")+"obj."+objPK+"===`"+obj[objPK]+"`";
            }
            // console.log(objKeys);
          });
          var objUPD={app_id:seft.app_id,obj_name:obj_name,command:"create",obj_update:obj,e_where:e_where_lunence};
          if(objKeys)
          {
            var fn_check_exist_data=Function("obj","return "+objKeys);
            var checkKeys=seft.database[obj_name].rows.find(fn_check_exist_data);
            if(checkKeys)
            {
              objUPD["command"]="update";
              objUPD["obj"]=checkKeys;
              objUPD["obj_update"]["id"]=checkKeys.id;
            }
          }
          seft.csm_obj_updates(objUPD,function(msg){
            // console.log(msg);
            seft.importDataSuccess.push({"ok":msg.success});
            thongbao("Đã cập nhật xong "+seft.importDataSuccess.length+" dòng dữ liệu");
            if(seft.importDataEx.length===0)
            {
              setTimeout(function(){
                seft.curent_grid.option("dataSource", JSON.parse(JSON.stringify(seft.load_db.filter(seft.filter_data))));
              },300);
              seft.importDataSuccess=[];
              seft.importDataCBOEx=[];
            }
            else
              seft.worker.postMessage("start");
          });
        }
      },
      toLowerKeys(obj) {
        return Object.keys(obj).reduce((accumulator, key) => {
          accumulator[key.toLowerCase()] = obj[key];
          return accumulator;
        }, {});
      },
      importExcel(){
        var seft=this;
        window.URL = window.URL || window.webkitURL;
        var response = "self.onmessage=function(e){postMessage(e.data);}";
        var blob;
        try {
            blob = new Blob([response], {type: 'application/javascript'});
        } catch (e) { // Backwards-compatibility
            window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
            blob = new BlobBuilder();
            blob.append(response);
            blob = blob.getBlob();
        }
        seft.worker = new Worker(URL.createObjectURL(blob));
        seft.worker.addEventListener("message", function(ev) {
            seft.insertData();
        }, false);
        var inputElement = document.createElement("input");
        inputElement.type="file";;
        inputElement.accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        inputElement.addEventListener("change", handleFiles, false);
        function handleFiles() {
          // var fileList = this.files;
          var files = this.files;
          var i,f;
          for (i = 0, f = files[i]; i != files.length; ++i) {
            var reader = new FileReader();
            var name = f.name;
            if(f.type!="application/vnd.ms-excel")
            {
              alert("Phải đổ dữ liệu bằng file định dạng Excel 97-2003 !");
              return true;
            }
            reader.onload = function(e) {
              var data = e.target.result;
              var cfb = XLS.CFB.read(data, {
                type: 'binary'});
              var wb = XLS.parse_xlscfb(cfb);
              var sdx=0;
              var mnu=[],cmnu={};
              var cSheet=0;
              wb.SheetNames.forEach(function(sheetname) {
                  // Obtain The Current Row As CSV
                // var sCSV = XLS.utils.make_csv(wb.Sheets[sheetname]); 
                // var dataSheet=XLS.utils.sheet_to_json(wb.Sheets[sheetname]);
                // var oJS = XLS.utils.sheet_to_row_object_array(wb.Sheets[sheetname], {defval: ""}); 
                var dataSheet=JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[sheetname], {header: 1, defval: ''})));
                // Lấy Dữ Liệu Cho Bảng Chính 
                if(cSheet===0)
                {
                  for(var d=1;d<dataSheet.length;d++)
                  {
                    var dong=Object.fromEntries(Object.entries(dataSheet[d]).map(([k, v]) => ['id'+k, v?v:'']));
                    if(!dong['id'])
                      dong=Object.assign({id:seft.guid(seft.app_id)},dong);
                    var objKey=Object.keys(dong);
                    var dongM={};
                    var CT=seft.m_configs.table.sort(function(a, b){return 1*a.f_stt-1*b.f_stt});
                    for(var c=0;c<CT.length;c++)
                    {
                      if(objKey[c])
                      {
                        try{
                          dongM[CT[c].f_name.toLowerCase()]=decodeURIComponent(dong[objKey[c]]).replace(new RegExp('"','g'),'').replace(/[\r\n]+/g," ");
                        }catch(erI)
                        {
                          dongM[CT[c].f_name.toLowerCase()]=dong[objKey[c]].replace(/[\r\n]+/g," ");
                        }
                      }
                      else
                        dongM[CT[c].f_name.toLowerCase()]="";
                      //Định dạng lại cho kiểu số
                      if(CT[c].f_types.indexOf('num')!==-1||CT[c].f_types.indexOf('price')!==-1||CT[c].f_types.indexOf('ron')!==-1)
                        dongM[CT[c].f_name.toLowerCase()]=1*dongM[CT[c].f_name.toLowerCase()];
                      //Định dạng lại cho kiểu combobox chọn lấy đúng id
                      else if(CT[c].f_types.indexOf('co')!==-1)
                      {
                        var cbo_obj_name=seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name.toLowerCase()]["table_name"];
                        var cbo_fields=seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name.toLowerCase()]["fields"];
                        if(cbo_obj_name && cbo_fields.length===2)
                        { 
                          var cbo_app_id=seft.database[cbo_obj_name].app_id;
                          var fCBO=seft.database[cbo_obj_name].rows.find(cR=>cR[cbo_fields[1]]===dongM[CT[c].f_name.toLowerCase()]);
                          if(fCBO)
                            dongM[CT[c].f_name.toLowerCase()]=fCBO.id;
                          else
                          {
                            //Nếu không có thì đưa vào bảng của CBO tạo mới
                            fCBO=seft.importDataCBOEx.find(cR=>cR.obj_update[cbo_fields[1]]===dongM[CT[c].f_name.toLowerCase()]);
                            if(fCBO)
                              dongM[CT[c].f_name.toLowerCase()]=fCBO.obj_update.id;
                            else
                            {
                              var objCBO={};
                              objCBO[cbo_fields[1]]=dongM[CT[c].f_name.toLowerCase()];
                              objCBO["id"]=seft.guid(seft.app_id);
                              var objUpCBO={app_id:cbo_app_id,obj_name:cbo_obj_name,command:"create",obj_update:objCBO,e_where:null};
                              seft.importDataCBOEx.push(objUpCBO);
                              dongM[CT[c].f_name.toLowerCase()]=objCBO["id"];
                            }
                          }
                        }
                        else (seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name]["options"].length>0)
                        {
                          var fCBO=seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name]["options"].find(cR=>cR["ten"]===dongM[CT[c].f_name.toLowerCase()]);
                          if(fCBO)
                            dongM[CT[c].f_name.toLowerCase()]=fCBO.ma;
                        }
                      }
                    }
                    // console.log(dongM);
                    if(seft.m_configs.trigger["update"])
                      if(seft.m_configs.trigger["update"]!=='')
                      {
                        var dataRowM =JSON.parse(JSON.stringify(dongM));
                        var t_code=seft.csm_decrypt(seft.m_configs.trigger["update"]);
                        var updateRowMaster=Function("seft", "data","bang",t_code);
                        dataRowM=updateRowMaster(seft,dataRowM,seft.database);
                        Object.keys(dataRowM).forEach(function(c){
                          dongM[c]=dataRowM[c];
                        });
                      }
                    seft.importDataEx.push(dongM);
                  }
                }
                else if(seft.m_configs.nodes)
                {
                  if((cSheet-1)<seft.m_configs.nodes.length)
                  {
                    var mnuC=seft.m_configs.nodes[cSheet-1];
                    // Lấy Dữ Liệu Cho Bảng Con Trong Dòng Dữ Liệu 
                    // var oJSC = XLS.utils.sheet_to_row_object_array(wb.Sheets[sheetname], {defval: ""}); 
                    var dongM={};
                    var CT=mnuC.table.sort(function(a, b){return 1*a.f_stt-1*b.f_stt});
                    for(var d=1;d<dataSheet.length;d++)
                    {
                      var dong=Object.fromEntries(Object.entries(dataSheet[d]).map(([k, v]) => ['id'+k, v?v:'']));
                      if(!dong['id'])
                        dong=Object.assign({id:seft.guid(seft.app_id)},dong);
                      var objKey=Object.keys(dong);
                      for(var c=0;c<CT.length;c++)
                      {
                        if(objKey[c])
                          dongM[CT[c].f_name.toLowerCase()]=dong[objKey[c]];
                        else
                          dongM[CT[c].f_name.toLowerCase()]="";
                        //Định dạng lại cho kiểu số
                        if(CT[c].f_types.indexOf('num')!==-1||CT[c].f_types.indexOf('price')!==-1||CT[c].f_types.indexOf('ron')!==-1)
                          dongM[CT[c].f_name.toLowerCase()]=1*dongM[CT[c].f_name.toLowerCase()];
                        //Định dạng lại cho kiểu combobox chọn lấy đúng id
                        else if(CT[c].f_types.indexOf('co')!==-1)
                        {
                          var cbo_obj_name=seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name.toLowerCase()]["table_name"];
                          var cbo_fields=seft.optionsSelect[seft.m_configs.id+"_^_"+CT[c].f_name.toLowerCase()]["fields"];
                          if(cbo_obj_name && cbo_fields.length===2)
                          { 
                            var cbo_app_id=seft.database[cbo_obj_name].app_id;
                            var fCBO=seft.database[cbo_obj_name].rows.find(cR=>cR[cbo_fields[1]]===dongM[CT[c].f_name.toLowerCase()]);
                            if(fCBO)
                              dongM[CT[c].f_name.toLowerCase()]=fCBO.id;
                            else
                            {
                              //Nếu không có thì đưa vào bảng của CBO tạo mới
                              fCBO=seft.importDataCBOEx.find(cR=>cR.obj_update[cbo_fields[1]]===dongM[CT[c].f_name.toLowerCase()]);
                              if(fCBO)
                                dongM[CT[c].f_name.toLowerCase()]=fCBO.obj_update.id;
                              else
                              {
                                var objCBO={};
                                objCBO[cbo_fields[1]]=dongM[CT[c].f_name.toLowerCase()];
                                objCBO["id"]=seft.guid(seft.app_id);
                                var objUpCBO={app_id:cbo_app_id,obj_name:cbo_obj_name,command:"create",obj_update:objCBO,e_where:null};
                                seft.importDataCBOEx.push(objUpCBO);
                                dongM[CT[c].f_name.toLowerCase()]=objCBO["id"];
                              }
                            }
                          }
                        }
                      }
                      dataTC.push(dongM);
                    }
                    //Các trường hợp đổ số liệu mà khóa chính chỉ khai báo dòng đầu còn các dòng sau để trống
                    var oldKeys={};
                    for(var d=0;d<seft.importDataEx.length;d++)
                    {
                      //Xác định khóa ngoại cho các dòng dữ liệu như sau lấy giá trị các cột đầu tiên của các dòng dữ liệu đối chiếu với Giá Trị Khóa chính của dòng thuộc dữ liệu Bảng Chính
                      var e_where='';
                      var dong=JSON.parse(JSON.stringify(seft.importDataEx[d]));
                      var CT_Khoas=seft.m_configs.table.filter(k=>1*k.f_pkid===1);
                      var kt_gia_tri_khoa=true;
                      //Đối chiếu dữ liệu với khóa của dòng
                      CT_Khoas.forEach(function(pk){
                        if(!dong[pk.f_name.toLowerCase()])
                          kt_gia_tri_khoa=false;
                        if(!kt_gia_tri_khoa)
                          return;
                        if(pk.f_types.indexOf('num')!==-1||pk.f_types.indexOf('price')!==-1||pk.f_types.indexOf('ron')!==-1)
                        {
                          e_where=(e_where?" && ":"")+"1*obj."+pk.f_name.toLowerCase()+"==="+dong[pk.f_name.toLowerCase()];
                          if(dong[pk.f_name.toLowerCase()])
                            oldKeys[pk.f_name.toLowerCase()]=1*dong[pk.f_name.toLowerCase()];
                          else if(oldKeys[pk.f_name.toLowerCase()])
                            dong[pk.f_name.toLowerCase()]=1*oldKeys[pk.f_name.toLowerCase()];
                        }
                        else
                        {
                          e_where=(e_where?" && ":"")+"obj."+pk.f_name.toLowerCase()+"==='"+dong[pk.f_name.toLowerCase()]+"'";
                          if(dong[pk.f_name.toLowerCase()])
                            oldKeys[pk.f_name.toLowerCase()]=dong[pk.f_name.toLowerCase()];
                          else if(oldKeys[pk.f_name.toLowerCase()])
                            dong[pk.f_name.toLowerCase()]=oldKeys[pk.f_name.toLowerCase()];
                        }
                      });
                      if(!kt_gia_tri_khoa)
                        continue;
                      if(e_where && kt_gia_tri_khoa)
                      {
                        var filter_data_Child=Function("obj","return "+e_where);
                        seft.importDataEx[d][mnuC.table_name]=dataTC.filter(filter_data_Child).map(function(oI){
                          var objN=JSON.parse(JSON.stringify(oI));
                          CT_Khoas.forEach(function(pk){
                            if(objN[pk.f_name.toLowerCase()])
                              delete objN[pk.f_name.toLowerCase()];
                          });
                          return objN;
                        });
                      }
                    }
                  }
                }
                cSheet++;
              });
              seft.worker.postMessage("start"); 
              thongbao("Chuẩn bị đổ vào server "+seft.importDataEx.length+" dòng dữ liệu");
              seft.importDataCBOEx.forEach(function(objI){
                seft.csm_obj_updates(objI,function(msg){});
              });
              
              //Đổ số liệu vào Server
              // Scheduler.start()
              // seft.insertData();
            };
            reader.readAsBinaryString(f);
            //reader.readAsArrayBuffer(f);
          }
        }
        inputElement.click();
      },
      handleFileSelect(evt) {
        var e_id=evt.target.getAttribute("id");
        const file = evt.target.files[0];
        // Encode the file using the FileReader API
        const reader = new FileReader();
        reader.onloadend = () => {
            // Use a regex to remove data url part
          const base64String = reader.result;
          seft.menuConfig[e_id]=base64String;
          if(document.querySelector('a[name="'+e_id+'"]'))
            document.querySelector('a[name="'+e_id+'"]').remove();
          var a = document.createElement('a');
          a.target="_blank";
          a.href = base64String;
          a.download = file.name;
          a.textContent = 'Download '+file.name;
          a.name = e_id;
          document.querySelector('#'+e_id).parentNode.appendChild(a);
        };
        reader.readAsDataURL(file);
      },
      fireKeyTab(el)
      {
        var key=9;//Tab
        if(document.createEventObject)
        {
            var eventObj = document.createEventObject();
            eventObj.keyCode = key;
            el.fireEvent("onkeydown", eventObj);   
        }else if(document.createEvent)
        {
            var eventObj = document.createEvent("Events");
            eventObj.initEvent("keydown", true, true);
            eventObj.which = key;
            el.dispatchEvent(eventObj);
        } 
      },
      paginate:function (array, index, size) {
        // transform values
        index = Math.abs(parseInt(index));
        index = index > 0 ? index - 1 : index;
        size = parseInt(size);
        size = size < 1 ? 1 : size;

        // filter
        return [...(array.filter((value, n) => {
            return (n >= (index * size)) && (n < ((index+1) * size))
        }))]
      },
      callRowPrint(objData)
      {
        var seft=this;
        if(!seft.m_configs.trigger["report_db"])
          return;
        var t_code=seft.csm_decrypt(seft.m_configs.trigger["report_db"]);
        var rowsData = [];
        if(!objData && seft.select_row)
          objData=seft.select_row;
        if(objData)
        {
          rowsData=[];
          rowsData.push(objData);
        }
        if(rowsData.length===0)
          return thongbao("Vui lòng chọn dòng dữ liệu");
        else
        {
          thongbao("Vui lòng chờ phiếu in");
          var load_report_db=Function("seft", "data","bang",t_code);
          var dataRP=load_report_db(seft,rowsData,seft.database);
          dataRP["com_logo"]=seft.com_logo;
          seft.csm_print(seft.m_configs["report_name"],dataRP,seft.m_configs.p_width,seft.m_configs.p_height,seft.m_configs.orientation)
        }
      },
      initTable(){
        var seft=this;
        DevExpress.localization.locale('vi-VN');
        DevExpress.config({forceIsoDateParsing: false});
        DevExpress.ui.dxDataGrid.defaultOptions({
            options: {
                dateSerializationFormat: "dd/MM/yyyy HH:mm:ss",
                editing: {
                    popup: {
                        fullScreen: true
                    }
                }
            }
        });
//      Kiểm tra xem có xử lý cột hoặc dòng tùy chỉnh theo mẫu không
        if(seft.m_configs.trigger["datacolumntemplate"])
          if(seft.m_configs.trigger["datacolumntemplate"]!=='')
          {
            var t_column_code=seft.csm_decrypt(seft.m_configs.trigger["datacolumntemplate"]);
            var fn_column_code=Function("columns","seft",t_column_code);
            seft.colsGrid=fn_column_code(seft.colsGrid,seft);
          }
        var kieu_chinh="popup";
        if(seft.m_configs["row_type_edit"])
          if(1*seft.m_configs["row_type_edit"]===1)
            kieu_chinh="row";
        // console.log(seft.m_configs.menu_id,seft.menus_permission,seft.menus_permissions[seft.m_configs.menu_id],(seft.menus_permissions[seft.m_configs.menu_id]&1))
        var grd_buttons=[];
        if(!seft.m_configs.g_readonly && ((seft.menus_permissions[seft.m_configs.menu_id]&1)!==0)||seft.permissions===-1)
        {
          if((seft.menus_permissions[seft.m_configs.menu_id]&4)!==0||seft.permissions===-1)
            grd_buttons.push({
              name:'edit',
              hint: 'Sửa',
              template: function(data) {
                  return $("<a>").addClass("dx-link dx-link-icon fa fa-edit");
              }
            });
          if((seft.menus_permissions[seft.m_configs.menu_id]&8)!==0||seft.permissions===-1)
            grd_buttons.push({
              name:'delete',
              hint: 'Xóa',
              template: function(data) {
                  return $("<a>").addClass("dx-link dx-link-icon fa fa-trash text-red");
              }
            });
          if((seft.menus_permissions[seft.m_configs.menu_id]&2)!==0||seft.permissions===-1)
            grd_buttons.push({
              hint: 'Nhân bản',
              template: function(data) {
                  return $("<a>").addClass("dx-link dx-link-icon fa fa-copy text-green");
              },
              visible(e) {
                return !e.row.isEditing;
              },
              disabled(e) {
                // return isChief(e.row.data.Position);
              },
              onClick(e) {
                e.component.selectRows([{ id: e.row.data.id}], true);
                seft.copyRow=e.row.data;
                setTimeout(function(){
                  e.component.beginUpdate();
                  e.component.addRow();
                  e.component.endUpdate();
                },5);
              },
            });
        }  
        if(grd_buttons.length>0 && !seft.m_configs.g_readonly)
          seft.colsGrid= [
          {
            type: 'buttons',
            width: 110,
            fixed: true,
            fixedPosition: "right",
            buttons:grd_buttons,
          }].concat(seft.colsGrid);
        var formEditing= {
          onContentReady: function (e) {  
            seft.master_form=e.component;
          },  
          onFieldDataChanged: function (e) {  
            var oldV=seft.editors_controls[seft.m_configs.id][e.dataField]?seft.editors_controls[seft.m_configs.id][e.dataField].option("value"):'@@@@@NULL@@@@@@';
            var newV=e.value;
            // console.log(oldV,newV,e.dataField)
            if(oldV!==newV)
              setTimeout(function(){
                if(seft.editors_controls[seft.m_configs.id][e.dataField])
                {
                  var val=e.value;
                  // console.log(e.dataField.toLowerCase(),val);
                  seft.select_row[e.dataField.toLowerCase()]=val;
                  var o_field=seft.tableFields.find(f=>f.f_name.toLowerCase()===e.dataField.toLowerCase())
                  if(seft.editors_controls[seft.m_configs.id][e.dataField].NAME==="dxDateBox" && val)
                    val=(typeof e.value ==='string'?chuyenNgay(e.value.padEnd(19," "+dateFormat(new Date(),"HH:MM:ss")),"dd/mm/yyyy HH:MM:ss"):e.value);
                  if(o_field.f_types.toLowerCase()==='date' && val)
                  {
                    oldV=dateFormat(seft.editors_controls[seft.m_configs.id][e.dataField].option("value"),"dd/mm/yyyy");
                    newV=dateFormat(val,"dd/mm/yyyy");
                  }
                  if(oldV!==newV)
                    seft.editors_controls[seft.m_configs.id][e.dataField].option("value",val);
                }
            },10);
            // console.log(e.dataField,e.value);
           // e.component.validate();
            // if(e.dataField!=="id" && e.dataField!=="_id" && e.component.itemOption("master."+e.dataField))
            //   e.component.itemOption("master."+e.dataField);
          },  
          onInitialized: function (e) {  
              // console.log('We are about to edit Timelog Row: ');  
          },  
          items: [{
            itemType: 'group',
            colCount: 2,
            colSpan: 2,
            name:"master",
            items: seft.colsGrid.filter(f=>f.f_types!=='edt' && f.type!=='buttons').map(function(Obj){
              return {dataField: Obj.dataField,name: Obj.dataField};
            })
          }],
        };
        if(seft.colsGrid.filter(f=>f.f_types==='edt').length>0)
          formEditing["items"].push({
            itemType: 'group',
            name:"editors",
            colCount: 2,
            colSpan: 2,
            items: seft.colsGrid.filter(f=>f.f_types==='edt').map(function(Obj){
              return {
                dataField: Obj.dataField,
                name: Obj.dataField,
                colSpan: 2,
              };
            }),
          });
        if(seft.m_configs["nodes"])
          seft.m_configs["nodes"].forEach(function(mn){
            seft.defaultValRow[mn.id]={};
            mn.table.sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).forEach(function(Obj){
              if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
                seft.defaultValRow[mn.id][Obj.f_name]=0;
              else
                seft.defaultValRow[mn.id][Obj.f_name]='';
            });
            mn.table=JSON.parse(JSON.stringify(mn.table)).map(m=>Object.assign(m,{tree_id:mn.id,table_name:mn.table_name}));
            formEditing["items"].push({
              itemType: 'group',
              colCount: 2,
              colSpan: 2,
              caption:seft.getNameMenu(mn.label),
              name:"details",
              template: function (dataDT, itemElement) {
                seft.defaultValRow[mn.tree_id]={};
                var Details_Columns=mn.table.filter(function(f){
                  if(1*f.f_show===1 && f.f_name.toLowerCase()!=='id' && f.f_name.toLowerCase()!=='parent_id')
                  {
                    if(f.f_types.indexOf('co')!==-1)
                      seft.getOptionsSelect(f.f_cbo_query,mn.id,f.f_name);
                    return true; 
                  }
                  else
                    return false;
                }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(Obj){
                  // console.log(mnu);
                  var defCol=Obj;
                  if(seft.defaultValRow[Obj.tree_id])
                    if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
                      seft.defaultValRow[Obj.tree_id][Obj.f_name]=0;
                    else
                      seft.defaultValRow[Obj.tree_id][Obj.f_name]='';
                  Obj=Object.assign(Obj,{
                    dataField:Obj.f_name,showWhenGrouped:Obj.f_group_index?true:false,groupIndex:Obj.f_group_index?Obj.f_group_index:-1,
                    caption:Obj.f_header,
                    width:1*Obj.f_width,
                    cssClass:Obj.f_types
                  });
                  if(Obj.f_sort!=='')
                    Obj=Object.assign(Obj,{sortOrder:Obj.f_sort});
                  if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
                    Obj=Object.assign(Obj,{
                      dataType: 'number',
                      alignment: 'right',
                      format:Obj.f_types.indexOf('price')!==-1?"#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""):"#",
                      editCellTemplate: function (cellElement, cellInfo) {
                        const $ctrlE=$("<div />").dxNumberBox({
                          format: Obj.f_types.indexOf('price')!==-1?"#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""):"#",
                          elementAttr: {class: "num"},
                          onValueChanged: function (e) {
                            cellInfo.setValue(e.value);
                          },
                          readOnly:Obj.f_types.indexOf('ro')!==-1,
                          value: (cellInfo.value?cellInfo.value:'')
                        });
                        if(!seft.editors_controls[Obj.tree_id])
                          seft.editors_controls[Obj.tree_id]={};
                        seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxNumberBox("instance");
                        $ctrlE.appendTo(cellElement);
                      },
                    });
                  else if(Obj.f_types.indexOf('datetime')!==-1)
                  {
                    Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) {  
                      const $ctrlE=$("<div />").dxDateBox({
                        useMaskBehavior: true,
                        type: 'datetime',
                        // width: 1*Obj.f_width,
                        elementAttr: {class: "datetime"},
                        displayFormat: 'dd/MM/yyyy HH:mm:ss',
                        onValueChanged: function (e) {
                          if(e.value)
                          {
                            if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"))
                            {
                              cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy HH:MM:ss");
                              cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"));
                            }
                          }
                          else
                            cellInfo.setValue("");
                        },
                        value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value.padEnd(19," "+dateFormat(new Date(),"HH:MM:ss")),"dd/mm/yyyy HH:MM:ss"):cellInfo.value)
                      });
                      if(!seft.editors_controls[Obj.tree_id])
                        seft.editors_controls[Obj.tree_id]={};
                      seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxDateBox("instance");
                      $ctrlE.appendTo(cellElement);
                    },dataType: "datetime",editorType:"datetime",format:'dd/MM/yyyy HH:mm:ss',editorOptions:{type: "date",format:"dd/MM/yyyy HH:mm:ss"}});
                  }
                  else if(Obj.f_types.indexOf('date')!==-1)
                  {
                    Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) {  
                      const $ctrlE=$("<div />").dxDateBox({
                        useMaskBehavior: true,
                        type: 'date',
                        // width: 1*Obj.f_width,
                        elementAttr: {class: "date"},
                        displayFormat: 'dd/MM/yyyy',
                        value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value,"dd/mm/yyyy"):cellInfo.value),
                        onValueChanged: function (e) {
                          if(e.value)
                          {
                            if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy") && e.value)
                            {
                              cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy");
                              cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy"));
                            }
                          }
                          else
                            cellInfo.setValue("");
                        }
                      });
                      if(!seft.editors_controls[Obj.tree_id])
                        seft.editors_controls[Obj.tree_id]={};
                      seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxDateBox("instance");
                      $ctrlE.appendTo(cellElement);
                    },dataType: "date",editorType:"date",format:"dd/MM/yyyy",editorOptions:{type: "date",format:"dd/MM/yyyy"}});
                  }
                  else if(Obj.f_types.indexOf('time')!==-1)
                  {
                    Obj = Object.assign(Obj, {
                      editCellTemplate: function (cellElement, cellInfo) {
                        // Tạo một thẻ input với type time
                        const $ctrlE = $("<input />").attr({
                          type: 'time',
                          class: 'time',
                          value: cellInfo.value
                        });

                        // Đặt sự kiện thay đổi giá trị
                        $ctrlE.on('input', function (e) {
                          const newValue = e.target.value;
                          if (cellInfo.data[cellInfo.column.dataField] !== newValue) {
                            cellInfo.data[cellInfo.column.dataField] = newValue;
                            cellInfo.setValue(newValue);
                          }
                        });

                        // Đảm bảo editor_controls tồn tại
                        if (!seft.editors_controls[tree_id]) {
                          seft.editors_controls[tree_id] = {};
                        }
                        seft.editors_controls[tree_id][Obj.f_name] = $ctrlE;

                        // Thêm input vào cellElement
                        $ctrlE.appendTo(cellElement);
                      },
                      dataType: "time",
                      editorType: "time",
                      format: "HH:mm:ss",
                      editorOptions: {
                        type: "time",
                        format: "HH:mm:ss"
                      }
                    });
                  }
                  else if(Obj.f_types==='img'||Obj.f_types==='file')
                  {
                    Obj=Object.assign(Obj,{
                      allowFiltering: false,
                      allowSorting: false,
                      cellTemplate: function(container, options) {
                        let imgElement = document.createElement("img");
                        if(Obj.f_types==='file')
                        {
                          imgElement= document.createElement('a');
                          if(options.value)
                          {
                            var fileName = options.value.split('/').pop();
                            imgElement.target="_blank";
                            imgElement.download = fileName;
                            imgElement.textContent = 'Download '+fileName;
                            imgElement.name = fileName;
                          }
                          imgElement.href = options.value;
                        }
                        else
                        {
                          imgElement.setAttribute('height','18px');
                          imgElement.setAttribute('src',options.value);
                        }
                        container.append(imgElement);
                      },
                      editCellTemplate: function(cellElement, cellInfo) {
                        let buttonElement = document.createElement("div");
                        buttonElement.classList.add("retryButton");
                        let retryButton = $(buttonElement).dxButton({
                          text: "Retry",
                          visible: false,
                          onClick: function() {
                            // The retry UI/API is not implemented. Use a private API as shown at T611719.
                            for (var i = 0; i < fileUploader._files.length; i++) {
                              delete fileUploader._files[i].uploadStarted;
                            }
                            fileUploader.upload();
                          }
                        }).dxButton("instance");

                        let fileUploaderElement = document.createElement("div");
                        let fileUploader = $(fileUploaderElement).dxFileUploader({
                          multiple: false,
                          name: 'file',
                          accept: Obj.f_types==='img'?'image/*':'*.*',
                          invalidMaxFileSizeMessage: "Kích thước tệp quá lớn",  
                          uploadFailedMessage: "Tải lên không thành công",  
                          minFileSize: 1024, // 1 KB
                          maxFileSize: 512 * 1024, // 1 MB
                          onValueChanged: function(e) {
                            let reader = new FileReader();
                            reader.onload = function(args) {
                              var objI={};
                              objI["name"]=e.value[0].name;
                              objI["app_id"]=seft.database[seft.L_table_name[0]].app_id;
                              objI["src"]=args.target.result;
                              objI["size"]=e.value[0].size;
                              objI["id"]=cellInfo.data["id"];
                              objI["f_name"]=Obj.f_name;
                              var urlIMG='/app_images/'+objI.app_id+'/'+seft.doi_ten_hinh(objI["name"]);
                              cellInfo.setValue(urlIMG);
                              let imageElement = document.createElement("img");
                              if(Obj.f_types==='file')
                              {
                                imageElement= document.createElement('a');
                                if(urlIMG)
                                {
                                  var fileName = cellInfo.value.split('/').pop();
                                  imageElement.target="_blank";
                                  imageElement.download = fileName;
                                  imageElement.textContent = 'Download '+fileName;
                                  imageElement.name = fileName;
                                }
                                imageElement.href = urlIMG;
                              }
                              else
                              {
                                imageElement.classList.add("uploadedImage");
                                imageElement.setAttribute('height','100px');
                                imageElement.setAttribute('src',urlIMG);
                              }
                              cellElement.append(imageElement);
                              if(!seft.filesUploader[mn.id])
                                seft.filesUploader[mn.id]={};
                              seft.filesUploader[mn.id][Obj.f_name]=objI;
                            }
                            if(e.value[0])
                              reader.readAsDataURL(e.value[0]); 
                          }
                        }).dxFileUploader("instance");
                        cellElement.append(fileUploaderElement);
                        cellElement.append(buttonElement);
                      }
                    });
                  }
                  else if(Obj.f_types==='edt')
                  {
                    Obj=Object.assign(Obj,{
                      formItem: {
                        colSpan: 2,
                        editorOptions: {
                          height: 800,
                        },
                      },
                      visible:false,
                      editCellTemplate: function (itemElement, cellInfo) {  
                        ($("<textarea>", { "id": "ckpeditor_"+Obj.f_name,height:800, "val": decodeURIComponent(cellInfo.value||'') })).appendTo(itemElement);  
                        $("<script>").append(CKEDITOR.replace("ckpeditor_"+Obj.f_name)).appendTo(itemElement);  
                        $("<script>").append(CKEDITOR.instances["ckpeditor_"+Obj.f_name].on("change", function () {
                          cellInfo.setValue(encodeURIComponent(CKEDITOR.instances["ckpeditor_"+Obj.f_name].getData().replace(location.origin,'')));
                        })).appendTo(itemElement); 
                      },
                    });
                  }
                  else if(Obj.f_types.indexOf('co')!==-1)
                  {
                    if(Obj["f_grid"] && Obj["f_grid_fields"])
                    {
                      var colGrid=[];
                      var mnuColGrid=seft.menus.find(m=>m.id===Obj["f_grid"]);
                      if(mnuColGrid)
                      {
                        Obj["f_grid_fields"].forEach(function(fc){
                          var tim_cot=mnuColGrid.table.find(c=>c.f_name===fc);
                          if(tim_cot)
                          {
                            var cot_moi =JSON.parse(JSON.stringify(tim_cot));
                            cot_moi["f_stt"]=colGrid.length+1;
                            colGrid.push(cot_moi);
                          }
                        })
                      }
                      // console.log(colGrid,Obj["f_grid_fields"]);
                      // colGrid=mnuColGrid.table.filter(f=>Obj["f_grid_fields"].find(fc=>fc===f.f_name));
                      if(colGrid.length>0)
                      {
                        var filter_data=function(obj){return true;};
                        if(mnuColGrid.trigger["filter"])
                        {
                          var t_code=seft.csm_decrypt(mnuColGrid.trigger["filter"]);
                          filter_data=Function("obj",t_code);
                        }
                        var g_load_db=[];
                        if(mnuColGrid.trigger["load_db"])
                        {
                          var t_code=seft.csm_decrypt(mnuColGrid.trigger["load_db"]);
                          var fn_load_db=Function("seft","db","mtdata",t_code);
                          g_load_db=fn_load_db(seft,seft.database,seft.editors_controls[seft.m_configs.id]);
                        }
                        else
                          g_load_db=seft.database[mnuColGrid.table_name].rows;
                        colGrid=colGrid.filter(function(f){
                          if(f.f_types.indexOf('co')!==-1)
                            seft.getOptionsSelect(f.f_cbo_query,mnuColGrid.id,f.f_name);
                          return true; 
                        }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(f){
                          var ObjC={dataField:f.f_name,caption:f.f_header,width:1*f.f_width,cssClass:f.f_types};
                          if(f.f_types.indexOf('co')!==-1)
                            ObjC=Object.assign(ObjC,{
                              editorOptions: {
                                searchEnabled: true,
                                showClearButton: true
                              },
                              lookup: {
                                  searchEnabled: true,
                                  showClearButton: true,
                                  dataSource: function (options) {  
                                      return {  
                                          store: {
                                            type: 'array',  
                                            data:seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["options"],  
                                            key: "ma", 
                                          },  
                                          filter:function (item) { 
                                            if(options.data && seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name].hasOwnProperty('where'))
                                              if(seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"]!=="")
                                              {
                                                var str=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"];
                                                if(options.data.length>0)
                                                {
                                                  var fields=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["fields"];
                                                  var dataRow=options.data;
                                                  var dataOps=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["data"];
                                                  // alert(str+"=>"+JSON.stringify(dataOps))
                                                  var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                                  var fData=dataOps.filter(function(o){
                                                    return fnFilter(dataRow,o);
                                                  }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                                  // alert(fields[0]+":"+fields[1]+"="+dataOps.length+"=>"+fData.length);
                                                  var fData=fData.find(o=>o.ma===item.ma);
                                                  if(fData)
                                                    return true;
                                                  else
                                                    return false; 
                                                }
                                                else
                                                {
                                                  var fnFilter=Function("bang",'data',(str.indexOf("return ")===-1?"return ":"")+str);
                                                  fnFilter(seft.database,item);
                                                }
                                              }
                                            return true;
                                          } 
                                      }  
                                  },
                                  displayExpr: 'ten',
                                  valueExpr: 'ma',
                              }
                            });
                          return ObjC;
                        });
                        Obj=Object.assign(Obj,{
                          editorOptions: {
                            disabled: Obj.f_types.indexOf('ro')!==-1,
                            searchEnabled: true,
                            showClearButton: true
                          },
                          lookup: {
                            searchEnabled: true,
                            dataSource:g_load_db.filter(filter_data),
                            valueExpr: 'id',
                            displayExpr(item) {
                              if(item)
                              {
                                var ten=item[Obj["f_grid_fields"][1]];
                                var ma=item[Obj["f_grid_fields"][0]];
                                return item && `${ma} <${ten}>`;
                              }
                              return '';
                            },
                          },
                          editCellTemplate:function(cellElement, cellInfo) {
                            var filter_data=function(obj){return true;};
                            if(mnuColGrid.trigger["filter"])
                            {
                              var t_code=seft.csm_decrypt(mnuColGrid.trigger["filter"]);
                              filter_data=Function("obj",t_code);
                            }
                            var g_load_db=[];
                            if(mnuColGrid.trigger["load_db"])
                            {
                              var t_code=seft.csm_decrypt(mnuColGrid.trigger["load_db"]);
                              var fn_load_db=Function("seft","db","mtdata",t_code);
                              g_load_db=fn_load_db(seft,seft.database,seft.editors_controls[seft.m_configs.id]);
                            }
                            else
                              g_load_db=seft.database[mnuColGrid.table_name].rows;
                            const $ctrlE=$('<div>').dxDropDownBox({
                              searchEnabled: true,
                              disabled: Obj.f_types.indexOf('ro')!==-1,
                              dropDownOptions: { width: 500 },
                              dataSource:g_load_db.filter(filter_data),
                              value: cellInfo.value,
                              valueExpr: 'id',
                              displayExpr(item) {
                                if(item)
                                {
                                  var ten=item[Obj["f_grid_fields"][1]];
                                  var ma=item[Obj["f_grid_fields"][0]];
                                  return item && `${ma} <${ten}>`;
                                }
                                return '';
                              },
                              inputAttr: { 'aria-label': 'Owner' },
                              contentTemplate(eDD) {
                                const value = eDD.component.option('value');
                                const $dataGrid = $('<div>').dxDataGrid({
                                  dataSource: g_load_db.filter(filter_data),
                                  columns: colGrid?colGrid:Obj["f_grid_fields"],
                                  hoverStateEnabled: true,
                                  paging: { enabled: true, pageSize: 5 },
                                  pager: {
                                    visible: true,
                                    // allowedPageSizes: [5, 10, 'all'],
                                    showPageSizeSelector: true,
                                    showInfo: true,
                                    showNavigationButtons: true,
                                  },
                                  keyExpr: 'id',
                                  searchPanel: {
                                    visible: true,
                                    width: 240,
                                    placeholder: 'Tìm kiếm ...',
                                  },
                                  scrolling: { mode: 'virtual' },
                                  selection: { mode: 'single' },
                                  selectedRowKeys: value?[value]:[],
                                  height: '100%',
                                  onSelectionChanged(selectedItems) {
                                    const keys = selectedItems.selectedRowKeys;
                                    const hasSelection = keys.length;
                                    if(hasSelection>0)
                                    {
                                      try{
                                        var rIDX=cellInfo.row.rowIndex;
                                        if(rIDX!==-1)
                                        {
                                          var dataR=selectedItems.selectedRowsData;
                                          cellInfo.setValue(keys[0]); 
                                          eDD.component.option('value', hasSelection>0 ? keys[0] : null);
                                          dataR.forEach(function(row){
                                            Object.keys(row).forEach(function(c){
                                              if(cellInfo.component.columnOption(c) && c!=="id" && c!=="_id")
                                                cellInfo.component.cellValue(rIDX,c,row[c]);
                                              else if(mn.table.find(f=>f.f_name.toLowerCase()===c.toLowerCase()) && c!=="id" && c!=="_id")
                                                cellInfo.row.data[c]=row[c];
                                            });
                                          });
                                        }
                                      }catch(erE){}
                                    }
                                    // cellInfo.component.refresh();
                                  },
                                });
                                var dataGrid = $dataGrid.dxDataGrid('instance');
                                eDD.component.on('valueChanged', (args) => {
                                  dataGrid.selectRows(args.value, false);
                                  eDD.component.close();
                                });
                                return $dataGrid;
                              },
                            });
                            if(!seft.editors_controls[Obj.tree_id])
                              seft.editors_controls[Obj.tree_id]={};
                            seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxDropDownBox("instance");
                            $ctrlE.appendTo(cellElement);
                          }
                        });
                      }
                    }
                    else
                      Obj=Object.assign(Obj,{
                        editorOptions: {
                          disabled: Obj.f_types.indexOf('ro')!==-1,
                          searchEnabled: true,
                          showClearButton: true
                        },
                        editCellTemplate: function (cellElement, cellInfo) {
                          const $ctrlE=$('<div>').dxSelectBox({
                            disabled: Obj.f_types.indexOf('ro')!==-1,
                            dataSource:seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["options"],
                            displayExpr: 'ten',
                            valueExpr: 'ma',
                            searchEnabled: true,
                            showClearButton: true,
                            value: cellInfo.value, 
                            placeholder: "Vui lòng chọn...",
                            onValueChanged: function(e) {
                             cellInfo.setValue(e.value);  
                            }  
                          });
                          if(!seft.editors_controls[Obj.tree_id])
                            seft.editors_controls[Obj.tree_id]={};
                          seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxSelectBox("instance");
                          $ctrlE.appendTo(cellElement);
                        },
                        lookup: {
                          dataSource: function (options) {
                            return { 
                              store: {
                                type: 'array',  
                                data:seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["options"],  
                                key: "ma", 
                              }, 
                              filter:function (item) {
                                if(options.data &&seft.optionsSelect[mn.id+"_^_"+Obj.f_name].hasOwnProperty('where'))
                                  if(seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["where"]!=="")
                                  {
                                    var str=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["where"];
                                    if(options.data.length>0)
                                    {
                                      var fields=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["fields"];
                                      var dataRow=options.data;
                                      var dataOps=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["data"];
                                      // alert(str+"=>"+JSON.stringify(dataOps))
                                      var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                      var fData=dataOps.filter(function(o){
                                        return fnFilter(dataRow,o);
                                      }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                      var fData=fData.find(o=>o.ma===item.ma);
                                      if(fData)
                                        return true;
                                      else
                                        return false; 
                                    }
                                    else
                                    {
                                      var fnFilter=Function("bang",'data',str);
                                      fnFilter(seft.database,item);
                                    }
                                  }
                                  return true;
                              }
                            }
                          },
                          displayExpr: 'ten',
                          valueExpr: 'ma',
                        }
                      });
                  }
                  else
                    Obj=Object.assign(Obj,{
                      editCellTemplate: function (cellElement, cellInfo) {
                        const $ctrlE=$("<div />").dxTextBox({
                          onValueChanged: function (e) {
                              cellInfo.setValue(e.value);
                          },
                          readOnly:Obj.f_types.indexOf('ro')!==-1,
                          value: (cellInfo.value?cellInfo.value:'')
                        });
                        if(!seft.editors_controls[Obj.tree_id])
                          seft.editors_controls[Obj.tree_id]={};
                        seft.editors_controls[Obj.tree_id][Obj.f_name]=$ctrlE.dxTextBox("instance");
                        $ctrlE.appendTo(cellElement);
                      }
                    });
                  return Obj;
                });
                var filter_data=function(obj){return true;};
                var dataSDtail=JSON.parse(JSON.stringify(seft.select_row[mn.table_name]?seft.select_row[mn.table_name]:[]));
                if(mn.trigger["filter"])
                {
                  var t_code=seft.csm_decrypt(mn.trigger["filter"]);
                  filter_data=Function("obj",t_code);
                }
                dataSDtail=JSON.parse(JSON.stringify(dataSDtail.filter(filter_data)));
                const $item =$("<div>")
                .dxDataGrid({
                    columnAutoWidth: true,
                    showBorders: true,
                    keyExpr: 'id',
                    width: '100%',
                    editing: {
                        mode: "row",
                        allowAdding: true,
                        allowUpdating: true,
                        allowDeleting: true,
                        confirmDelete: true,
                        useIcons: true,
                    },
                    onContentReady: function(e){  
                      if (!e.component.getSelectedRowKeys().length) {
                        e.component.selectRowsByIndexes(-1);  
                        setTimeout(function(){ 
                          e.component.selectRowsByIndexes(0);
                        },300);
                      }
                      $(".dx-datagrid-table").addClass("table");
                      if(mn.trigger["report_db"] && mn["report_name"])
                      { 
                        if(mn.trigger["report_db"]!=='' && mn["report_name"]!=='')
                        {
                          var $cBPrint = $('<div id="cBPrint">').dxButton({
                            icon: 'print', //or your custom icon
                            onClick: seft.callRowPrint
                          });
                          if (e.element.find('#cBPrint').length == 0)
                            e.element
                            .find('.dx-toolbar-after')
                            .prepend($cBPrint);
                        }
                      }
                    }, 
                    onEditingStart() {
                      setTimeout(function(){
                       seft.EnterToTab();
                      },500);
                        // alert('EditingStart');
                    },
                    onInitNewRow(info) {
                      if(seft.copyRow)
                      {
                        info.data=Object.assign(info.data,seft.copyRow);
                        seft.copyRow=false;
                      }
                      info.data["id"]=seft.guid(seft.app_id);
                      setTimeout(function(){
                        info.component.navigateToRow(info.data.id);
                        info.component.selectRows([{ id: info.data.id}], true);
                        seft.EnterToTab();
                      },500);
                    },
                    onKeyDown(e) {
                      if(seft.m_configs.g_readonly)
                      {
                        e.event.preventDefault();
                        return;
                      }
                      if (e.event.ctrlKey && e.event.key === "s") {
                        var fCDi=e.component.option("focusedColumnIndex");
                        var fRDi=e.component.option("focusedRowIndex");
                        var elDCell=e.component.getCellElement(fRDi, fCDi);
                        if(elDCell)
                          seft.fireKeyTab(elDCell.get(0));
                        e.component.saveEditData();
                        e.event.preventDefault();
                      }
                      else if(e.event.key === "F4")
                      {
                        e.component.beginUpdate();
                        e.component.addRow();
                        e.component.endUpdate();
                        e.event.preventDefault();
                      }
                      else if(e.event.key === "F3")
                      {
                        var kkeys = e.component.getSelectedRowKeys();
                        if(kkeys.length>0)
                        {
                          var rIndex = e.component.getRowIndexByKey(kkeys[0]);
                          e.component.editRow(rIndex);
                        }
                        else
                          canhbao("Vui lòng chọn dòng cần sửa");
                        e.event.preventDefault();
                      }
                      else if(e.event.key === "F8")
                      {
                        var kkeys = e.component.getSelectedRowKeys();
                        if(kkeys.length>0)
                        {
                          var rIndex = e.component.getRowIndexByKey(kkeys[0]);
                          e.component.deleteRow(rIndex);
                        }
                        else
                          canhbao("Vui lòng chọn dòng cần xóa");
                        e.event.preventDefault();
                      }
                    },
                    onOptionChanged(e) {
                      if (e.name === 'editing') {
                        const editRowKey = e.component.option('editing.editRowKey');
                        let changes = e.component.option('editing.changes');
                        var rows = e.component.getVisibleRows();  
                        var rowIndex = e.component.getRowIndexByKey(editRowKey);
                        if(rowIndex!==-1)
                        {
                          if(!seft.select_row[mn.table_name])
                            seft.select_row[mn.table_name]=[];
                          var row = rows[rowIndex];
                          row.data=Object.assign(seft.defaultValRow[mn.id],row.data);
                          var dataSDtail=[];
                          if(seft.select_row[mn.table_name])
                            dataSDtail=seft.select_row[mn.table_name];
                          var filter_data=function(obj){return true;};
                          if(mn.trigger["filter"])
                          {
                            var t_code=seft.csm_decrypt(mn.trigger["filter"]);
                            filter_data=Function("obj",t_code);
                          }
                          dataSDtail=JSON.parse(JSON.stringify(dataSDtail.filter(filter_data)));
                          if(mn.trigger["update"])
                            if(mn.trigger["update"]!=='')
                            {
                              var dataRow =JSON.parse(JSON.stringify(row.data));
                              var t_code=seft.csm_decrypt(mn.trigger["update"]);
                              var updateRow=Function("seft", "data","dataMT","bang",t_code);
                              var newData=updateRow(seft,dataRow,seft.select_row,seft.database);
                              if(newData)
                              {
                                if(newData["ton_ck"] && newData["so_luong"])
                                {
                                  if(1*newData["so_luong"]>1*newData["ton_ck"])
                                  {
                                    newData["so_luong"]=newData["ton_ck"];
                                    canhbao("Vui lòng chọn mã khác vì số lượng xuất vượt mức tồn kho");
                                  }
                                }
                                row.data=Object.assign(row.data,newData);
                                Object.keys(newData).filter(k=>k!=="id" && k!=="_id").forEach(function(c){
                                  try{
                                    if(seft.editors_controls[mn.id][c] && newData[c])
                                    {
                                      var val=newData[c];
                                      if(seft.editors_controls[mn.id][c].NAME==="dxDateBox")
                                        val=(typeof newData[c] ==='string'?chuyenNgay(newData[c].padEnd(19," "+dateFormat(new Date(),"HH:MM:ss")),"dd/mm/yyyy HH:MM:ss"):newData[c]);
                                      seft.editors_controls[mn.id][c].option("value",val);
                                    }
                                  }catch(erD){}
                                });
                              }
                            }
                          var checkCT=mn.table.filter(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'||fe.f_name.toLowerCase()==='so_ct';});
                          if(checkCT.length===2)
                          {
                            var t_ngay=mn.table.find(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'});
                            var kieungay='dd/mm/yyyy',dd_kieungay='yymmdd';
                            if(t_ngay)
                              if(t_ngay.f_types.indexOf('datetime')!==-1)
                              { 
                                kieungay='dd/mm/yyyy HH:MM:ss';
                                dd_kieungay='yymmddHHMMss';
                              }
                            if(!row.data["so_ct"])
                              row.data["so_ct"]="";
                            if(row["ngay_ct"]==='')
                              row.data["ngay_ct"]=dateFormat(new Date(),kieungay);
                            if(!row.data["so_ct"].startsWith((mn["prefix_pk"]?mn["prefix_pk"]:"")+dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay)))
                            {
                              var fHD=dataSDtail.filter(dh=>dh.id!==editRowKey && dateFormat(chuyenNgay(dh["ngay_ct"],kieungay),dd_kieungay)===dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay));
                              row.data["so_ct"]=(mn["prefix_pk"]?mn["prefix_pk"]:"")+dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay)+(fHD.length+1).toString().padStart(3,"0");
                            }
                          }
                          if(changes.length>0)
                          {
                            changes[0].data=row.data;
                            var idxF=dataSDtail.findIndex((obj) => {
                              return obj.id === row.data.id;
                            });
                            if(idxF!==-1)
                              dataSDtail[idxF]=row.data;
                            else
                              dataSDtail.push(row.data);
                          }
                          if(seft.select_row)
                          {
                            dataSDtail.forEach(function(ct){
                              var idxFBC=seft.select_row[mn.table_name].findIndex((obj) => {
                                return obj.id === ct.id;
                              });
                              if(idxFBC!==-1)
                                seft.select_row[mn.table_name][idxFBC]=ct;
                              else
                                seft.select_row[mn.table_name].push(ct);
                            });
                            var rowM = JSON.parse(JSON.stringify(seft.select_row));
                            // rowM[mn.table_name]=seft.select_row[mn.table_name];
                            if(seft.m_configs.trigger["update"])
                              if(seft.m_configs.trigger["update"]!=='')
                              {
                                var dataRowM =JSON.parse(JSON.stringify(rowM));
                                var t_code=seft.csm_decrypt(seft.m_configs.trigger["update"]);
                                var updateRowMaster=Function("seft", "data","bang",t_code);
                                dataRowM=updateRowMaster(seft,dataRowM,seft.database);
                                rowM=Object.assign(rowM,dataRowM);
                                // delete rowM[mn.table_name];
                              }
                            var checkCT=seft.tableFields.filter(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'||fe.f_name.toLowerCase()==='so_ct';});
                            if(checkCT.length===2)
                            {
                              var t_ngay=seft.tableFields.find(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'});
                              var kieungay='dd/mm/yyyy',dd_kieungay='yymmdd';
                              if(t_ngay)
                                if(t_ngay.f_types.indexOf('datetime')!==-1)
                                { 
                                  kieungay='dd/mm/yyyy HH:MM:ss';
                                  dd_kieungay='yymmddHHMMss';
                                }
                              if(!rowM["so_ct"])
                                rowM["so_ct"]="";
                              if(rowM["ngay_ct"]==='')
                                rowM["ngay_ct"]=dateFormat(new Date(),kieungay);
                              if(!rowM["so_ct"].startsWith((seft.m_configs["prefix_pk"]?seft.m_configs["prefix_pk"]:"")+dateFormat(chuyenNgay(rowM["ngay_ct"],kieungay),dd_kieungay)))
                              {
                                var fHD=seft.load_db.filter(dh=>dh.id!==rowM.id && dateFormat(chuyenNgay(dh["ngay_ct"],kieungay),dd_kieungay)===dateFormat(chuyenNgay(rowM["ngay_ct"],kieungay),dd_kieungay));
                                rowM["so_ct"]=(seft.m_configs["prefix_pk"]?seft.m_configs["prefix_pk"]:"")+dateFormat(chuyenNgay(rowM["ngay_ct"],kieungay),dd_kieungay)+(fHD.length+1).toString().padStart(3,"0");
                              }
                            }
                            if(seft.master_form)
                              seft.master_form.option('formData',rowM);
                            seft.select_row = JSON.parse(JSON.stringify(rowM));
                          }
                        }
                      }
                    },
                    onEditorPreparing: function (e) {   
                      // if(e.name)
                      // alert(e.name)
                      // if (e.dataField && e.parentType === "dataRow") {
                      //   if(e.component.getVisibleRows().length>0)
                      //   {
                      //     if(mn.trigger["update"])
                      //       if(mn.trigger["update"]!=='')
                      //       {
                      //         var dataRow =JSON.parse(JSON.stringify(e.row.data));
                      //         var t_code=seft.csm_decrypt(mn.trigger["update"]);
                      //         var updateRow=Function("seft", "data","bang",t_code);
                      //         var newData=updateRow(seft,dataRow,seft.database);
                      //         if(newData)
                      //           e.row.data=Object.assign(e.row.data,newData);
                      //       }
                      //   }
                      // }
                    },
                    onSaving(e) {
                      const change = e.changes[0];
                      if (change) {
                        var rows =e.component.getVisibleRows(); 
                        var rowIndex = e.component.getRowIndexByKey(change.key);  
                        var row = change;
                        if(rowIndex!==-1)
                          row =rows[rowIndex]; 
                        var oldRowData={};
                        var dataSDtail=[];
                        if(seft.select_row[mn.table_name])
                          dataSDtail=seft.select_row[mn.table_name];
                        else
                          seft.select_row[mn.table_name]=[];
                        var filter_data=function(obj){return true;};
                        if(mn.trigger["filter"])
                        {
                          var t_code=seft.csm_decrypt(mn.trigger["filter"]);
                          filter_data=Function("obj",t_code);
                        }
                        dataSDtail=JSON.parse(JSON.stringify(dataSDtail.filter(filter_data)));
                        var idxF=dataSDtail.findIndex((obj) => {
                          return obj.id === row.data.id;
                        });
                        if(idxF!==-1)
                          dataSDtail[idxF]=row.data;
                        else
                          dataSDtail.push(row.data);
                        var idxF=dataSDtail.findIndex((obj) => {
                          return obj.id === row.data.id;
                        });
                        if(idxF!==-1)
                          oldRowData=JSON.parse(JSON.stringify(dataSDtail[idxF]));
                        var objRowData=row.data;
                        objRowData=Object.assign(objRowData,change.data);
                        if(objRowData["_id"])
                          delete objRowData["_id"];
                        if(change.type==='insert')
                        {
                          // console.log(e.component.option('editing.changes'),e.component.option('dataSource'));
                          // objRowData["id"]=seft.guid(seft.app_id);
                          objRowData=Object.assign(seft.defaultValRow[mn.id],objRowData);
                          var checkKeys=false,objKeys="return obj.id!==`"+objRowData["id"]+"`";
                          mn.table.filter(f=>1*f.f_pkid===1).forEach(function(field){
                            if(field.f_types.indexOf('num')!==-1||field.f_types.indexOf('price')!==-1||field.f_types.indexOf('ron')!==-1)
                              objKeys+=" && obj."+field.f_name.toLowerCase()+"==="+objRowData[field.f_name.toLowerCase()];
                            else
                              objKeys+=" && obj."+field.f_name.toLowerCase()+"===`"+objRowData[field.f_name.toLowerCase()]+"`";
                          });
                          if(objKeys.indexOf(' && ')!==-1)
                          {
                            checkKeys=dataSDtail.find(Function("obj",objKeys));
                            if(checkKeys)
                            {
                              canhbao("Trùng khóa chính vui lòng kiểm tra lại trước khi lưu");
                              e.cancel = true;
                              return false;
                            }
                          }
                          var idxF=dataSDtail.findIndex((obj) => {
                            return obj.id === objRowData.id;
                          });
                          if(idxF===-1)
                            dataSDtail.push(objRowData);
                        }
                        else if(change.type==='update')
                        {
                          var checkKeys=false,objKeys="return obj.id!==`"+objRowData["id"]+"`";
                          mn.table.filter(f=>1*f.f_pkid===1).forEach(function(field){
                            if(field.f_types.indexOf('num')!==-1||field.f_types.indexOf('price')!==-1||field.f_types.indexOf('ron')!==-1)
                              objKeys+=" && obj."+field.f_name.toLowerCase()+"==="+objRowData[field.f_name.toLowerCase()];
                            else
                              objKeys+=" && obj."+field.f_name.toLowerCase()+"===`"+objRowData[field.f_name.toLowerCase()]+"`";
                          });
                          if(objKeys.indexOf(' && ')!==-1)
                          {
                            checkKeys=dataSDtail.find(Function("obj",objKeys));
                            if(checkKeys)
                            {
                              canhbao("Trùng khóa chính vui lòng kiểm tra lại trước khi lưu");
                              e.cancel = true;
                              return false;
                            }
                          }
                          var idxF=dataSDtail.findIndex((obj) => {
                            return obj.id === objRowData.id;
                          });
                          if(idxF!==-1)
                            dataSDtail[idxF]=objRowData;
                        }
                        else if(change.type==='remove')
                        {
                          e.changes.forEach(function(objD){
                            var idxF=dataSDtail.findIndex((obj) => {
                              return obj.id === objD.key;
                            });
                            if(idxF!==-1)
                            {
                              dataSDtail.splice(idxF, 1);
                              e.component.getDataSource().store().remove(objD.key); 
                            } 
                            var idxFBC=seft.select_row[mn.table_name].findIndex((obj) => {
                              return obj.id === objD.key;
                            });
                            if(idxFBC!==-1)
                              seft.select_row[mn.table_name].splice(idxFBC, 1);
                          });
                          thongbao("Đã xóa xong "+e.changes.length+" dòng"); 
                        }
                        dataSDtail.forEach(function(ct){
                          var idxFBC=seft.select_row[mn.table_name].findIndex((obj) => {
                            return obj.id === ct.id;
                          });
                          if(idxFBC!==-1)
                            seft.select_row[mn.table_name][idxFBC]=ct;
                          else 
                            seft.select_row[mn.table_name].push(ct);
                        });
                        if(seft.m_configs.trigger["update"])
                          if(seft.m_configs.trigger["update"]!=='')
                          {
                            var dataRowM =JSON.parse(JSON.stringify(seft.select_row));
                            var t_code=seft.csm_decrypt(seft.m_configs.trigger["update"]);
                            var updateRowMaster=Function("seft", "data","bang",t_code);
                            seft.select_row=updateRowMaster(seft,dataRowM,seft.database);
                            if(seft.master_form)
                              seft.master_form.option('formData',JSON.parse(JSON.stringify(seft.select_row)));
                          }
                        if(seft.master_form)
                        {
                          seft.master_form.option('formData',JSON.parse(JSON.stringify(seft.select_row)));
                          var frmData=seft.master_form.option('formData');
                          var fIdxRow=seft.load_db.findIndex(r=>r.id===frmData.id);
                          if(fIdxRow!==-1)
                            seft.curent_grid.option("editing.changes", [{ type: 'update', data: frmData, key:frmData.id }]);
                          else
                            seft.curent_grid.option("editing.changes", [{ type: 'insert',index:0, data:frmData}]);
                          seft.select_row=frmData;
                        }
                        e.cancel = false;
                      }
                      else
                        e.cancel = true;
                    },
                    columns: [{
                      type: 'buttons',
                      width: 110,
                      fixed: true,
                      fixedPosition: "right",
                      buttons: [
                      {
                        name:'edit',
                        hint: 'Sửa',
                        template: function(data) {
                            return $("<a>").addClass("dx-link dx-link-icon fa fa-edit");
                        }
                      },
                      {
                        name:'delete',
                        hint: 'Xóa',
                        template: function(data) {
                            return $("<a>").addClass("dx-link dx-link-icon fa fa-trash text-red");
                        }
                      },
                      {
                        hint: 'Nhân bản',
                        template: function(data) {
                            return $("<a>").addClass("dx-link dx-link-icon fa fa-copy text-green");
                        },
                        visible(e) {
                          return !e.row.isEditing;
                        },
                        disabled(e) {
                          // return isChief(e.row.data.Position);
                        },
                        onClick(e) {
                          e.component.selectRows([{ id: e.row.data.id}], true);
                          seft.copyRow=e.row.data;
                          setTimeout(function(){
                            e.component.beginUpdate();
                            e.component.addRow();
                            e.component.endUpdate();
                          },5);
                        },
                      }],
                    }].concat(Details_Columns),
                    dataSource:dataSDtail,
                });
                seft.detail_grid[mn.id]=$item.dxDataGrid('instance');
                itemElement.append($item);
              }
            });
          });
        seft.load_db=seft.load_db.map(function(obj){
          var defVal=JSON.parse(JSON.stringify(seft.defaultValRow[seft.m_configs.id]));
          delete defVal['id'];
          var newVal=JSON.parse(JSON.stringify(obj));
          delete newVal['_id'];
          return Object.assign(defVal,newVal);
        });
        var dxDGridObj={
          dataSource:JSON.parse(JSON.stringify(seft.load_db.filter(seft.filter_data))),
          paging: {
            enabled:1*seft.m_configs.table_pagesize>0,
            pageSize: 1*seft.m_configs.table_pagesize===0?10:1*seft.m_configs.table_pagesize,
          },
          // scrolling: {
          //   rowRenderingMode: 'virtual',
          // },
          keyboardNavigation: {
            enterKeyAction: 'moveFocus',
            enterKeyDirection: 'row',
            editOnKeyPress: false,
          },
          pager: {
            visible: true,
            // allowedPageSizes: [5, 10, 'all'],
            showPageSizeSelector: true,
            showInfo: true,
            showNavigationButtons: true,
          },
          keyExpr: 'id',
          // keyExpr: seft.database[seft.L_table_name[0]].fieldsPK,
          Width:'100%',
          rowAlternationEnabled: true,
          showBorders: true,
          allowColumnResizing: true,
          columnResizingMode: 'widget',
          focusedRowEnabled: true,
          export: {
            enabled: true
          },
          columnChooser: {
            enabled: true,
            mode: "dragAndDrop" // or "select"
          },
          columnFixing: {
            enabled: true
          },
          editing: {
            mode: kieu_chinh,
            popup: {
              title: seft.ten_chuc_nang,
              showTitle: true
            },
            form:formEditing,
            allowAdding:((seft.menus_permissions[seft.m_configs.menu_id]&2)!==0||seft.permissions===-1) && !seft.m_configs.g_readonly,
            allowUpdating: ((seft.menus_permissions[seft.m_configs.menu_id]&4)!==0||seft.permissions===-1) && !seft.m_configs.g_readonly,
            allowDeleting: ((seft.menus_permissions[seft.m_configs.menu_id]&8)!==0||seft.permissions===-1) && !seft.m_configs.g_readonly,
            confirmDelete: true,
            useIcons: true,
          },
          selection: {
            mode: 'single',
            // mode: "multiple"
          },
          filterRow: {
            visible: true,
          },
          searchPanel: {
            visible: true,
            highlightCaseSensitive: true,
          },
          groupPanel: { visible: true },
          grouping: {
            autoExpandAll: false,
          },
          repaintChangesOnly: true,
          hoverStateEnabled: true,
          onCellPrepared: function(e) {
            // if(e.rowType === "data") {
            //    console.log(e.data);
            // }
          },
          onToolbarPreparing: function(e) {
            const toolbarItems = e.toolbarOptions.items;
            toolbarItems.forEach((item) => {
              if(item.name==="exportButton")
                item.options.icon='fa fa-file-excel-o'
            }); 
          },
          onExporting: function(e) { 
            var workbook = new ExcelJS.Workbook(); 
            var worksheet = workbook.addWorksheet('Main sheet'); 
            if(seft.m_configs["nodes"])
              seft.m_configs["nodes"].forEach(function(mn){
                if(seft.detail_grid['tbl_'+mn.id])
                {
                  var DetailSheet = workbook.addWorksheet(mn.table_name);
                  DetailSheet.columns = mn.table.filter(function(f){return 1*f.f_show===1;}).sort(function(a, b){return 1*a.f_stt-1*b.f_stt})
                    .map(function(Obj){
                    return {header:Obj.f_header,key:Obj.f_name.toLowerCase()};
                  });
                  DetailSheet.addRow({id: 1, name: 'John Doe', age: 35});
                }
              });
            DevExpress.excelExporter.exportDataGrid({ 
                worksheet: worksheet, 
                component: e.component,
                customizeCell: function(options) {
                    options.excelCell.font = { name: 'Arial', size: 12 };
                    options.excelCell.alignment = { horizontal: 'left' };
                } 
            }).then(function() {
                workbook.xlsx.writeBuffer().then(function(buffer) { 
                    saveAs(new Blob([buffer], { type: 'application/octet-stream' }), 'DataGrid.xlsx'); 
                }); 
            }); 
          },
          onSelectionChanged(e) {
            const data = e.selectedRowsData[0];
            if (data) {
              setTimeout(function() {
                var dataItem =seft.load_db.find(it=>it.id===data.id);
                if(dataItem)
                  seft.select_row=JSON.parse(JSON.stringify(dataItem));
                else
                  seft.select_row={};
                if(seft.m_configs["nodes"])
                  seft.m_configs["nodes"].forEach(function(mn){
                    if(seft.detail_grid['tbl_'+mn.id])
                    {
                      var dataSDtail=[];
                      if(seft.select_row[mn.table_name])
                        dataSDtail=seft.select_row[mn.table_name];
                      var filter_data=function(obj){return true;};
                      if(mn.trigger["filter"])
                      {
                        var t_code=seft.csm_decrypt(mn.trigger["filter"]);
                        filter_data=Function("obj",t_code);
                      }
                      dataSDtail=JSON.parse(JSON.stringify(dataSDtail.filter(filter_data)));
                      seft.detail_grid['tbl_'+mn.id].option('dataSource',JSON.parse(JSON.stringify(dataSDtail)));
                    }
                  });
              },50);
            }
          },
          onContentReady: function(e){  
            if (!e.component.getSelectedRowKeys().length) { 
              e.component.selectRowsByIndexes(-1);  
              setTimeout(function(){ 
                
                var kkeys = e.component.getSelectedRowKeys();
                if(kkeys.length>0)
                  e.component.selectRows([{ id: kkeys[0]}], true);
              },300);
            }
            $(".dx-datagrid-table").addClass("table");
            if(seft.m_configs.trigger["report_db"] && seft.m_configs["report_name"])
            { 
              if(seft.m_configs.trigger["report_db"]!=='' && seft.m_configs["report_name"]!=='')
              {
                var $cBPrint = $('<div id="cBPrint">').dxButton({
                  icon: 'print', //or your custom icon
                  onClick: function(){seft.callRowPrint(false)}
                });
                if (e.element.find('#cBPrint').length == 0)
                  e.element
                  .find('.dx-toolbar-after')
                  .prepend($cBPrint);
              }
            }
            if(!seft.m_configs.g_readonly && ((seft.menus_permissions[seft.m_configs.menu_id]&64)!==0||seft.permissions===-1))
            {
              var $cBImport = $('<div id="cBImport">').dxButton({
                icon: 'fas fa-file-import', //or your custom icon
                onClick: seft.importExcel
              });
              if (e.element.find('#cBImport').length == 0)
                e.element
                .find('.dx-toolbar-after')
                .prepend($cBImport);
            }
          }, 
          onKeyDown(e) {
            if(seft.m_configs.g_readonly)
            {
              e.event.preventDefault();
              return;
            }
            if (e.event.ctrlKey && e.event.key === "s") {
              var fCi=e.component.option("focusedColumnIndex");
              var fRi=e.component.option("focusedRowIndex");
              var elCell=e.component.getCellElement(fRi, fCi);
              if(elCell)
                seft.fireKeyTab(elCell.get(0));
              e.component.saveEditData();
              e.event.preventDefault();
            }
            else if(e.event.key === "F4" && (seft.menus_permissions[seft.m_configs.menu_id]&2)!==0)
            {
              e.component.saveEditData();  
              e.component.addRow();
              e.event.preventDefault();
            }
            else if(e.event.key === "F3" && (seft.menus_permissions[seft.m_configs.menu_id]&4)!==0)
            {
              var kkeys = e.component.getSelectedRowKeys();
              if(kkeys.length>0)
              {
                var rIndex = e.component.getRowIndexByKey(kkeys[0]);
                e.component.editRow(rIndex);
              }
              else
                canhbao("Vui lòng chọn dòng cần sửa");
              e.event.preventDefault();
            }
            else if(e.event.key === "F8" && (seft.menus_permissions[seft.m_configs.menu_id]&8)!==0)
            {
              var kkeys = e.component.getSelectedRowKeys();
              if(kkeys.length>0)
              {
                var rIndex = e.component.getRowIndexByKey(kkeys[0]);
                e.component.deleteRow(rIndex);
              }
              else
                canhbao("Vui lòng chọn dòng cần xóa");
              e.event.preventDefault();
            }
          },
          onFocusedRowChanged(e) {
            setTimeout(function(){
              if(document.querySelector("tr.dx-row-focused"))
                document.querySelector("tr.dx-row-focused").click();
            },10);
            // var fRi=e.component.option("focusedRowIndex");
            // e.component.getCellElement(fRi, 0).click();
          },
          onCellHoverChanged(e){  
            if(e["column"] && e["isAltRow"] && e["rowType"]==="data" && e["eventType"]==="mouseout")
              e.component.selectRows([{ id: e.data.id}], true);
          },
          onEditorPreparing: function (e) {
            // console.log(e.name);
            // if(e.name)
            // if(Obj.f_types.indexOf('date')!==-1||Obj.f_types.indexOf('time')!==-1)
            // if (e.dataField && e.parentType === "dataRow") {
            //   if(e.component.getVisibleRows().length>0)
            //   {
            //     if(seft.m_configs.trigger["update"])
            //       if(seft.m_configs.trigger["update"]!=='')
            //       {
            //         var dataRowM =JSON.parse(JSON.stringify(e.row.data));
            //         var t_code=seft.csm_decrypt(seft.m_configs.trigger["update"]);
            //         var updateRowMaster=Function("seft", "data","bang",t_code);
            //         var newData=updateRowMaster(seft,dataRowM,seft.database);
            //         if(newData)
            //           e.row.data=Object.assign(e.row.data,newData);
            //         if(seft.master_form)
            //           seft.master_form.option('formData',newData);
            //       }
            //   }
            // }
          },
          onOptionChanged(e) {
            if (e.name === 'editing') {
              const editRowKey = e.component.option('editing.editRowKey');
              let changes = e.component.option('editing.changes');
              var rows = e.component.getVisibleRows();  
              var rowIndex = e.component.getRowIndexByKey(editRowKey);  
              if(rowIndex!==-1)
              {
                var row = rows[rowIndex];
                row.data=Object.assign(seft.defaultValRow[seft.m_configs.id],row.data);
                if(seft.select_row)
                {
                  if(changes.length>0)
                    Object.keys(changes[0].data).forEach(function(c){
                      if(c!=="_id")
                        seft.select_row[c]=changes[0].data[c];
                    });
                  row.data=Object.assign(JSON.parse(JSON.stringify(row.data)),seft.select_row);
                } 
                if(seft.m_configs.trigger["update"])
                  if(seft.m_configs.trigger["update"]!=='')
                  {
                    var dataRowM =JSON.parse(JSON.stringify(row.data));
                    var t_code=seft.csm_decrypt(seft.m_configs.trigger["update"]);
                    // console.log(seft.m_configs,t_code);
                    var updateRowMaster=Function("seft", "data","bang",t_code);
                    dataRowM=updateRowMaster(seft,dataRowM,seft.database);
                    Object.keys(dataRowM).forEach(function(c){
                      row.data[c]=dataRowM[c];
                    });
                    // if(seft.m_configs["nodes"])
                    //   seft.m_configs["nodes"].forEach(function(mn){
                    //     if(seft.detail_grid[mn.id])
                    //     {
                    //       const editRowKey = seft.detail_grid[mn.id].option('editing.editRowKey');
                    //       var dataDetail=row.data[mn.table_name];
                    //       if(seft.detail_grid[mn.id].getController("editing").isEditing())
                    //         dataDetail=dataDetail.filter(d=>d.id!==editRowKey);
                    //       if(seft.detail_grid['tbl_'+mn.id])
                    //         seft.detail_grid['tbl_'+mn.id].option('dataSource',dataDetail);
                    //       if(seft.detail_grid[mn.id])
                    //         seft.detail_grid[mn.id].option('dataSource',dataDetail);
                    //     }
                    //   });
                    // seft.m_configs.nodes.forEach(function(mn){
                    //   // console.log(mn.table_name,dataRowM[mn.table_name]);
                    //   if(seft.detail_grid[mn.id])
                    //     seft.detail_grid[mn.id].option('dataSource',dataRowM[mn.table_name]||[]);
                    // });
                  }
                var checkCT=seft.tableFields.filter(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'||fe.f_name.toLowerCase()==='so_ct';});
                if(checkCT.length===2)
                {
                  var t_ngay=seft.tableFields.find(function(fe){return fe.f_name.toLowerCase()==='ngay_ct'});
                  var kieungay='dd/mm/yyyy',dd_kieungay='yymmdd';
                  if(t_ngay)
                    if(t_ngay.f_types.indexOf('datetime')!==-1)
                    { 
                      kieungay='dd/mm/yyyy HH:MM:ss';
                      dd_kieungay='yymmddHHMMss';
                    }
                  if(!row.data["so_ct"])
                    row.data["so_ct"]="";
                  if(row["ngay_ct"]==='')
                    row.data["ngay_ct"]=dateFormat(new Date(),kieungay);
                  if(!row.data["so_ct"].startsWith((seft.m_configs["prefix_pk"]?seft.m_configs["prefix_pk"]:"")+dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay)))
                  {
                    var fHD=seft.load_db.filter(dh=>dh.id!==editRowKey && dateFormat(chuyenNgay(dh["ngay_ct"],kieungay),dd_kieungay)===dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay));
                    row.data["so_ct"]=(seft.m_configs["prefix_pk"]?seft.m_configs["prefix_pk"]:"")+dateFormat(chuyenNgay(row.data["ngay_ct"],kieungay),dd_kieungay)+(fHD.length+1).toString().padStart(2,"0");
                  }
                }
                if(seft.master_form)
                  seft.master_form.option('formData',row.data);
                else
                {
                  Object.keys(row.data).forEach(function(c){
                    var cellValue = e.component.cellValue(rowIndex, c);
                    if(e.component.getCellElement(rowIndex, c))
                    {
                      var cfCol=seft.m_configs.table.find(f=>f.f_name.toLowerCase()===c.toLowerCase());
                      var changeCol=true;
                      if(cfCol)
                      {
                        if(cfCol.f_types==="img")
                        {
                          var timCTRL=e.component.getCellElement(rowIndex, c).find('img');
                          if(timCTRL)
                            e.component.getCellElement(rowIndex, c).find('img').attr("src",row.data[c]);
                        }
                        else if(cfCol.f_types==="file")
                        {
                          var timCTRL=e.component.getCellElement(rowIndex, c).find('a');
                          if(timCTRL)
                            e.component.getCellElement(rowIndex, c).find('a').attr("href",row.data[c]);
                        }
                        changeCol=false;
                      }
                      if(e.component.getCellElement(rowIndex, c).find('input').val()!==row.data[c] && changeCol)
                        e.component.getCellElement(rowIndex, c).find('input').val(row.data[c]);
                    }
                  });
                }
              }
            }
            else if(e.fullName === "searchPanel.text") { 
              // alert(e.value)
              // start time  
            }  
          },
          onEditingStart() {
            setTimeout(function(){
             seft.EnterToTab();
            },500);
              // alert('EditingStart');
          },
          onInitNewRow(info) {
            if(seft.copyRow)
            {
              info.data=Object.assign(info.data,seft.copyRow);
              seft.copyRow=false;
            }
            info.data["id"]=seft.guid(seft.app_id);
            if(seft.m_configs["nodes"])
              seft.m_configs["nodes"].forEach(function(mn){
                info.data[mn.table_name]=[];
              });
            seft.select_row=JSON.parse(JSON.stringify(info.data));
            setTimeout(function(){
              info.component.navigateToRow(info.data.id);
              info.component.selectRows([{ id: info.data.id}], true);
             seft.EnterToTab();
            },500);
          },
          onRowInserting() {
              // alert('RowInserting');
          },
          onRowInserted() {
              // alert('RowInserted');
          },
          onRowUpdating(e) {
          },
          onRowUpdated() {
              // alert('RowUpdated');
          },
          onRowRemoving() {
              // alert('RowRemoving');
          },
          onRowRemoved() {
              // alert('RowRemoved');
          },
          onSaved() {
              // alert('Saved');
            seft.loadData(seft.m_configs.id,true);
            seft.m_configs["nodes"].forEach(function(mn) {
              seft.loadData(mn.id);
            });
          },
          onEditCanceling(e) {
            seft.loadData(seft.m_configs.id,true);
            var dataItem =seft.load_db.find(it=>it.id===seft.select_row.id);
            if(dataItem)
              seft.select_row=JSON.parse(JSON.stringify(dataItem));
            else
              seft.select_row={};
            e.component.selectRowsByIndexes(-1);  
            setTimeout(function(){
              var rowIndex = e.component.getRowIndexByKey(seft.select_row.id);  
              e.component.selectRowsByIndexes(rowIndex);
            },300);
            // if(seft.m_configs["nodes"])
            //   seft.m_configs["nodes"].forEach(function(mn){
            //     if(seft.detail_grid['tbl_'+mn.id])
            //     {
            //       var dataSDtail=[];
            //       if(seft.select_row[mn.table_name])
            //         dataSDtail=seft.select_row[mn.table_name];
            //       seft.loadData(mn.id);
            //       console.log(dataSDtail);
            //       seft.detail_grid['tbl_'+mn.id].option('dataSource',JSON.parse(JSON.stringify(dataSDtail)));
            //     }
            //   });
            // console.log(seft.select_row,seft.load_db);
//             var fIdxRow=seft.load_db.findIndex(r=>r.id===seft.select_row.id);
//             if(fIdxRow!==-1)
//             {
//               seft.select_row=JSON.parse(JSON.stringify(seft.load_db[fIdxRow]));
//               if(seft.m_configs["nodes"])
//                 seft.m_configs["nodes"].forEach(function(mn){
                  
//                   console.log(seft.detail_grid['tbl_'+mn.id].option('dataSource'))
//                   if(seft.detail_grid['tbl_'+mn.id])
//                     seft.detail_grid['tbl_'+mn.id].option('dataSource',JSON.parse(JSON.stringify(seft.select_row[mn.table_name]||[])));
//                 });
//             }
            // if(seft.m_configs.id)
            //     seft.loadData(seft.m_configs.id);
          },
          onEditCanceled() {
              // alert('EditCanceled');
          },
          onSaving(e) {
            const change = e.changes[0];
            if (change) {
              var rows =e.component.getVisibleRows(); 
              var rowIndex = e.component.getRowIndexByKey(change.key);  
              var row = change;
              if(rowIndex!==-1)
                row =rows[rowIndex]; 
              var oldRowData={};
              var idxF=seft.load_db.findIndex((obj) => {
                return obj.id === row.data.id;
              });
              if(idxF!==-1)
                oldRowData=JSON.parse(JSON.stringify(seft.load_db[idxF]));
              var objRowData=row.data;
              objRowData=Object.assign(objRowData,change.data);
              if(objRowData["_id"])
                delete objRowData["_id"];
              seft.m_configs.nodes.forEach(function(mn){
                if(seft.filesUploader[mn.id])
                  Object.keys(seft.filesUploader[mn.id]).forEach(function(objImgKey){
                    var objI=seft.filesUploader[mn.id][objImgKey];
                    if(objI["name"])
                    {
                      fetch('/upload.shtml', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(objI)
                      })
                      .then(function(res){ return res.text(); })
                      .then(data => {
                        // console.log(data,seft.filesUploader[mn.id],objImgKey);
                        if(!seft.select_row[mn.table_name])
                          seft.select_row[mn.table_name]=[];
                        var idxDong=seft.select_row[mn.table_name].findIndex(d=>d.id===objI.id);
                        if(idxDong!==-1)
                          seft.select_row[mn.table_name][idxDong][objI.f_name]=data;
                        delete seft.filesUploader[mn.id][objImgKey];
                      })
                      .catch(error => {
                      // enter your logic for when there is an error (ex. error toast)
                       // console.log(error)
                      });  
                    }
                  });
                // if(seft.detail_grid[mn.id])
                //   console.log(seft.detail_grid[mn.id].getDataSource().items())
                objRowData[mn.table_name]=seft.select_row[mn.table_name]||[];
              });
              if(seft.filesUploader[seft.m_configs.id])
                Object.keys(seft.filesUploader[seft.m_configs.id]).forEach(function(objImgKey){
                  var objI=seft.filesUploader[seft.m_configs.id][objImgKey];
                  objRowData[objImgKey]='/app_images/'+objI.app_id+'/'+seft.doi_ten_hinh(objI["name"]);
                  if(objI["name"])
                  {
                    fetch('/upload.shtml', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(objI)
                    })
                    .then(function(res){ return res.text(); })
                    .then(data => {
                      var objI=seft.filesUploader[seft.m_configs.id][objImgKey];
                      objRowData[objI.f_name]=data;
                      delete seft.filesUploader[seft.m_configs.id][objImgKey];
                     // enter you logic when the fetch is successful
                      // console.log(data)
                    })
                    .catch(error => {
                    // enter your logic for when there is an error (ex. error toast)
                     // console.log(error)
                    });  
                  }
                });
              if(change.type==='insert')
              {
                var e_where_lunence={
                  operator: 'AND',
                  conditions: []
                };
                objRowData=Object.assign(seft.defaultValRow[seft.m_configs.id],objRowData);
                var checkKeys=false,objKeys="return obj.id!==`"+objRowData["id"]+"`";
                seft.database[seft.L_table_name[0]].fieldsPK.forEach(function(objPK){
                  e_where_lunence.conditions.push({ field: objPK.trim(), type: 'eq', value: objRowData[objPK]});
                  var field=seft.m_configs.table.find(f=>f.f_name.toLowerCase()===objPK.toLowerCase());
                  if(field.f_types.indexOf('num')!==-1||field.f_types.indexOf('price')!==-1||field.f_types.indexOf('ron')!==-1)
                    objKeys+=" && obj."+objPK+"==="+objRowData[objPK];
                  else
                    objKeys+=" && obj."+objPK+"===`"+objRowData[objPK]+"`";
                });
                if(objKeys.indexOf(' && ')!==-1)
                {
                  var fnCheck=Function("obj",objKeys);
                  checkKeys=seft.load_db.find(obj=>fnCheck(obj));
                  if(checkKeys)
                  {
                    canhbao("Trùng khóa chính vui lòng kiểm tra lại trước khi lưu");
                    e.cancel = true;
                    return false;
                  }
                }
                seft.csm_obj_updates({app_id:seft.database[seft.L_table_name[0]].app_id,obj_name:seft.L_table_name[0],command:"create",obj_update:objRowData,e_where:e_where_lunence},function(msg){
                  if(msg.success)
                  {
                    thongbao("Đã thêm xong");
                    e.component.selectRowsByIndexes(-1);  
                    setTimeout(function(){
                      var rowIndex = e.component.getRowIndexByKey(objRowData["id"]);  
                      e.component.selectRowsByIndexes(rowIndex);
                    },300);
                    seft.select_row=false;
                    var dataP=[];
                    dataP.push(objRowData);
                    seft.callRowPrint(dataP);
                  }
                });
              }
              else if(change.type==='update')
              {
                var checkKeys=false,objKeys="return obj.id!==`"+objRowData["id"]+"`";
                var e_where_lunence={
                  operator: 'AND',
                  conditions: []
                };
                if(objRowData["id"]!==undefined && objRowData["id"]!==null && (objRowData["id"]+"").trim()!=='')
                  e_where_lunence.conditions.push({ field: 'id', type: 'eq', value: objRowData["id"]});
                seft.database[seft.L_table_name[0]].fieldsPK.forEach(function(objPK){
                  if(e_where_lunence.conditions.length===0)
                    e_where_lunence.conditions.push({ field: objPK.trim(), type: 'eq', value: oldRowData[objPK]});
                  var field=seft.m_configs.table.find(f=>f.f_name.toLowerCase()===objPK.toLowerCase());
                  if(field.f_types.indexOf('num')!==-1||field.f_types.indexOf('price')!==-1||field.f_types.indexOf('ron')!==-1)
                    objKeys+=" && obj."+objPK+"==="+oldRowData[objPK];
                  else
                    objKeys+=" && obj."+objPK+"===`"+oldRowData[objPK]+"`";
                });
                if(objKeys.indexOf(' && ')!==-1)
                {
                  var fnCheck=Function("obj",objKeys);
                  checkKeys=seft.load_db.find(obj=>fnCheck(obj));
                  if(checkKeys)
                  {
                    canhbao("Trùng khóa chính vui lòng kiểm tra lại trước khi lưu");
                    e.cancel = true;
                    return false;
                  }
                }
                
                seft.csm_obj_updates({app_id:seft.database[seft.L_table_name[0]].app_id,obj_name:seft.L_table_name[0],command:"update",obj_update:objRowData,e_where:e_where_lunence},function(msg){
                  if(msg.success)
                  {
                    thongbao("Đã cập nhật xong");
                    e.component.selectRowsByIndexes(-1);  
                    setTimeout(function(){
                      var rowIndex = e.component.getRowIndexByKey(objRowData["id"]);  
                      e.component.selectRowsByIndexes(rowIndex);
                    },300);
                    // seft.m_configs.nodes.forEach(function(mn){
                    //   if(seft.detail_grid['tbl_'+mn.id])
                    //   {
                    //     objRowData[mn.table_name]=seft.select_row[mn.table_name]||[];
                    //     seft.detail_grid['tbl_'+mn.id].option('dataSource',JSON.parse(JSON.stringify(objRowData[mn.table_name])));
                    //   } 
                    // });
                  }
                });
              }
              else if(change.type==='remove')
              {
                var rows = e.component.getVisibleRows(); 
                e.changes.forEach(function(rKey)
                {
                  var rowIndex = e.component.getRowIndexByKey(rKey.key);  
                  if(rowIndex!==-1)
                  {
                    var row = rows[rowIndex];
                    var dlRow=row.data;
                    var e_where_lunenceRM={
                      operator: 'AND',
                      conditions: []
                    };
                    if(dlRow["id"]!==undefined && dlRow["id"]!==null && (dlRow["id"]+"").trim()!=='')
                      e_where_lunenceRM.conditions.push({ field: 'id', type: 'eq', value: dlRow["id"]});
                    seft.database[seft.L_table_name[0]].fieldsPK.forEach(function(objPK){
                      if(e_where_lunenceRM.conditions.length===0)
                        e_where_lunenceRM.conditions.push({ field: objPK.trim(), type: 'eq', value: dlRow[objPK]});
                    });
                    console.log(dlRow,e_where_lunenceRM);
                    seft.csm_obj_updates({app_id:seft.database[seft.L_table_name[0]].app_id,obj_name:seft.L_table_name[0],obj_update:dlRow,command:"delete",e_where:e_where_lunenceRM},function(msg){
                      if(msg.success)
                      {
                        thongbao("Đã xóa xong "+e.changes.length+" dòng");
                        seft.select_row=false;
                        if(e.component.getDataSource().items().length>0) 
                          e.component.selectRowsByIndexes(0);
                        else
                          seft.m_configs.nodes.forEach(function(mn){
                            if(seft.detail_grid['tbl_'+mn.id])
                              seft.detail_grid['tbl_'+mn.id].option('dataSource',[]);
                          });
                      } 
                    });
                  }
                });
              }
              e.cancel = false;
            }
            else
              e.cancel = true;
          },
          columns:seft.colsGrid
      };
      if(seft.m_configs.trigger["datarowtemplate"])
        if(seft.m_configs.trigger["datarowtemplate"]!=='')
        {
          // console.log(seft.m_configs.trigger);
          var t_row_code=seft.csm_decrypt(seft.m_configs.trigger["datarowtemplate"]);
          var fn_row_code=Function("container", "item",t_row_code);
          dxDGridObj=Object.assign(dxDGridObj,{
            dataRowTemplate: fn_row_code
          });
        }
      $("#"+seft.m_id).dxDataGrid(dxDGridObj);
      window.onresize = function () {  
        seft.UpdateHeight();  
      };  
      seft.curent_grid=$("#"+seft.m_id).dxDataGrid('instance');
      var checkDetails=seft.m_configs["nodes"]?seft.m_configs.nodes.length>0:false;
      if(checkDetails)
      {
        $("#detailtabs_"+seft.m_id).dxTabPanel({
          animationEnabled: false,
          scrollingEnabled: true,
          scrollByContent: true,
          showNavButtons: true,
          swipeEnabled: false,
          deferRendering: true,
          repaintChangesOnly: true,
          noDataText: "",
          width: '100%',
          items: seft.m_configs.nodes,
          onSelectionChanged(e) {
            if(e.addedItems.length>0)
            {
              var idTab=e.addedItems[0].id;
              var table_name=e.addedItems[0].table_name;
              var trigger=e.addedItems[0].trigger;
              if(seft.detail_grid['tbl_'+idTab])
              {
                var dataSDtail=JSON.parse(JSON.stringify(seft.select_row[table_name]||[]));
                var filter_data=function(obj){return true;};
                if(trigger["filter"])
                {
                  var t_code=seft.csm_decrypt(trigger["filter"]);
                  filter_data=Function("obj",t_code);
                }
                dataSDtail=JSON.parse(JSON.stringify(dataSDtail.filter(filter_data)));
                seft.detail_grid['tbl_'+idTab].option('dataSource',dataSDtail);
              }
            }
          },
          itemTitleTemplate: function (itemData, itemIndex, itemElement) {
            itemElement.append("<span class='dx-tab-text' id='"+itemData.id+"'>" + seft.getNameMenu(itemData.label) + "</span>");
          },
          itemTemplate: function (mn, index, element) {
            seft.defaultValRow[mn.id]={};
            var Details_Columns=mn.table.filter(function(f){
              if(1*f.f_show===1 && f.f_name.toLowerCase()!=='id' && f.f_name.toLowerCase()!=='parent_id')
              {
                // console.log(mn.id,f.f_name)
                if(f.f_types.indexOf('co')!==-1)
                  seft.getOptionsSelect(f.f_cbo_query,mn.id,f.f_name);
                return true; 
              }
              else
                return false;
            }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(Obj){
              var defCol=Obj;
              if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
                seft.defaultValRow[mn.id][Obj.f_name]=0;
              else
                seft.defaultValRow[mn.id][Obj.f_name]='';
              Obj=Object.assign(Obj,{dataField:Obj.f_name,showWhenGrouped:Obj.f_group_index?true:false,groupIndex:Obj.f_group_index?Obj.f_group_index:-1,fixed: Obj.f_fixcol,caption:Obj.f_header,width:1*Obj.f_width,cssClass:Obj.f_types});
            if(Obj.f_sort!=='')
              Obj=Object.assign(Obj,{sortOrder:Obj.f_sort});
            if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
              Obj=Object.assign(Obj,{dataType: 'number',alignment: 'right',format:"#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""),editorOptions: {format: "#,##0"+(1*Obj.f_dec>0?".".padEnd(1*Obj.f_dec,"0"):""),showClearButton: true}});
            else if(Obj.f_types.indexOf('datetime')!==-1)
              {
                Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) {  
                  const $ctrlE=$("<div />").dxDateBox({
                    useMaskBehavior: true,
                    type: 'datetime',
                    width: 1*Obj.f_width,
                    elementAttr: {class: "datetime"},
                    displayFormat: 'dd/MM/yyyy HH:mm:ss',
                    onValueChanged: function (e) {
                      if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"))
                      {
                        cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy HH:MM:ss");
                        cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"));
                      }
                    },
                    value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value.padEnd(19," "+dateFormat(new Date(),"HH:MM:ss")),"dd/mm/yyyy HH:MM:ss"):cellInfo.value)
                  }).appendTo(cellElement);
                },dataType: "datetime",format: "dd/MM/yyyy HH:mm:ss",editorOptions:{type: "date",format:"dd/MM/yyyy HH:mm:ss"}});
              }
              else if(Obj.f_types.indexOf('date')!==-1)
              {
                Obj=Object.assign(Obj,{editCellTemplate: function (cellElement, cellInfo) { 
                  const $ctrlE=$("<div />").dxDateBox({
                    useMaskBehavior: true,
                    type: 'date',
                    width: 1*Obj.f_width,
                    elementAttr: {class: "date"},
                    displayFormat: 'dd/MM/yyyy',
                    onValueChanged: function (e) {
                      if(cellInfo.data[cellInfo.column.dataField]!==dateFormat(e.value,"dd/mm/yyyy") && e.value)
                      {
                        cellInfo.data[cellInfo.column.dataField]=dateFormat(e.value,"dd/mm/yyyy");
                        cellInfo.setValue(dateFormat(e.value,"dd/mm/yyyy"));
                      }
                    },
                    value: (typeof cellInfo.value ==='string' && cellInfo.value?chuyenNgay(cellInfo.value,"dd/mm/yyyy"):cellInfo.value)
                  }).appendTo(cellElement);
                },dataType: "date",format: "dd/MM/yyyy",editorOptions:{type: "date",format:"dd/MM/yyyy"}});
              }
              else if(Obj.f_types.indexOf('time')!==-1)
              {
                Obj = Object.assign(Obj, {
                  editCellTemplate: function (cellElement, cellInfo) {
                    // Tạo một thẻ input với type time
                    const $ctrlE = $("<input />").attr({
                      type: 'time',
                      class: 'time',
                      value:cellInfo.value 
                    });

                    // Đặt sự kiện thay đổi giá trị
                    $ctrlE.on('input', function (e) {
                      const newValue = e.target.value;
                      if (cellInfo.data[cellInfo.column.dataField] !== newValue) {
                        cellInfo.data[cellInfo.column.dataField] = newValue;
                        cellInfo.setValue(newValue);
                      }
                    });

                    // Đảm bảo editor_controls tồn tại
                    if (!seft.editors_controls[tree_id]) {
                      seft.editors_controls[tree_id] = {};
                    }
                    seft.editors_controls[tree_id][Obj.f_name] = $ctrlE;

                    // Thêm input vào cellElement
                    $ctrlE.appendTo(cellElement);
                  },
                  dataType: "time",
                  editorType: "time",
                  format: "HH:mm:ss",
                  editorOptions: {
                    type: "time",
                    format: "HH:mm:ss"
                  }
                });
              }
              else if(Obj.f_types==='edt')
              {
                Obj=Object.assign(Obj,{
                  formItem: {
                    colSpan: 2,
                    editorOptions: {
                      height: 800,
                    },
                  },
                  visible:false,
                  editCellTemplate: function (itemElement, cellInfo) {  
                    // alert(decodeURI(cellInfo.value))
                      ($("<textarea>", { "id": "ckpeditor_"+Obj.f_name,height:800, "val": seft.csm_decrypt(cellInfo.value||'') })).appendTo(itemElement);  
                    // var div =($("<textarea>", { "id": "ckpeditor_"+Obj.f_name, "val": cellInfo.value }));    
                    // itemElement.append(div);
                    $("<script>").append(CKEDITOR.replace("ckpeditor_"+Obj.f_name,{height: 800})).appendTo(itemElement);  
                    $("<script>").append(CKEDITOR.instances["ckpeditor_"+Obj.f_name].on("change", function () {
                      cellInfo.setValue(seft.csm_encrypt(CKEDITOR.instances["ckpeditor_"+Obj.f_name].getData()));
                      // cellInfo.component.updateDimensions();
                    })).appendTo(itemElement); 
                  },
                });
              }
              else if(Obj.f_types==='img'||Obj.f_types==='file')
              {
                Obj=Object.assign(Obj,{
                  allowFiltering: false,
                  allowSorting: false,
                  cellTemplate: function(container, options) {
                    let imgElement = document.createElement("img");
                    if(Obj.f_types==='file')
                    {
                      imgElement= document.createElement('a');
                      if(options.value)
                      {
                        var fileName = options.value.split('/').pop();
                        imgElement.target="_blank";
                        imgElement.download = fileName;
                        imgElement.textContent = 'Download '+fileName;
                        imgElement.name = fileName;
                      }
                      imgElement.href = options.value;
                    }
                    else
                    {
                      imgElement.setAttribute('height','18px');
                      imgElement.setAttribute('src',options.value);
                    }
                    container.append(imgElement);
                  }
                });
              }
              else if(Obj.f_types.indexOf('co')!==-1)
              {
                if(Obj["f_grid"] && Obj["f_grid_fields"])
                {
                  var colGrid=false;
                  var mnuColGrid=seft.menus.find(m=>m.id===Obj["f_grid"]);
                  if(mnuColGrid)
                    colGrid=mnuColGrid.table.filter(f=>Obj["f_grid_fields"].find(fc=>fc===f.f_name));
                  if(colGrid)
                  {
                    var filter_data=function(obj){return true;};
                    if(mnuColGrid.trigger["filter"])
                    {
                      var t_code=seft.csm_decrypt(mnuColGrid.trigger["filter"]);
                      filter_data=Function("obj",t_code);
                    }
                    var g_load_db=[];
                    if(mnuColGrid.trigger["load_db"])
                    {
                      var t_code=seft.csm_decrypt(mnuColGrid.trigger["load_db"]);
                      var fn_load_db=Function("seft","db","mtdata",t_code);
                      g_load_db=fn_load_db(seft,seft.database,seft.editors_controls[seft.m_configs.id]);
                    }
                    else
                      g_load_db=seft.database[mnuColGrid.table_name].rows;
                    colGrid=colGrid.filter(function(f){
                      if(f.f_types.indexOf('co')!==-1)
                        seft.getOptionsSelect(f.f_cbo_query,mnuColGrid.id,f.f_name);
                      return true; 
                    }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(f){
                      var ObjC={dataField:f.f_name,caption:f.f_header,width:1*f.f_width,cssClass:f.f_types};
                      if(f.f_types.indexOf('co')!==-1)
                        ObjC=Object.assign(ObjC,{
                          editorOptions: {
                            searchEnabled: true,
                            showClearButton: true
                          },
                          lookup: {
                              searchEnabled: true,
                              showClearButton: true,
                              dataSource: function (options) { 
                                  return {  
                                      store: {
                                        type: 'array',  
                                        data:seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["options"],  
                                        key: "ma", 
                                      },  
                                      filter:function (item) { 
                                        if(options.data && seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name].hasOwnProperty('where'))
                                          if(seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"]!=="")
                                          {
                                            var str=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["where"];
                                            if(options.data.length>0)
                                            {
                                              var fields=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["fields"];
                                              var dataRow=options.data;
                                              var dataOps=seft.optionsSelect[mnuColGrid.id+"_^_"+f.f_name]["data"];
                                              // alert(str+"=>"+JSON.stringify(dataOps))
                                              var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                              var fData=dataOps.filter(function(o){
                                                return fnFilter(dataRow,o);
                                              }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                              // alert(fields[0]+":"+fields[1]+"="+dataOps.length+"=>"+fData.length);
                                              var fData=fData.find(o=>o.ma===item.ma);
                                              if(fData)
                                                return true;
                                              else
                                                return false; 
                                            }
                                            else
                                            {
                                              var fnFilter=Function("bang",'data',str);
                                              fnFilter(seft.database,item);
                                            }
                                          }
                                        return true;
                                      } 
                                  }  
                              },
                              displayExpr: 'ten',
                              valueExpr: 'ma',
                          }
                        });
                      return ObjC;
                    });
                    // console.log(seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["options"],Obj["f_grid_fields"],g_load_db.filter(filter_data));
                    Obj=Object.assign(Obj,{
                      editorOptions: {
                        disabled: Obj.f_types.indexOf('ro')!==-1,
                        searchEnabled: true,
                        showClearButton: true
                      },
                      lookup: {
                        searchEnabled: true,
                        dataSource:g_load_db.filter(filter_data),
                        valueExpr: 'id',
                        displayExpr(item) {
                          if(item)
                          {
                            var ten=item[Obj["f_grid_fields"][1]];
                            var ma=item[Obj["f_grid_fields"][0]];
                            return item && `${ma} <${ten}>`;
                          }
                          return '';
                        },
                      }
                    });
                  }
                }
                else
                  Obj=Object.assign(Obj,{
                    editorOptions: {
                      disabled: Obj.f_types.indexOf('ro')!==-1,
                      searchEnabled: true,
                      showClearButton: true
                    },
                    lookup: {
                        searchEnabled: true,
                        showClearButton: true,
                        dataSource: function (options) {  
                            return {  
                                store: {
                                  type: 'array',  
                                  data:seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["options"],  
                                  key: "ma", 
                                },  
                                filter:function (item) { 
                                  if(options.data && seft.optionsSelect[mn.id+"_^_"+Obj.f_name].hasOwnProperty('where'))
                                    if(seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["where"]!=="")
                                    {
                                      var str=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["where"];
                                      if(options.data.length>0)
                                      {
                                        var fields=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["fields"];
                                        var dataRow=options.data;
                                        var dataOps=seft.optionsSelect[mn.id+"_^_"+Obj.f_name]["data"];
                                        // alert(str+"=>"+JSON.stringify(dataOps))
                                        var fnFilter=Function("objR",'obj',(str.indexOf("return ")===-1?"return ":"")+str);
                                        var fData=dataOps.filter(function(o){
                                          return fnFilter(dataRow,o);
                                        }).map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
                                        // alert(fields[0]+":"+fields[1]+"="+dataOps.length+"=>"+fData.length);
                                        var fData=fData.find(o=>o.ma===item.ma);
                                        if(fData)
                                          return true;
                                        else
                                          return false; 
                                      }
                                      else
                                      {
                                        var fnFilter=Function("bang",'data',str);
                                        fnFilter(seft.database,item);
                                      }
                                    }
                                  return true;
                                } 
                            }  
                        },
                        displayExpr: 'ten',
                        valueExpr: 'ma',
                    }
                });
              }
              return Obj;
            });
            const $item =$("<div>", {id: 'detail_'+mn.id})
            .dxDataGrid({
                columnAutoWidth: true,
                showBorders: true,
                keyExpr: 'id',
                width: '100%',
                onContentReady: function(e){  
                  if (!e.component.getSelectedRowKeys().length) { 
                    e.component.selectRowsByIndexes(-1);  
                    setTimeout(function(){ 
                      e.component.selectRowsByIndexes(0);
                    },300);
                  }
                  $(".dx-datagrid-table").addClass("table");
                  if(mn.trigger["report_db"] && mn["report_name"])
                  { 
                    if(mn.trigger["report_db"]!=='' && mn["report_name"]!=='')
                    {
                      var $cBPrint = $('<div id="cBPrint">').dxButton({
                        icon: 'print', //or your custom icon
                        onClick: seft.callRowPrint
                      });
                      if (e.element.find('#cBPrint').length == 0)
                        e.element
                        .find('.dx-toolbar-after')
                        .prepend($cBPrint);
                    }
                  }
                }, 
                onEditingStart() {
                  setTimeout(function(){
                   seft.EnterToTab();
                  },500);
                    // alert('EditingStart');
                },
                columns: Details_Columns,
                dataSource:[],
            });
            seft.detail_grid['tbl_'+mn.id]=$item.dxDataGrid('instance');
            element.append($item);
          }
        });
      }
     }
    },
    mounted() {
      var seft=this;
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        document.querySelectorAll('input[type="file"]').forEach(function(el){
          if(el.getAttribute("id"))
            el.addEventListener('change', this.handleFileSelect, false);
        });
      } else {
          thongbao('The File APIs are not fully supported in this browser.');
      }
      this.EnterToTab();
      this.renderDevExtremeControls();
    },
    template:`
      <div :key="'pcontent-'+m_id" :id="'pcontent-'+m_id">
        <div class="form-horizontal"
          v-if="m_configs.table.filter(c => 1 * c.f_report === 1 && 1 * c.f_show !== 0).length > 0"
        >
          <div class="card-body">
            <div class="row ml-1">
              <div
                class="form-group col-12 col-sm-6 col-md-2"
                v-for="(f, idx) in m_configs.table.filter(c => 1 * c.f_report === 1 && 1 * c.f_show !== 0)"
                :key="'control-'+m_id+'_'+ f.f_name"
              >
                <label :for="'control-'+m_id+'_'+ f.f_name"" class="font-weight-bold">{{ f.f_header }}</label>
                <div :id="'control-'+m_id+'_'+ f.f_name" />
              </div>

              <div class="form-group col-12 col-sm-6 col-md-2 mt-auto">
                <button class="btn btn-info w-50 btnXem" @click="xem_du_lieu">Xem</button>
              </div>
            </div>
          </div>
        </div>
        <div :id="m_id" :class="m_configs.nodes.length>0?'csm_full_width50':'csm_full_width'"></div>
        <div v-if="m_configs.nodes.length>0" class="csm_full_width50" :id="'detailtabs_'+m_id"></div>
      </div>
    `,style:`
div.dataTables_scroll {
width:100% !important;
}
div.DTE_Body div.DTE_Body_Content div.DTE_Field {
  margin: 5px;
  box-sizing: border-box;
}
 
div.DTE_Body div.DTE_Form_Content {
    display:flex;
    flex-direction: row;
    flex-wrap: wrap;
}
.DTE_Field_InputControl .select2-selection,.form-group .select2-selection, .form-control-border {
    border-top: 0;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    box-shadow: inherit;
}
.CodeMirror pre{
  padding-left: 39px;
}
.cm-s-monokai .CodeMirror-linenumber{
  background-color: gray;
}
.DTED .modal-dialog{
  margin: 0px;
}
.DTED .modal-content{
  left: 0px;
  right: 0px;
  top: 0px;
  bottom: 0px;
  margin-left: 0;
  width: 100vw;
  height: 100vh;
  overflow: overlay;
}
.DTED .modal-header{
  display: block;
}
.DTED .modal-footer,.DTED .close{
  margin-right: 5px;
}
.dx-datagrid-edit-popup .dx-toolbar{
    background: linear-gradient(#021c50 15%,#2D4370 95%,rgb(174 178 203) 100%) !important;
    background: -moz-linear-gradient(#021c50 15%,#2D4370 95%,rgb(174 178 203) 100%) !important;
    background: -webkit-linear-gradient(#021c50 15%,#2D4370 95%,rgb(174 178 203) 100%) !important;
    color: white;
}
.dx-datagrid-edit-popup .dx-toolbar .dx-icon-close{
  background: transparent;
  color: white;
}
.dx-dropdowneditor-overlay>.dx-overlay-content{width: auto !important;}
.btnXem {
    background: transparent;
    background: linear-gradient(rgb(174 178 203) 0%, #1c325c 15%, #2D4370 100%) !important;
    background: -moz-linear-gradient(rgb(174 178 203) 0%, #1c325c 15%, #2D4370 100%) !important;
    background: -webkit-linear-gradient(rgb(174 178 203) 0%, #1c325c 15%, #2D4370 100%) !important;
}
`
}