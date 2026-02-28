{
    name:"csm_baocao",
    props: ['Uinfos','com_logo','m_configs','menusapp','getAllMenu','app_id','base','database','real'],
    data:function(){
      var baocao=this.m_configs.report_name,report_code='';
      var trigger=this.m_configs.hasOwnProperty("trigger")?this.m_configs.trigger:{};
      if(trigger.hasOwnProperty("report_db"))
        report_code=this.base.csm_decrypt(trigger["report_db"]);
      return {
        filter_form:false,
        menus:this.getAllMenu(this.menusapp),
        cols_form:[],
        report:false,
        optionsSelect:{},
        defaultValRow:{},
        rpt_teamplate:baocao,
        report_fields:this.m_configs.table,
        report_script:report_code
      };
    },
    created: function(){
      var seft=this;
      if(seft.hasOwnProperty("com_logo"))
        seft.com_logo="";
      // seft.img_toDataURL(seft.com_logo,function(dataUrl) {
      //   seft.img_com=dataUrl;
      // });
      // seft.$parent.$on('update:database', function(nVal) {
      //   seft.database = nVal;
      // });
    },
    methods: {
      getOptionsSelect(f_cbo_query,tb_name,f_name){
        var seft=this;
        seft.optionsSelect[tb_name+"_^_"+f_name]={options:[]};
        if(f_cbo_query===''||!f_cbo_query)
          return seft.optionsSelect[tb_name+"_^_"+f_name];
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
          seft.optionsSelect[tb_name+"_^_"+f_name]=objQa;
          return seft.optionsSelect[tb_name+"_^_"+f_name];
        }
        else if(!objQa.hasOwnProperty('options')||!objQa.hasOwnProperty('query'))
          return seft.optionsSelect[tb_name+"_^_"+f_name];
        seft.optionsSelect[tb_name+"_^_"+f_name]={options:[]};
        if(f_cbo_query==='')
          return seft.optionsSelect[tb_name+"_^_"+f_name];
        var objQa=JSON.parse(f_cbo_query);
        if(!objQa.hasOwnProperty('options')||!objQa.hasOwnProperty('query'))
          return seft.optionsSelect[tb_name+"_^_"+f_name];
        if(objQa.query.length===1)
        {
          seft.optionsSelect[tb_name+"_^_"+f_name]["fields"]=["ma","ten"];
          seft.optionsSelect[tb_name+"_^_"+f_name]["data"]=[];
          seft.optionsSelect[tb_name+"_^_"+f_name]["options"]=[];
          var obj_name=objQa.query[0].obj_name,fields=objQa.query[0].fields,obj_where=objQa.query[0].obj_where;
          if(obj_name==='' && fields.length===0 && obj_where)
          {
            if(obj_where!=='')
                  seft.optionsSelect[tb_name+"_^_"+f_name]["where"]=obj_where;
          }
          else if(obj_name!=='' && fields.length===2)
          {
            var objTBL=seft.database[obj_name];
            // console.log(obj_name,objTBL);
            if(objTBL)
            {
              seft.optionsSelect[tb_name+"_^_"+f_name]["fields"]=fields;
              seft.optionsSelect[tb_name+"_^_"+f_name]["data"]=objTBL.rows;
              seft.optionsSelect[tb_name+"_^_"+f_name]["options"]=objTBL.rows.map(function(o){return {ma:o[fields[0]],ten:o[fields[1]]};});
              seft.optionsSelect[tb_name+"_^_"+f_name]["options"]=seft.optionsSelect[tb_name+"_^_"+f_name]["options"].sort(function(a, b){return a.ten.localeCompare(b.ten)});
              if(obj_where!=='')
                seft.optionsSelect[tb_name+"_^_"+f_name]["where"]=obj_where;
            }
          }
        }
        else if(objQa.options.length>0)
        {
          seft.optionsSelect[tb_name+"_^_"+f_name]["fields"]=["ma","ten"];
          seft.optionsSelect[tb_name+"_^_"+f_name]["data"]=objQa.options;
          seft.optionsSelect[tb_name+"_^_"+f_name]["options"]=objQa.options; 
          seft.optionsSelect[tb_name+"_^_"+f_name]["options"]=seft.optionsSelect[tb_name+"_^_"+f_name]["options"].sort(function(a, b){return a.ten.localeCompare(b.ten)});
        }
        return seft.optionsSelect[tb_name+"_^_"+f_name];
      },
      onFileChange(event) {
        var seft=this;
        var files = event.target.files || event.dataTransfer.files;
        if (!files.length)
          return;
        const file=files[0];
        if (file) {
          var fName = file.name;
          var fileBlob = URL.createObjectURL(file);
          var fileObj = {
              Obj: fileBlob,
              ext: fName.split('.').pop().toLowerCase()
          }
          $("#rpt_"+seft.m_configs.id).officeToHtml({
            fileObj:fileObj
          });
        }
      },
      loadFile(url,callback){
        try
        {
          JSZipUtils.getBinaryContent(url,function(err,data){
            callback(null,data)
          });
        }
        catch(e){
          console.log(e.message);
        }
      },
      create_report(datas_report,dai,cao,kieu_in)
      {
        var seft=this;
        if(document.querySelector('#addprint'))
          document.querySelector('#addprint').remove();
        datas_report["com_logo"]=seft.com_logo;
        const scriptAdd = document.createElement('script');
        scriptAdd.setAttribute("id","addprint");
        scriptAdd.setAttribute("src",'assets/docx2html/dist/docx2html.min.js');
        scriptAdd.onload = function(){
          seft.loadFile(seft.rpt_teamplate,function(err,content){
            var toDataURL = url => fetch(url)
            .then(response => response.blob())
            .then(blob => new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            }));
            // var imageOpts = {
            //   namespaceURI:"",
            //   getImage(url) {
            //     return new Promise(function (resolve, reject) {
            //       toDataURL(url)
            //       .then(dataUrl => {
            //         var kq=dataUrl.replace('/webp;','/png;');
            //         resolve(seft.base.csm_Base64ToImage(kq))
            //       })
            //     });
            //     // var imgBi=seft.base.csm_Base64ToImage(tag);
            //     // return imgBi;
            //   },
            //   getSize(img, url, tagName) {
            //     // return [50,50];
            //     return new Promise(function (resolve, reject) {
            //       const image = new Image();
            //       image.src = url;
            //       image.onload = function () {
            //         resolve([image.width, image.height]);
            //       };
            //       image.onerror = function (e) {
            //         reject(e);
            //       };
            //     });
            //   },
            // };
            // var imageModule = new ImageModule(imageOpts);
            var opts = {}
            opts.centered = false;
            opts.getImage = function (tagValue, tagName) {
              return new Promise(function (resolve, reject) {
                JSZipUtils.getBinaryContent(tagValue, function (error, content) {
                  if (error) {
                    return reject(error);
                  }
                  return resolve(content);
                });
              });
            }
            opts.getSize = function (img, tagValue, tagName) {
              // FOR FIXED SIZE IMAGE :
              // return [150, 150];

              // FOR IMAGE COMING FROM A URL (IF TAGVALUE IS AN ADRESS) :
              // To use this feature, you have to be using docxtemplater async
              // (if you are calling setData(), you are not using async).
              return new Promise(function (resolve, reject) {
                var image = new Image();
                image.src = tagValue;
                var max_heightImg=100;
                if(datas_report["logo_height"])
                  max_heightImg=1*datas_report["logo_height"];
                image.onload = function () {
                  // Kiểm tra chiều cao của hình ảnh
                  if (image.height > max_heightImg) {
                    // Tính toán tỷ lệ và điều chỉnh chiều rộng và chiều cao
                    var ratio = max_heightImg / image.height; // Tính tỉ lệ để điều chỉnh chiều cao
                    var newWidth = image.width * ratio; // Tính chiều rộng mới dựa trên tỷ lệ
                    resolve([newWidth, max_heightImg]); // Trả về chiều rộng mới và chiều cao = 100
                  } else {
                    // Nếu chiều cao nhỏ hơn hoặc bằng 100, trả về kích thước gốc
                    resolve([image.width, image.height]);
                  }
                };

                image.onerror = function (e) {
                  console.log('img, tagValue, tagName : ', img, tagValue, tagName);
                  alert("An error occurred while loading " + tagValue);
                  reject(e);
                };
              });
            }

            var imageModule = new ImageModule(opts);
            var zip = new JSZip(content);
            var doc=new docxtemplater();
            doc.attachModule(new DocxtemplaterHtmlModule({ignoreUnknownTags: true,}));
            doc.attachModule(imageModule);
            doc.loadZip(zip).compile();
            doc.resolveData(datas_report).then(function () {
              doc.render();
              // const blob = doc.getZip().generate({
              //     type: "blob",
              //     mimeType:
              //         "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              //     // compression: DEFLATE adds a compression step.
              //     // For a 50MB output document, expect 500ms additional CPU time
              //     compression: "DEFLATE",
              // });
              // // Output the document using Data-URI
              // saveAs(blob, "output.docx");
              var output=doc.getZip().generate({type:"arraybuffer",compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
              return require("docx2html")(output,{container:document.getElementById('a')}).then(function(html){
                var w = html.content.body.section.clientWidth+200;
                var h = html.content.body.section.clientHeight+55;
                var margin=[-0.2,0.05,0,0];//top, left, buttom, right,
                if(kieu_in==="p")
                {
                  w = html.content.body.section.clientWidth+110;
                  h = html.content.body.section.clientHeight+40;
                  margin=[-0.2,0,0.2,0];//top, left, buttom, right,
                }
                var sizeP=[1*dai,1*cao];
                window.$=jQuery;
                var px2pt=0.115,pt2in=0.01389;
                // sizeP=[w*px2pt*pt2in,w*px2pt*pt2in*rato]
                var opt = {
                  margin:margin,//top, left, buttom, right,
                  html2canvas: {dpi: 192, scale: 2,useCORS: true, letterRendering: true, width: w-w*px2pt, height: h-h*px2pt},
                  pageBreak: { mode: 'css', before:'#nextpage1'},
                  jsPDF:{ unit: 'in', format:sizeP, orientation: kieu_in,compress: true}
                };
                html2pdf().set(opt).from(html.toString()).outputPdf('datauristring').then(function(onFulfilled, onRejected){
                  seft.report=onFulfilled;
                  // if (onFulfilled.startsWith('data:')) {
                  //   // Tách chuỗi để lấy phần Base64
                  //   const base64 = onFulfilled.split(',')[1]; 
                  //   printJS({printable: base64, type: 'pdf', base64: true});
                  // }
                }).catch(function(e) {
                  console.log('catch: ' + e);
                });
              });
            });
          });
        };
        document.body.appendChild(scriptAdd);
      }
    },
    mounted() {
      var seft=this;
      var objTname=seft.m_configs.table_name?seft.m_configs.table_name:seft.m_configs.id;
      if(!seft.defaultValRow[objTname])
        seft.defaultValRow[objTname]={};
      var tableFields=seft.m_configs.table.filter(f=>1*f.f_show===1 && f.f_name.toLowerCase()!=='id').sort(function(a, b){return 1*a.f_stt-1*b.f_stt})
      seft.cols_form=tableFields.filter(function(f){
        if(1*f.f_show===1 && f.f_name.toLowerCase()!=='id' && f.f_name.toLowerCase()!=='parent_id')
        {
          if(f.f_types.indexOf('co')!==-1 && f.f_cbo_query)
            seft.getOptionsSelect(f.f_cbo_query,objTname,f.f_name);
          return true; 
        }
        else
          return false;
      }).map(function(Obj){
        if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1||Obj.f_types.indexOf('ron')!==-1)
          seft.defaultValRow[objTname][Obj.f_name]=0;
        else
          seft.defaultValRow[objTname][Obj.f_name]='';
        var defCol=Obj;
        Obj=Object.assign(Obj,{dataField:Obj.f_name,fixed: Obj.f_fixcol,label: {text: Obj.f_header},width:1*Obj.f_width,cssClass:Obj.f_types});
        if(Obj.f_sort!=='')
          Obj=Object.assign(Obj,{sortOrder:Obj.f_sort});
        if(Obj.f_types.indexOf('num')!==-1||Obj.f_types.indexOf('price')!==-1)
          Obj=Object.assign(Obj,{editorType:"dxNumberBox",format:',##0',editorOptions:{format:',##0'}});
        else if(Obj.f_types.indexOf('ro')!==-1)
        {
          Obj=Object.assign(Obj,{allowEditing: false});
          if(Obj.f_types.indexOf('ron')!==-1)
            Obj=Object.assign(Obj,{format:',##0',editorOptions:{format:',##0'}});
        }
        else if(Obj.f_types.indexOf('datetime')!==-1)
        {
          Obj=Object.assign(Obj,{template: function (data, itemElement) {  
            $("<div />").dxDateBox({
              useMaskBehavior: true,
              type: 'datetime',
              width: 1*Obj.f_width,
              elementAttr: {class: "datetime"},
              format:"dd/MM/yyyy HH:mm:ss",
              onValueChanged: function (e) {
                data.component.updateData(data.dataField, dateFormat(e.value,"dd/mm/yyyy HH:MM:ss"));
              },
              value: (typeof data.component.option('formData')[data.dataField] ==='string'?data.component.option('formData')[data.dataField].toDate('dd/mm/yyyy HH:MM:ss'):data.component.option('formData')[data.dataField])
            }).appendTo(itemElement);
          },editorType: "datetime",format: "dd/MM/yyyy HH:mm:ss",editorOptions:{type: "date",format:"dd/mm/yyyy HH:mm:ss"}});
        }
        else if(Obj.f_types.indexOf('date')!==-1)
        {
          Obj=Object.assign(Obj,{template: function (data, itemElement) {  
            $("<div />").dxDateBox({
              useMaskBehavior: true,
              type: 'date',
              width: 1*Obj.f_width,
              elementAttr: {class: "date"},
              format:"dd/MM/yyyy",
              onValueChanged: function (e) {
                data.component.updateData(data.dataField, dateFormat(e.value,"dd/mm/yyyy"));
              },
              value: (typeof data.component.option('formData')[data.dataField] ==='string'?chuyenNgay(data.component.option('formData')[data.dataField]):data.component.option('formData')[data.dataField])
            }).appendTo(itemElement);
          },editorType: "date",format: "dd/MM/yyyy",editorOptions:{type: "date",formatString:"dd/mm/yyyy",format:"dd/MM/yyyy"}});
        }
        else if(Obj.f_types.indexOf('time')!==-1)
        {
          Obj=Object.assign(Obj,{editorType: "time",format: "HH:mm:ss",editorOptions:{format:"HH:mm:ss"}});
        }
        else if(Obj.f_types.indexOf('co')!==-1)
        {
          // console.log(seft.optionsSelect[objTname+"_^_"+Obj.f_name]["options"])
          if(Obj["f_grid"] && Obj["f_grid_fields"])
          {
            var colGrid=false;
            var mnuColGrid=seft.menus.find(m=>m.id===Obj["f_grid"]);
            if(mnuColGrid)
              colGrid=mnuColGrid.table.filter(f=>Obj["f_grid_fields"].find(fc=>fc===f.f_name));
            if(colGrid)
            {
              colGrid=colGrid.filter(function(f){
                if(f.f_types.indexOf('co')!==-1)
                  seft.getOptionsSelect(f.f_cbo_query,mnuColGrid.table_name,f.f_name);
                return true; 
              }).sort(function(a, b){return 1*a.f_stt-1*b.f_stt}).map(function(f){
                return {dataField:f.f_name,caption:f.f_header,width:1*f.f_width,cssClass:f.f_types};
              });
              var filter_data=function(obj){return true;};
              if(mnuColGrid.trigger["filter"])
              {
                var t_code=seft.csm_decrypt(mnuColGrid.trigger["filter"]);
                filter_data=Function("obj",t_code);
              }
              Obj=Object.assign(Obj,{editorType: "dxDropDownBox",
                editorOptions: {
                  width: 'auto',
                  dataSource:seft.database[mnuColGrid.table_name].rows.filter(filter_data),
                  valueExpr: 'id',
                  displayExpr(item) {
                    var ten=item[Obj["f_grid_fields"][1]];
                    var ma=item[Obj["f_grid_fields"][0]];
                    return item && `${ma} <${ten}>`;
                  },
                  inputAttr: { 'aria-label': 'Owner' },
                  contentTemplate(eDD) {
                    const value = eDD.component.option('value');
                    const $dataGrid = $('<div>').dxDataGrid({
                      dataSource: seft.database[mnuColGrid.table_name].rows.filter(filter_data),
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
                        eDD.component.option('value', hasSelection ? keys[0] : null);
                        // data.component.option('formData')[data.dataField]=keys[0];
                      },
                    });
                    var dataGrid = $dataGrid.dxDataGrid('instance');
                    eDD.component.on('valueChanged', (args) => {
                      dataGrid.selectRows(args.value, false);
                      eDD.component.close();
                    });
                    return $dataGrid;
                  }
                }
              });
            }
          }
          else
            Obj=Object.assign(Obj,{
              template: function (data, itemElement) {
                $("<div />").dxSelectBox({
                  dataSource: new DevExpress.data.DataSource({
                    store: seft.optionsSelect[objTname+"_^_"+Obj.f_name]["options"],
                    paginate: true,
                    pageSize: 10
                  }),
                  placeholder: 'Chọn '+Obj.f_header,
                  showClearButton: true,
                  searchEnabled: true,
                  searchExpr: ['ma', 'ten'],
                  displayExpr: 'ten',
                  valueExpr: 'ma',
                  value:data.component.option('formData')[data.dataField],
                  onValueChanged(e) {
                    data.component.updateData(data.dataField,e.value);
                  },
                }).appendTo(itemElement);
              }
            });
        }
        return Obj;
      });
      seft.cols_form.push({
        itemType: "button",
        horizontalAlignment: "left",
        buttonOptions: {
            text: "Xem",
            type: "success",
            onClick: function (e) {
              var dataForm={};
              seft.m_configs.table.forEach((elF) => {
                if(seft.filter_form.option('formData')[elF.f_name.toLowerCase()])
                  dataForm[elF.f_name.toLowerCase()]=seft.filter_form.option('formData')[elF.f_name.toLowerCase()];
              });
              var load_report_db=Function("seft","data","bang",seft.report_script);
              var dataRPT=load_report_db(seft,dataForm,seft.database);
              return seft.create_report(dataRPT,seft.m_configs.p_width,seft.m_configs.p_height,seft.m_configs.orientation);
            }
        }
      });
      seft.filter_form=$('#filter_'+seft.m_configs.id).dxForm({
        labelMode: 'floating',
        minColWidth: 150,
        colCount: 5,
        formData:{},
        items:seft.cols_form,
        readOnly: false,
        showColonAfterLabel: true,
        labelLocation: 'left',
        colCountByScreen:true
      }).dxForm('instance');

      // return seft.create_report({});
      // const formatDate = new Intl.DateTimeFormat('vi-VN').format;
    },
    template:`
    <div :id="'rpt_'+m_configs.id" class="card">
      <div class="card-header">
        <div :id="'filter_'+m_configs.id"></div>
      </div>
      <!-- /.card-header -->
      <div class="card-body">
        <iframe :src="report" aria-hidden="true" style="right:0; top:0; bottom:0; height:100%; width:100%"></iframe>
      </div>
      <!-- /.card-body -->
    </div>
    <!-- /.card -->
  </div>`,
  style:`
    .dx-dropdowneditor-overlay>.dx-overlay-content{width: auto !important;}
`
}