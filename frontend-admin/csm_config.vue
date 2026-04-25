{
    name:"csm_config",
    props: ['Uinfos','m_configs','updateMenu','app_menus','app_id','base','database','real'],
    data:function(){
      var seft=this;
      var mang_code=[];
      if(seft.database['sys_autos'])
        mang_code=seft.database['sys_autos'].rows.filter(function(c){
          return ("_"+c.id+"_").includes("_"+seft.app_id+"_") && c.p_type===0;
        }).map(function(obj){
          return {ma:obj.id,ten:obj.id};
        });
      var dHeader=[
        {id:1,"f_stt":1,"f_name":"id","f_header":"id","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"0","f_alert_query":""},
        {id:2,"f_stt":2,"f_name":"m_icons","f_header":"icons","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:3,"f_stt":3,"f_name":"label","f_header":"Tên menu","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:4,"f_stt":4,"f_name":"table_name","f_header":"Bảng dữ liệu","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:5,"f_stt":5,"f_name":"type_menu","f_header":"Dạng menu","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":"","ten":"Không Chọn"},                  
                {"ma":0,"ten":"Kiểu Cột"},
                {"ma":1,"ten":"Kiểu dòng"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:6,"f_stt":6,"f_name":"type_form","f_header":"Thể hiện theo","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":"","ten":"Không Chọn"},                  
                {"ma":1,"ten":"Dạng bảng"},
                {"ma":2,"ten":"Dạng Form Master-Detail"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:7,"f_stt":7,"f_name":"row_type_edit","f_header":"Kiểu chỉnh sửa dòng","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":0,"ten":"Dạng Form"},                  
                {"ma":1,"ten":"Trên dòng"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:8,"f_stt":8,"f_name":"dev","f_header":"Chỉ hiện với quyền tối cao","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":false,"ten":"Không"},                  
                {"ma":true,"ten":"Có"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:9,"f_stt":9,"f_name":"prefix_pk","f_header":"Tiếp đầu ngữ khi tạo ID","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:10,"f_stt":10,"f_name":"table_pagesize","f_header":"Dòng trên trang","f_types":"price","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":false,"ten":"Không"},                  
                {"ma":true,"ten":"Có"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""}
      ];
      var dFooter=[
        {id:11,"f_stt":11,"f_name":"field_root","f_header":"Trường liên kết Master","f_types":"ed","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:12,"f_stt":12,"f_name":"report_name","f_header":"Mẫu báo cáo","f_types":"file","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:13,"f_stt":13,"f_name":"orientation","f_header":"Kiểu in","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":[
                {"ma":"","ten":"Không Chọn"},                  
                {"ma":"p","ten":"In Dọc"},
                {"ma":"l","ten":"In Ngang"}
            ]
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:14,"f_stt":14,"f_name":"p_width","f_header":"Trang In Dài","f_types":"price","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:15,"f_stt":15,"f_name":"p_height","f_header":"Trang In Rộng","f_types":"price","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"150","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:16,"f_stt":16,"f_name":"m_show","f_header":"Hiện","f_types":"check","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:17,"f_stt":17,"f_name":"g_readonly","f_header":"Chỉ được xem","f_types":"check","f_dec":"","f_cbo_query":"","f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"1","f_alert_query":""},
        {id:18,"f_stt":18,"f_name":"v_link","f_header":"Vuejs Component","f_types":"select","f_dec":"","f_cbo_query":`{
          "query":[],
          "options":`+JSON.stringify(mang_code)+`
        }`,"f_pkid":"0","f_sort":"","f_align":"left","f_filter":"text_filter","f_width":"100","f_sorting":"str","f_show":"1","f_alert_query":""}
      ];
      var menuConfig=JSON.parse(JSON.stringify(seft.m_configs));
      dFooter.concat(dHeader).forEach(function(f){
        if(!menuConfig[f.f_name])
        {
          if(f.f_types==="price")
            menuConfig[f.f_name]=0;
          else
            menuConfig[f.f_name]="";
        }
      });
      var mnuList=JSON.parse(JSON.stringify(seft.app_menus));
      mnuList.unshift({id:'root',label:'Gốc'});
      if(!seft.m_configs.hasOwnProperty("table"))
        seft.m_configs["table"]=[];
      return {
        selectTrigger:false,
        parent_id:false,
        menuConfig:menuConfig,
        menuItems:mnuList,
        copyRow:false,
        dataFields:[
          {dataField: "f_stt" , sortOrder: "asc" , caption: "STT" ,width:"100px",alignment: 'right',allowEditing: false,dataType:"number",format:',##0',editorOptions:{format:',##0'}},
          {dataField: "f_name" , caption: "Tên Trường" ,width:"100px"},
          {dataField: "f_header" , caption: "Mô Tả" ,width:"100px"},
          {dataField: "f_types" , caption: "Loại data" ,width:"100px",
            editorOptions: {showClearButton: true},
            lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "ed",value:"ed"},
                    {label: "price",value:"price"},
                    {label: "co",value:"co"},
                    {label: "cp",value:"cp"},
                    {label: "coro",value:"coro"},
                    {label: "cntr",value:"cntr"},
                    {label: "ch",value:"ch"},
                    {label: "ra",value:"ra"},
                    {label: "ro",value:"ro"},
                    {label: "roprice",value:"roprice"},
                    {label: "ron",value:"ron"},
                    {label: "link",value:"link"},
                    {label: "Nút Click",value:"btn"},
                    {label: "img",value:"img"},
                    {label: "file",value:"file"},
                    {label: "date",value:"date"},
                    {label: "time",value:"time"},
                    {label: "txt",value:"text area"},
                    {label: "datetime",value:"datetime"},
                    {label: "nummeric",value:"nummeric"},
                    {label: "numchu",value:"numchu"},
                    {label: "edt",value:"edt"},
                    {label: "Lập trình",value:"codejs"},
                    {label: "Pasw",value:"password"}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_grid" , caption: "Lưới chọn" ,width:"300px",
             setCellValue(rowData, value) {
              rowData.f_grid = value;
              rowData.f_grid_fields = "";
             var tConfig=false;
              if(rowData.f_grid)
              {
                tConfig=seft.getAllMenu(seft.app_menus).find(t=>t.id===rowData.f_grid);
                if(tConfig)
                  tConfig=tConfig.table;
              }
              $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance').columnOption('f_grid_fields', 'lookup.dataSource',tConfig?tConfig.filter(f=>f.f_name.toLowerCase()!=="id"):[]);
            },
            editorOptions: {showClearButton: true},
            lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: seft.getAllMenu(seft.app_menus).filter(t=>(t.table_name!==""||t.trigger["load_db"]) && t.id!==seft.m_configs.id),
                  key: "id"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'id', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_grid_fields" , caption: "Các cột trên lưới chọn" ,width:"300px",
            editCellTemplate: function(cellElement, cellInfo) {
              var tConfig=false;
              if(cellInfo.data.f_grid)
              {
                tConfig=seft.getAllMenu(seft.app_menus).find(t=>t.id===cellInfo.data.f_grid);
                if(tConfig)
                  tConfig=tConfig.table.sort(function (a, b) {
                    return a.f_stt - b.f_stt;
                  });
              }
              return $('<div>').dxTagBox({
                dataSource: $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance').columnOption('f_grid_fields', 'lookup.dataSource'),
                value: cellInfo.value,
                valueExpr: 'f_name',
                displayExpr: 'f_header',
                inputAttr: { 'aria-label': 'Name' },
                showSelectionControls: true,
                maxDisplayedTags: 3,
                showMultiTagOnly: false,
                applyValueMode: 'useButtons',
                searchEnabled: true,
                onValueChanged(e) {
                  cellInfo.setValue(e.value);
                },
                onSelectionChanged() {
                  cellInfo.component.updateDimensions();
                },
              });
            },
            lookup: {
              dataSource:[],
              showClearButton:true,
              valueExpr: 'f_name',
              displayExpr: 'f_header',
            },
            cellTemplate(container, options) {
              var tConfig=false;
              if(options.data.f_grid)
              {
                tConfig=seft.getAllMenu(seft.app_menus).find(t=>t.id===options.data.f_grid);
                if(tConfig)
                  tConfig=tConfig.table;
              }
              if(options.column.lookup.dataSource.length===0 && tConfig)
                $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance').columnOption('f_grid_fields', 'lookup.dataSource',tConfig);
              const noBreakSpace = '\u00A0';
              // const text = (options.value || []).map((element) => options.column.lookup.calculateCellValue(element)).join(', ');
              const text = (options.value || []).map((element) => options.column.lookup.calculateCellValue(element)).join(', ');
              container.text(text || noBreakSpace).attr('title', text);
            }
          },
          {
            dataField: "f_cbo_query" , 
            caption: "Query cho combobox" ,
            colSpan: 2,
            editCellTemplate:function(cellElement, cellInfo) {
              var val=cellInfo.value;
              ($("<textarea>", { "id": "ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_cbo_query", "val": "" })).appendTo(cellElement);  
              var isMacLike = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)?true:false;
              var m_extraKeys={
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-Space"]=seft.fetchCodeSuggestions;
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-S"]=function(cm) {
                // that.fnSave();
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-H"]=function(cm) {
                // that.editorTG.execCommand('replace');
              };
              if(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_cbo_query"))
              {
                var f_editorTG = CodeMirror.fromTextArea(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_cbo_query"), {
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
                  f_editorTG.setValue(val);
                f_editorTG.on("change", function(cm, change) {
                  cellInfo.setValue(cm.getValue());
                });
              }
            }
          },
          {
            dataField: "f_group_header_template" , 
            caption: "Hàm tạo Mẫu nhóm ở đầu" ,
            colSpan: 2,
            editCellTemplate:function(cellElement, cellInfo) {
              var val=cellInfo.value;
              ($("<textarea>", { "id": "ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_header_template", "val": "" })).appendTo(cellElement);  
              var isMacLike = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)?true:false;
              var m_extraKeys={
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-Space"]=seft.fetchCodeSuggestions;
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-S"]=function(cm) {
                // that.fnSave();
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-H"]=function(cm) {
                // that.editorTG.execCommand('replace');
              };
              if(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_header_template"))
              {
                var f_editorTG = CodeMirror.fromTextArea(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_header_template"), {
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
                  f_editorTG.setValue(val);
                f_editorTG.on("change", function(cm, change) {
                  cellInfo.setValue(cm.getValue());
                });
              }
            }
          },
          {
            dataField: "f_group_footer_template" , 
            caption: "Hàm tạo Mẫu nhóm ở cuối" ,
            colSpan: 2,
            editCellTemplate:function(cellElement, cellInfo) {
              var val=cellInfo.value;
              ($("<textarea>", { "id": "ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_footer_template", "val": "" })).appendTo(cellElement);  
              var isMacLike = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)?true:false;
              var m_extraKeys={
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-Space"]=seft.fetchCodeSuggestions;
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-S"]=function(cm) {
                // that.fnSave();
              };
              m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-H"]=function(cm) {
                // that.editorTG.execCommand('replace');
              };
              if(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_footer_template"))
              {
                var f_editorTG = CodeMirror.fromTextArea(document.getElementById("ckpeditor_"+seft.m_configs.id+'_'+cellInfo.data.id+"_f_group_footer_template"), {
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
                  f_editorTG.setValue(val);
                f_editorTG.on("change", function(cm, change) {
                  cellInfo.setValue(cm.getValue());
                });
              }
            }
          },
          {dataField: "f_group_index" , caption: "Vị trí tạo nhóm" ,width:"100px",alignment: 'right',dataType:"number",format:',##0',editorOptions:{format:',##0',showClearButton: true}},
          {dataField: "f_dec" , caption: "Số thập phân" ,width:"100px",alignment: 'right',dataType:"number",format:',##0',editorOptions:{format:',##0'}},
          {dataField: "f_pkid" , caption: "Là Khóa chính" ,width:"100px",
            editorOptions: {showClearButton: true},
            lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "Có",value:1},
                    {label: "Không",value:0}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_search" , caption: "Cho phép tìm kiếm" ,width:"100px",
            editorOptions: {showClearButton: true},
            lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "Có",value:1},
                    {label: "Không",value:0}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_fixcol" , caption: "Cố định cột" ,width:"100px",
            editorOptions: {showClearButton: true},
            lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "Có",value:true},
                    {label: "Không",value:false}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_sort" , caption: "Cách sắp xếp" ,width:"100px",
           editorOptions: {showClearButton: true},
           lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "asc",value:"asc"},
                    {label: "desc",value:"desc"}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_report" , caption: "Là tìm kiếm" ,width:"100px",
             editorOptions: {showClearButton: true},
             lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "Có",value:1},
                    {label: "Không",value:0}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          },
          {dataField: "f_width" , caption: "Độ rộng" ,width:"100px",alignment: 'right',dataType:"number",format:',##0',editorOptions:{format:',##0'}},
          {dataField: "f_show" , caption: "Hiện" ,width:"100px",
             editorOptions: {showClearButton: true},
             lookup: {
              dataSource: {
                store: {
                  type: 'array',
                  data: [
                    {label: "Có",value:1},
                    {label: "Không",value:0}
                  ],
                  key: "value"
                },
                pageSize: 10,
                paginate: true
              },
              showClearButton:true,
              valueExpr: 'value', // contains the same values as the "statusId" field provides
              displayExpr: 'label' // provides display values
            }
          }
        ],
        editorDTB:false,
        timeCheck:false,
        editorTG:{},
        dHeader:dHeader,
        dFooter:dFooter,
      }
    },
    created:function(){
      var seft=this;
      seft.$parent.$on('update:database', function(nVal) {
        seft.database = nVal;
      });
      var trigger={};
      if(!seft.menuConfig.hasOwnProperty("trigger"))
      {
        seft.menuConfig["trigger"]={};
      }
      if(Array.isArray(seft.menuConfig.trigger))
      {
        seft.menuConfig.trigger.forEach(function(t){
          var k=t.id.split('_undefined');
          trigger[k[0]]=seft.csm_encrypt(seft.Base64.decode(t.p_code));
        });
        seft.menuConfig.trigger=trigger;
      }
    },
    methods:{
        // Hàm gọi API OpenAI để gợi ý mã. Vào https://platform.openai.com/ . Đăng nhập bằng tài khoản gmail lleducanh@gmail.com Để có OpenAI Api Key
      fetchCodeSuggestions:async function(cm) {
        var that=this;
        const mode = cm.getOption("mode");
        const langMap = {
            "javascript": "JavaScript",
            "python": "Python",
            "htmlmixed": "HTML",
            "css": "CSS",
            "xml": "XML",
            "php": "PHP",
            "java": "Java",
            "cpp": "C++",
            "c": "C",
            "json": "JSON"
        };
        const language = langMap[mode] || "Plain Text";
        const userCode = cm.getSelection().trim();  // Lấy đoạn code được chọn
        if (!userCode) {
            canhbao("Hãy chọn một đoạn code để gợi ý!");
            return;
        }

        try {
          const token = (window.__app_auth__ && window.__app_auth__.token) || "";
          const apiBase = window.__api_base__ || "/api";
          const response = await fetch(`${apiBase}/ai-code-stream`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "csm-token": token,
            },
            body: JSON.stringify({
              appId: "csm_config_editor",
              message: `Hoàn thành đoạn mã sau bằng ${language} và chỉ trả về code, không giải thích:\n\`\`\`${language.toLowerCase()}\n${userCode}\n\`\`\``,
              currentCode: userCode,
              language: mode,
              contextType: "code",
              responseMode: "edit",
            }),
          });

          if (!response.ok) {
            canhbao("Không gọi được AI nội bộ");
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullResponse = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const json = line.slice(5).trim();
              if (!json || json === "[DONE]") continue;
              try {
                const evt = JSON.parse(json);
                if (evt.stage === "streaming" && evt.chunk) {
                  fullResponse += evt.chunk;
                } else if (evt.stage === "complete" && evt.fullResponse) {
                  fullResponse = evt.fullResponse;
                } else if (evt.stage === "error") {
                  canhbao(evt.message || "AI trả về lỗi");
                  return;
                }
              } catch {
                // Ignore parse failures
              }
            }
          }

          let aiSuggestion = fullResponse.trim() || "Không có gợi ý.";
          const codeMatch = aiSuggestion.match(/```(?:\w+)?\n([\s\S]+?)\n```/);
          if (codeMatch) {
            aiSuggestion = codeMatch[1];
          }

          cm.replaceSelection(aiSuggestion);
          thongbao("Đã nhận gợi ý từ AI");
        } catch (err) {
          canhbao("Lỗi gọi AI nội bộ: " + String(err));
        }
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
      sortAllMenu(arr = []){
        var seft=this;
        arr=arr.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
        return arr.reduce((list, { nodes, ...e }) => {
          if(nodes)
          {
            nodes=seft.sortAllMenu(nodes);
            e["nodes"]=nodes;
          }
          list.push(e);
          return list;
        }, []);
      },
      getAllMenu(arr = [], parent_id){
        var seft=this;
        arr=arr.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0));
        return arr.reduce((list, { nodes, ...e }) => {
          list.push(parent_id ? {...e,parent_id:parent_id} : e);
          if(nodes) list.push(...seft.getAllMenu(nodes, e.label));
          return list;
        }, []);
      },
      getOptionsSelect(f_cbo_query){
        if(f_cbo_query==='')
          return [];
        var objQa=JSON.parse(f_cbo_query);
        if(!objQa.hasOwnProperty('options')||!objQa.hasOwnProperty('query'))
          return [];
        if(objQa.query.length===1)
        {
          
        }
        else if(objQa.options.length>0)
          return objQa.options;
        // return [
        //           {"ma":0,"ten":"Dạng bảng"},
        //           {"ma":1,"ten":"Dạng Form Master-Detail"}
        //       ];
      },
      menuTrigger(){
        // alert(this.selectTrigger);
        var seft=this;
        var trigger=seft.menuConfig.hasOwnProperty("trigger")?seft.menuConfig.trigger:{};
        if(trigger.hasOwnProperty(seft.selectTrigger))
        {
          var p_code=seft.csm_decrypt(trigger[seft.selectTrigger]);
          seft.editorTG.setValue(p_code);
        }
        else
          seft.editorTG.setValue('');
      },
      saveTrigger(){
        var seft=this;
        if(seft.selectTrigger)
        {
          if(!seft.menuConfig.hasOwnProperty("trigger"))
            seft.menuConfig.trigger={};
          seft.menuConfig.trigger[seft.selectTrigger]=seft.csm_encrypt(seft.editorTG.getValue());
        }
      },
      AutoConfig(){
        var seft=this;
        var template=`
          <div class="mt-4">
              <label for="tagetStruct" class="form-label">Nhập nội dung tên trường nối nhau như a,b,c,d....</label>
              <textarea id="tagetStruct" class="form-control" rows="4" aria-describedby="helpText"></textarea>
              <div id="helpText" class="form-text">Hãy nhập thông tin vào đây, tối đa 500 ký tự.</div>
          </div>`;
        swal({
          closeOnClickOutside:false,
          closeOnEsc: false,
          content: {
            element: 'div',
            attributes: {
              innerHTML: `${template}`,
            },
          },
          buttons: {
            cancel: {
              text: "Thoát",
              value: false,
              visible: true,
              className: "",
              closeModal: true,
            },
            taocautruc: {
              text: "Vâng, Tôi tạo cấu trúc!",
              value: "taocautruc",
              visible: true,
              className: "bg-green",
              closeModal: true
            }
          }
        }).then((xacnhan) => {
          if(xacnhan==="taocautruc")
          {
            seft.menuConfig.table=[];
            var cac_truong=document.querySelector(".swal-modal #tagetStruct").value.split(new RegExp(',','g')).filter(field=>field);
            for(var col=0;col<cac_truong.length;col++)
            {
              var infoField={};
              infoField["id"]=seft.guid(seft.app_id);
              infoField["f_name"]=seft.xoa_dau(cac_truong[col]).toLowerCase();
              infoField["f_header"]=cac_truong[col];
              infoField["f_types"]="ed";
              infoField["f_width"]=200;
              infoField["f_show"]=1;
              infoField["f_stt"]=seft.menuConfig.table.length+1;
              var chkExist=seft.menuConfig.table.find(f=>f.f_name===infoField["f_name"]);
              if(!chkExist)
                seft.menuConfig.table.push(infoField);
            }
            if(seft.menuConfig.table.length>0 && !seft.menuConfig.table.find(f=>f.f_name==="id"))
            {
              var infoField={};
              infoField["id"]=seft.guid(seft.app_id);
              infoField["f_name"]="id";
              infoField["f_header"]="id";
              infoField["f_types"]="ed";
              infoField["f_width"]=200;
              infoField["f_show"]=1;
              infoField["f_stt"]=0;
              seft.menuConfig.table.push(infoField);
            }
            $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance').option('dataSource',JSON.parse(JSON.stringify(seft.menuConfig.table)));
          }
        });
      },
      SaveConfig(){
        var seft=this;
        seft.dFooter.concat(seft.dHeader).forEach(function(f){
          var el=document.querySelector('#context-'+seft.m_configs.id+' #'+f.f_name);
          if(el)
          {
            if(el.getAttribute('class').indexOf("check")!==-1)
              seft.menuConfig[f.f_name]=el.checked;
            else
              seft.menuConfig[f.f_name]=el.value;
          }
        });
        seft.updateMenu(seft.menuConfig);
      },
      importExcel(){
        var seft=this;
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
                  seft.menuConfig.table=[];
                  for(var col=0;col<dataSheet[0].length;col++)
                  {
                    var infoField={};
                    infoField["id"]=seft.guid(seft.app_id);
                    infoField["f_name"]=seft.xoa_dau(dataSheet[0][col]);
                    infoField["f_header"]=dataSheet[0][col];
                    //Kiểm tra kiểu dữ liệu
                    if(dataSheet[1][col])
                    {
                      if((dataSheet[1][col]*1).toString()===dataSheet[1][col])
                        infoField["f_types"]="nummeric";
                      else if(dataSheet[1][col].match(/\d{2}([\/.-])\d{2}\1\d{4}/g))
                        infoField["f_types"]="date";
                      else if(typeof dataSheet[1][col] ==='string')
                        infoField["f_types"]="ed";
                    }
                    else
                      infoField["f_types"]="ed";
                    infoField["f_width"]=200;
                    infoField["f_show"]=1;
                    infoField["f_stt"]=seft.menuConfig.table.length+1;
                    var chkExist=seft.menuConfig.table.find(f=>f.f_name===infoField["f_name"]);
                    if(!chkExist)
                      seft.menuConfig.table.push(infoField);
                  }
                  var chkExist=seft.menuConfig.table.find(f=>f.f_name==="id");
                  if(!chkExist)
                  {
                    var infoField={};
                    infoField["id"]=seft.guid(seft.app_id);
                    infoField["f_name"]="id";
                    infoField["f_header"]="id";
                    infoField["f_types"]="ed";
                    infoField["f_width"]=200;
                    infoField["f_show"]=1;
                    infoField["f_stt"]=0;
                    seft.menuConfig.table.push(infoField);
                  }
                  $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance').option('dataSource',JSON.parse(JSON.stringify(seft.menuConfig.table)));
                  // console.log(dataSheet);
                }
                cSheet++;
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
      xoa_dau:function(str) {
        if(str)
        {
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
          str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|{|}|\||\\/g," ");
          str = str.replace(/\s+/g, ' ');
          str = str.replace(/ /g, '_');
          // loại bỏ toàn bộ dấu space (nếu có) ở 2 đầu của xâu
          str =str.trim().toLowerCase();
          return str;
        }
        else
          return "";
      }
    },
    mounted() {
      // alert(this.m_configs);
      seft=this;
      if(!seft.menuConfig.hasOwnProperty("trigger"))
        seft.menuConfig["trigger"]={};
      seft.timeCheckT=setInterval(function(){
        if(document.getElementById("editorTrigger"+seft.m_configs.id)&&!document.querySelector("#tab-triggers"+seft.m_configs.id+" .CodeMirror"))
        {
          var isMacLike = navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i)?true:false;
          var m_extraKeys={
          };
          m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-Space"]=seft.fetchCodeSuggestions;
          m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-S"]=function(cm) {
            // that.fnSave();
          };
          m_extraKeys[(isMacLike?"Cmd":"Ctrl")+ "-H"]=function(cm) {
            // that.editorTG.execCommand('replace');
          };
          seft.editorTG = CodeMirror.fromTextArea(document.getElementById("editorTrigger"+seft.m_configs.id), {
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
          // that.editorTG.setSize(500,300);
          if(document.querySelector("#tab-triggers"+seft.m_configs.id+" .CodeMirror"))
            clearInterval(seft.timeCheckT);
        } 
      },200);
      var cautrucTruong=[];
      seft.menuConfig.table.forEach(function(field){
        var infoField=JSON.parse(JSON.stringify(field));
        if(!infoField["f_types"])
          infoField["f_types"]="ed";
        infoField["id"]=seft.guid(seft.app_id);
        cautrucTruong.push(infoField);
      });
      seft.menuConfig.table=cautrucTruong;
      
      var dxDGridObj={
        dataSource: seft.menuConfig.table||[],
        paging: {
          enabled: false
        },
        keyExpr: 'id',
        showBorders: true,
        allowColumnResizing: true,
        columnResizingMode: 'widget',
        columnChooser: {
            enabled: true,
            mode: "dragAndDrop" // or "select"
        },
        columnFixing: {
          enabled: true
        },
        editing: {
          mode: "popup",
          popup: {
            title: "Thiết lập trường dữ liệu cho "+seft.getNameMenu(seft.menuConfig.label),
            showTitle: true
          },
          form: {
            items: [{
              itemType: 'group',
              colCount: 2,
              colSpan: 2,
              items: seft.dataFields,
            }]
          },
          allowAdding: true,
          allowUpdating: true,
          allowDeleting: true,
          confirmDelete: true,
          useIcons: true,
        },
        selection: {
          mode: "single"
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
        onContentReady: function(e){  
          $(".dx-datagrid-table").addClass("table");  
          var $cBImport = $('<div id="cBImport">').dxButton({
            icon: 'fas fa-file-import', //or your custom icon
            onClick: seft.importExcel
          });
          if (e.element.find('#cBImport').length == 0)
            e.element
            .find('.dx-toolbar-after')
            .prepend($cBImport);
        }, 
        onEditorPreparing: function(e) {  
          if (e.parentType == 'dataRow') {  
              e.editorOptions.onKeyDown = function(arg) { 
                if(arg.jQueryEvent)
                  if (arg.jQueryEvent.keyCode == 13) {  
                      arg.jQueryEvent.stopPropagation();  
                  }  
              }  
          }  
        },
        onOptionChanged(e) {
          if (e.name === 'editing') {
            const editRowKey = e.component.option('editing.editRowKey');
            let changes = e.component.option('editing.changes');
            // alert(JSON.stringify(changes))
            // $('#editRowKey').text(editRowKey === null ? 'null' : editRowKey);

            // changes = changes.map((change) => ({
            // type: change.type,
            // key: change.type !== 'insert' ? change.key : undefined,
            // dataField: change.data,
            // }));

            // $('#changes').text(JSON.stringify(changes, null, ' '));
          }
        },
        onEditingStart() {
            // alert('EditingStart');
        },
        rowDragging: {
          allowReordering: true,
          onReorder(e) {
            let dataSource = e.component.option('dataSource');
            let fromIndex = e.fromIndex;
            let toIndex = e.toIndex;

            // Update the status of the rows being dragged
            let rows = [...dataSource]; // Copy the data source to avoid mutating it directly
            let movedRow = rows.splice(fromIndex, 1)[0]; // Remove the dragged row
            rows.splice(toIndex, 0, movedRow); // Insert it at the new position

            // Update the `f_stt` field based on the new order
            rows.forEach((row, index) => {
                row.f_stt = index + 1;
            });

            // Update the data source with the new order
            e.component.option('dataSource', rows);
          },
          // onReorder(e) {
          //   var rows = e.component.getVisibleRows().map(r=>r.data);
          //   rows.sort(function (a, b) {
          //     return a.f_stt - b.f_stt;
          //   });
          //   // var f_sttF=e.fromIndex+1;
          //   // var f_sttT=e.toIndex+1;
          //   rows[e.fromIndex].f_stt=e.toIndex+1;
          //   if(e.fromIndex-e.toIndex===1||e.toIndex-e.fromIndex===1)
          //     rows[e.toIndex].f_stt=e.fromIndex+1;
          //   else if(e.fromIndex>e.toIndex)
          //   {
          //     for(var r=e.toIndex;r<e.fromIndex;r++)
          //       rows[r].f_stt=e.toIndex+r+1;
          //   }
          //   else
          //   {
          //     for(var r=e.fromIndex+1;r<=e.toIndex;r++)
          //       rows[r].f_stt=e.fromIndex+r-1;
          //   }
          //   e.component.option('dataSource',rows);
          //   // e.component.refresh();
          // },
        },
        onInitNewRow(info) {
          if(seft.copyRow)
          {
            info.data=Object.assign(info.data,seft.copyRow);
            seft.copyRow=false;
          }
          else
          {
            info.data["f_types"]="ed";
            info.data["f_width"]=200;
            info.data["f_show"]=1;
            info.data["f_stt"]=info.component.getVisibleRows().length+1;
          }
          info.data["id"]=seft.guid(seft.app_id);
        },
        onRowInserting() {
            // alert('RowInserting');
        },
        onRowInserted() {
            // alert('RowInserted');
        },
        onRowUpdating() {
            // alert('RowUpdating');
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
        },
        onEditCanceling() {
            // alert('EditCanceling');
        },
        onEditCanceled() {
            // alert('EditCanceled');
        },
        onSaving(e) {
          const change = e.changes[0];
          if (change) {
            var rows = e.component.getVisibleRows();
            var rowIndex = e.component.getRowIndexByKey(change.key);
            var row = rows[rowIndex];
            var objRowData=row.data;
            var cmdStatus=(change.type!=='remove');
            if(!seft.menuConfig.table)
              seft.menuConfig.table=[];
            if (cmdStatus) {
              if(change.type==="insert")
              {
                objRowData["id"]=seft.guid("");
                // seft.menuConfig.table.push(objRowData);
              }
              else
              {
                var idxF=seft.menuConfig.table.findIndex((obj) => {
                    return obj.id === objRowData.id;
                });
                if(idxF!==-1)
                  seft.menuConfig.table[idxF]=objRowData;
              }
            }
            else
            {
              var idxF=seft.menuConfig.table.findIndex((obj) => {
                    return obj.id === objRowData.id;
              });
              if(idxF!==-1)
                seft.menuConfig.table.splice(idxF, 1);
            }
            e.cancel = false;
          }
          else
            e.cancel = true;
        },
        editCellTemplate: function (itemElement, cellInfo) {  
          ($("<textarea>", { "id": "ckpeditorTrigger"+seft.m_configs.id, "val": cellInfo.value })).appendTo(itemElement);  
          $("<script>").append(CKEDITOR.replace("ckpeditorTrigger"+seft.m_configs.id)).appendTo(itemElement);  
          $("<script>").append(CKEDITOR.instances["ckpeditorTrigger"+seft.m_configs.id].on("change", function () {cellInfo.setValue(CKEDITOR.instances["ckpeditorTrigger"+seft.m_configs.id].getData())})).appendTo(itemElement); 
        },
        columns:[{
          type: 'buttons',
          width: 110,
          fixed: true,
          fixedPosition: "right",
          buttons: ['edit', 'delete', {
            hint: 'Nhân bản',
            icon: 'copy',
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
        }].concat(seft.dataFields)
      };
      setTimeout(function(){
        $('#tableConfig'+seft.m_configs.id).dxDataGrid(dxDGridObj);
        $('#tableConfig'+seft.m_configs.id).dxDataGrid('instance');
      },200);
      var handleFileSelect = function(evt) {
        var e_id=evt.target.getAttribute("name");
        const file = evt.target.files[0];
        // Encode the file using the FileReader API
        const reader = new FileReader();
        reader.onloadend = () => {
            // Use a regex to remove data url part
          const base64String = reader.result;
          seft.menuConfig[e_id]=base64String;
          if(document.querySelector('#context-'+seft.m_configs.id+' a[name="'+e_id+'"]'))
            document.querySelector('#context-'+seft.m_configs.id+' a[name="'+e_id+'"]').remove();
          var a = document.createElement('a');
          a.target="_blank";
          a.href = base64String;
          a.download = file.name;
          a.textContent = 'Download '+file.name;
          a.name = e_id;
          document.querySelector('#context-'+seft.m_configs.id+' input[name="'+e_id+'"]').parentNode.appendChild(a);
        };
        reader.readAsDataURL(file);
      };

      if (window.File && window.FileReader && window.FileList && window.Blob) {
        document.querySelectorAll('#context-'+seft.m_configs.id+' input[type="file"]').forEach(function(el){
          if(el.getAttribute("name"))
            el.addEventListener('change', handleFileSelect, false);
        });
      } else {
          thongbao('The File APIs are not fully supported in this browser.');
      }
      this.EnterToTab();
      // LoadPage();
    },
    template:`
        <div class="row">
          <div class="col-12">
            <!-- Main content -->
            <div class="invoice p-3 mb-3">
              <div class="row invoice-info">
                <div class="form-group text-left col-md-4" :class="1*h.f_show==0?'d-none': ''" v-for="h in dHeader" :key="h.f_name">
                  <label :for="h.f_name">{{h.f_header}}
                  </label>
                  <input v-model="menuConfig[h.f_name]" v-if="h.f_types!='file' && h.f_types!='select' && h.f_types!='check'" type="text" class="form-control form-control-border" :class="h.f_types" :id="h.f_name"/>
                  <input v-model="menuConfig[h.f_name]" v-if="h.f_types=='check'" type="checkbox" class="form-check" :id="h.f_name"/>
                  <input v-if="h.f_types=='file'" type="file" class="form-control form-control-border" :class="h.f_types" :id="h.f_name"/>
                  <a v-if="h.f_types=='file' && menuConfig[h.f_name]" :href="menuConfig[h.f_name]" :name="h.f_name" target="_blank" download="download">Download</a>
                  <select v-model="menuConfig[h.f_name]" v-if="h.f_types=='select'" type="text" class="form-control form-control-border" :class="h.f_types" :id="h.f_name">
                    <option v-for="k in getOptionsSelect(h.f_cbo_query)" :value="k.ma">
                      {{ k.ten }}
                    </option>
                  </select>
                </div>
              </div>
              <!-- /.row -->
              <!-- Table row -->
              <div class="row" style="display:block">
                <div class="card card-primary card-outline">
                  <div class="card-header p-0 pt-1">
                    <ul class="nav nav-tabs" role="tablist">
                      <li class="nav-item">
                        <a class="nav-link active" :id="'tables-tab'+m_configs.id" data-toggle="pill" :href="'#tab-tables'+m_configs.id" role="tab" :aria-controls="'tab-tables'+m_configs.id" aria-selected="true">Trường dữ liệu</a>
                      </li>
                      <li class="nav-item">
                        <a class="nav-link" :id="'triggers-tab'+m_configs.id" data-toggle="pill" :href="'#tab-triggers'+m_configs.id" role="tab" :aria-controls="'tab-triggers'+m_configs.id" aria-selected="false">Thiết lập công thức</a>
                      </li>
                    </ul>
                  </div>
                  <div class="card-body">
                    <div class="tab-content">
                      <div class="tab-pane fade show active" :id="'tab-tables'+m_configs.id" role="tabpanel" aria-labelledby="tables-tab" style="padding: 15px;border: 1px solid;border-radius: 9px;">
                        <div class="customFormEdit">
                        </div>
                        <div name="details" :id="'tableConfig'+m_configs.id" class="table table-hover table-bordered cell-border">

                        </div>
                      </div>
                      <div class="tab-pane fade" :id="'tab-triggers'+m_configs.id" role="tabpanel" :aria-labelledby="'triggers-tab'+m_configs.id">
                        <div class="input-group mb-3">
                          <select v-model="selectTrigger" class="form-control" :id="'tagetTrigger'+m_configs.id" style="width:50%" @change="menuTrigger">
                            <option value="datacolumntemplate">Mẫu cột hiển thị</option>
                            <option value="datarowtemplate">Mẫu dòng hiển thị</option>
                            <option value="filter">Lọc dữ liệu đầu vào</option>
                            <option value="update">Khi thêm & sửa dữ liệu</option>
                            <option value="barcode">Khi quét barcode</option>
                            <option value="load_db">Xử lý CSDL Cho Bảng</option>
                            <option value="report_db">Xử lý CSDL Cho Báo cáo</option>
                            <option value="update_db">Xử lý CSDL Khi cập nhật</option>
                            <option value="delete_db">Xử lý CSDL Khi xóa</option>
                          </select>
                          <div class="input-group-append">
                            <button @click="saveTrigger" class="btn btn-success"><i class="fa fa-save"></i></button>
                          </div>
                        </div>
                        <textarea :id="'editorTrigger'+m_configs.id" name="editor"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- /.col -->
              </div>
              <!-- /.row -->
              <div class="row">
                <div class="form-group text-left col-md-4" :class="1*f.f_show==0?'d-none': ''" v-for="f in dFooter" :key="f.f_name">
                  <label :for="f.f_name">{{f.f_header}}
                  </label>
                  <input v-model="menuConfig[f.f_name]" v-if="f.f_types!='file' && f.f_types!='select' && f.f_types!='check'" type="text" class="form-control form-control-border" :class="f.f_types" :id="f.f_name"/>
                  <input v-model="menuConfig[f.f_name]" v-if="f.f_types=='check'" type="checkbox" class="form-check" :id="f.f_name"/>
                  <input v-if="f.f_types=='file'" type="file" class="form-control form-control-border" :class="f.f_types" :name="f.f_name"/>
                  <a v-if="f.f_types=='file' && menuConfig[f.f_name]" :href="menuConfig[f.f_name]" target="_blank" :name="f.f_name" download="download">Download</a>
                  <button v-if="f.f_types=='file' && menuConfig[f.f_name]" @click="menuConfig[f.f_name]=''" class="btn btn-danger"><i class="fas fa-trash"></i></button>
                  <select v-model="menuConfig[f.f_name]" v-if="f.f_types=='select'" class="form-control form-control-border" :class="f.f_types" :id="f.f_name">
                    <option v-for="k in getOptionsSelect(f.f_cbo_query)" :value="k.ma">
                      {{ k.ten }}
                    </option>                  
                  </select>
                </div>
              </div>
              <!-- /.row -->
              <div class="btn-toolbar mb-3" role="toolbar" aria-label="Toolbar with button groups">
                <button @click="SaveConfig" type="button" class="btn btn-success float-right"><i class="fas fa-save"></i>
                  Lưu thay đổi
                </button>
              </div>
              <div class="btn-toolbar mb-3" role="toolbar" aria-label="Toolbar with button groups">
                <button @click="AutoConfig" type="button" class="btn btn-warning float-right"><i class="fa fa-car"></i>
                  Đưa cấu trúc động vào
                </button>
              </div>
            </div>
            <!-- /.invoice -->
          </div><!-- /.col -->
        </div><!-- /.row -->
`,style:`
.row {
  margin: 0px;
}
.invoice {
    border:none;
}
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
.CodeMirror {
  height: 300px !important;
}
.CodeMirror pre{
  padding-left: 39px;
}
.cm-s-monokai .CodeMirror-linenumber{
  background-color: gray;
}
`
}