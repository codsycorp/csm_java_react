{
    name:"vn369_kqxs",
    props: ['xoa_dau'],
    data:function(){
      var seft=this;
      return {
        unlock:false,
        ctrTuNgay:false,
        ctrDenNgay:false,
        ctrMien:false,
        ctrGridKQ:false,
        ctrLoaiTim:false,
        ctrThuTuan:false,
        ctrProgress:false,
        ctrSapXep:false,
        ctrSoKy:false,
        ctrLaySoKy:false,
        ctrDemBH:false,
        ctrKXHPLH:false,
        ctrDemPNH:false,
        ctrDemTNH:false,
        ctrDemCLH:false,
        ctrSoChu:false,
        ctrChonDai:false,
        ctrChonDaiSoChu:false,
        ctrChonMau:false,
        total_progress:0,
        time_progress:false,
        curent_progress:0,
        ctrThongKe:false,
        isXemthuong:true,
        danh_sach_dai:[],
        du_lieu_dai_mien:{},
        du_lieu_thong_ke:{},
        du_lieu_thong_ke_so_chu:{},
        ds_dai_chon:[],
        ds_dai_chon_xem_ket_qua:[],
        ds_dai_chon_so_chu:[],
        xu_ly_ket_qua:[],
        ds_thu:[
          {"ma":"T2","ten":"Thứ 2"},
          {"ma":"T3","ten":"Thứ 3"},
          {"ma":"T4","ten":"Thứ 4"},
          {"ma":"T5","ten":"Thứ 5"},
          {"ma":"T6","ten":"Thứ 6"},
          {"ma":"T7","ten":"Thứ 7"},
          {"ma":"CN","ten":"Chủ Nhật"}
        ],
        chon_mau:'',
        thu_tuan:'',
        sap_xep:0,
        loai_tim:0,
        loai_tk:2,
        so_ky:28,
        lay_so_ky:5,
        dem_be_hon:0,
        dem_nho_hon:0,
        dem_lon_hon:0,
        dem_to_nho_hon:0,
        ls_bat_dau:5,
        kxh_phai_lonhon:0,
        kxh_tu:2,
        kxh_den:4,
        kxh_locsau:true,
        so_chu:[],
        mien:'MN',
        den_ngay:dateFormat(new Date(),'dd/mm/yyyy'),
        tu_ngay:CongNgay(dateFormat(new Date(),'dd/mm/yyyy'),-4*365,"dd/mm/yyyy"),
        days:['CN','T2','T3','T4','T5','T6','T7']
      };
    },
    created:function(){
      var seft=this;
      window.checkJQuery=setInterval(function(){
        if(window.hasOwnProperty('$'))
          clearInterval(checkJQuery);
        else
          return;
        seft.ctrProgress = $('#progressBarStatus').dxProgressBar({
          min: 0,
          max: 100,
          width: '100%',
          elementAttr: {
            'aria-label': 'Tải Kết Quả',
          },
          statusFormat(ratio) {
            if(ratio!=1)
              return `Đang tải kết quả xổ số: ${ratio * 100}%`;
            else
              return 'Đã cập nhật kết quả xong';
          },
          onComplete(e) {
            e.element.addClass('complete');
          },
        }).dxProgressBar('instance');
        seft.ctrSoKy=$('#so_ky').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.so_ky=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrSoKy.option('value', 28);
        seft.ctrLaySoKy=$('#lay_so_ky').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.lay_so_ky=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrLaySoKy.option('value', 5);
        seft.ctrDemBH=$('#dem_be_hon').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.dem_be_hon=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrDemBH.option('value', 5);
        seft.ctrKXHPLH=$('#kxh_phai_lonhon').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.kxh_phai_lonhon=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrKXHtu=$('#kxh_tu').dxNumberBox({
          showClearButton: true,
          showSpinButtons: true,
          value:seft.kxh_tu,
          onValueChanged(data) {
            seft.kxh_tu=data.value;
          },
        }).dxNumberBox('instance');
        seft.ctrKXHden=$('#kxh_den').dxNumberBox({
          showClearButton: true,
          showSpinButtons: true,
          value:seft.kxh_den,
          onValueChanged(data) {
            seft.kxh_den=data.value;
          },
        }).dxNumberBox('instance');
        seft.ctrKXHlocsau=$('#kxh_locsau').dxCheckBox({
          value:seft.kxh_locsau,
          onValueChanged(data) {
            seft.kxh_locsau=data.value;
          },
        }).dxCheckBox('instance');
        seft.ctrKXHPLH.option('value', 7);
        seft.ctrDemPNH=$('#dem_nho_hon').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.dem_nho_hon=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrDemPNH.option('value', 5);
        seft.ctrDemTNH=$('#dem_to_nho_hon').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.dem_to_nho_hon=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrDemLSBD=$('#ls_bat_dau').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.ls_bat_dau=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrDemLSBD.option('value',seft.ls_bat_dau);
        seft.ctrDemCLH=$('#dem_lon_hon').dxNumberBox({
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
              seft.dem_lon_hon=data.value;
            },
        }).dxNumberBox('instance');
        seft.ctrDemCLH.option('value', 5);
        seft.ctrSoChu = $('#so_chu').dxTextBox({
            mask: "99-99-99-99-99-99-99-99-99", // 99 thay vì 00 để chấp nhận cả số 0-99
            maskChar: "_",
            showMaskMode: "always",
            showClearButton: true,
            showSpinButtons: true,
            onValueChanged(data) {
                let value = data.value.replace(/\D/g, ""); // Chỉ giữ số
                let numbers = value.match(/\d{1,2}/g) || []; // Tách thành nhóm 2 số
                let uniqueNumbers = new Set(); // Set để loại bỏ số trùng
                let formattedNumbers = [];

                for (let num of numbers) {
                    num = num.padStart(2, "0"); // Bổ sung '0' nếu thiếu số
                    if (!uniqueNumbers.has(num) && parseInt(num, 10) <= 99) {
                        uniqueNumbers.add(num);
                        formattedNumbers.push(num);
                    }
                }

                let formattedValue = formattedNumbers.join("-");
                // console.log(formattedNumbers); // Debug danh sách số đã nhập
                seft.so_chu = formattedNumbers;
                data.component.option("value", formattedValue); // Cập nhật giá trị hiển thị
            }
        }).dxTextBox('instance');

        seft.ctrSoChu.option('value', '');
        seft.ctrThuTuan=$('#thu_tuan').dxSelectBox({
          dataSource:seft.ds_thu,
          readOnly: true,
          displayExpr: 'ten',
          valueExpr: 'ma',
        }).dxSelectBox("instance");
        seft.ctrThuTuan.option('value',seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()]);
        seft.ctrChonMau=$('#chon_mau').dxColorBox({
          onValueChanged: function (e) {
            seft.chon_mau= e.value;
            seft.setCookie('chon_mau',seft.chon_mau,365);
          }
        }).dxColorBox("instance");
        seft.ctrChonMau.option('value',seft.getCookie('chon_mau')?seft.getCookie('chon_mau'):'#f0bb41');
        seft.ctrChonDai=$('#chon_dai').dxTagBox({
          dataSource: [],
          inputAttr: { 'aria-label': 'Chọn Các Đài' },
          displayExpr: 'label',
          valueExpr: 'stt',
          onValueChanged: function (e) {
            const previousValues = e.previousValue;
            const newValues = e.value;
            var dai_chon=newValues;
            seft.ds_dai_chon=newValues;
          }
        }).dxTagBox("instance");
        seft.ctrChonDaiSoChu=$('#chon_dai_so_chu').dxTagBox({
          dataSource: [],
          displayExpr: 'label',
          valueExpr: 'stt',
          onValueChanged: function (e) {
            const previousValues = e.previousValue;
            const newValues = e.value;
            var dai_chon=newValues;
            seft.ds_dai_chon_so_chu=newValues;
          }
        }).dxTagBox("instance");
        seft.ctrSapXep=$('#sap_xep').dxSelectBox({
          dataSource: [
            {"ma":0,"ten":"Ngày mới đứng trước"},
            {"ma":1,"ten":"Ngày cũ đứng trước"}
          ],
          inputAttr: { 'aria-label': 'Sắp Xếp Chu Kỳ' },
          displayExpr: 'ten',
          valueExpr: 'ma',
          onValueChanged(data) {
            seft.sap_xep=data.value;
          },
          value:0
        }).dxSelectBox("instance");
        seft.ctrSapXep.option('value', 1);
        seft.ctrloai_tk=$('#loai_tk').dxSelectBox({
          dataSource: [
            {"ma":1,"ten":"Thống kê KQ 1 Đài"},
            {"ma":2,"ten":"Thống kê KQ 2 Đài"},
            {"ma":3,"ten":"Thống kê KQ 3 Đài"}
          ],
          displayExpr: 'ten',
          valueExpr: 'ma',
          onValueChanged(data) {
            seft.loai_tk=data.value;
            // seft.lay_ds_dai();
          },
        }).dxSelectBox("instance");
        seft.ctrloai_tk.option('value', 2);
        seft.ctrLoaiTim=$('#loai_tim').dxSelectBox({
          dataSource: [
            {"ma":0,"ten":"Theo Ngày"},
            {"ma":1,"ten":"Theo Kỳ"}
          ],
          displayExpr: 'ten',
          valueExpr: 'ma',
          onValueChanged(data) {
            seft.loai_tim=data.value;
            seft.lay_ds_dai();
          },
        }).dxSelectBox("instance");
        seft.ctrLoaiTim.option('value', 1);
        seft.ctrMien=$('#mien').dxSelectBox({
          dataSource: [
            {"ma":"MN","ten":"Miền Nam"},
            {"ma":"MT","ten":"Miền Trung"},
            {"ma":"MB","ten":"Miền Bắc"}
          ],
          inputAttr: { 'aria-label': 'Chọn Miền' },
          displayExpr: 'ten',
          valueExpr: 'ma',
          onValueChanged(data) {
            if(data.value)
            {
              seft.mien=data.value;
              seft.lay_ds_dai();
            }
          },
          value:seft.mien
        }).dxSelectBox("instance");
        seft.ctrTuNgay=$('#fdate').dxDateBox({
          type: 'date',
          elementAttr: {class: "date"},
          displayFormat: 'dd/MM/yyyy',
          // mask: 'X0/X0/X000',
          // maskRules: { X: /[0-9]/ },
          onValueChanged: function (e) {
            if(typeof e.value ==='string')
              e.value=chuyenNgay(e.value,"dd/mm/yyyy");
            seft.tu_ngay=dateFormat(e.value,"dd/mm/yyyy");
            seft.ctrDenNgay.option('min', typeof seft.tu_ngay ==='string'?chuyenNgay(seft.tu_ngay,"dd/mm/yyyy"):seft.tu_ngay);
          },
          value: typeof seft.tu_ngay ==='string'?chuyenNgay(seft.tu_ngay,"dd/mm/yyyy"):seft.tu_ngay,
          max: typeof seft.den_ngay ==='string'?chuyenNgay(seft.den_ngay,"dd/mm/yyyy"):seft.den_ngay,
          inputAttr: { 'aria-label': 'Từ Ngày' },
        }).dxDateBox("instance");

        seft.ctrDenNgay=$('#tdate').dxDateBox({
          type: 'date',
          elementAttr: {class: "date"},
          // mask: 'X0/X0/X000',
          // maskRules: { X: /[0-9]/ },
          displayFormat: 'dd/MM/yyyy',
          onValueChanged: function (e) {
            if(typeof e.value ==='string')
              e.value=chuyenNgay(e.value,"dd/mm/yyyy");
            seft.den_ngay=dateFormat(e.value,"dd/mm/yyyy");
            seft.ctrTuNgay.option('max', typeof seft.den_ngay ==='string'?chuyenNgay(seft.den_ngay,"dd/mm/yyyy"):seft.den_ngay);
            seft.thu_tuan=seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()];
            seft.ctrThuTuan.option('value',seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()]);
            seft.lay_ds_dai();
          },
          value: typeof seft.den_ngay ==='string'?chuyenNgay(seft.den_ngay,"dd/mm/yyyy"):seft.den_ngay,
          min: typeof seft.tu_ngay ==='string'?chuyenNgay(seft.tu_ngay,"dd/mm/yyyy"):seft.tu_ngay,
          inputAttr: { 'aria-label': 'Đến Ngày' },
        }).dxDateBox("instance");
      },500);
      const queryString = window.location.search;
      const urlParams = new URLSearchParams(queryString);
      const unlock = urlParams.get('unlock');
      if(unlock)
        seft.unlock=true;
      // seft.csm_obj_tables({app_id:"kqxs",obj_name:"kqxs_lichxoso",ex_where:"lambda obj:  obj['mien']=='"+seft.mien+"' and  obj['thu']=='"+seft.chon_thu+"'"},function(rs){
      //   seft.danh_sach_dai=rs.rows.sort((a,b)=>a.stt-b.stt);
      //   seft.ctrChonDai.option('dataSource',seft.danh_sach_dai);
      // });
      seft.csm_obj_tables({app_id:"kqxs",obj_name:"kqxs_lichxoso",e_where:{"field": "id","type": "like","value": ""}},function(rs){
        seft.danh_sach_dai=rs.rows.sort((a,b)=>(a.mien+"_"+a.thu+"_"+a.stt)-(b.mien+"_"+b.thu+"_"+b.stt));
        seft.thu_tuan=seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()];
        window.checkJQueryCon=setInterval(function(){
          if(window.hasOwnProperty('$'))
            clearInterval(checkJQueryCon);
          else
            return;
          seft.lay_ds_dai();
        },1200);
      });
      var seft=this;
      var soNgay=3;
      seft.total_progress=soNgay;
      seft.curent_progress=soNgay;
      seft.time_progress=setInterval(function(){
        if(seft.curent_progress>=0)
        {
          var ngay_xo=CongNgay(seft.den_ngay,-1*seft.curent_progress,"dd/mm/yyyy");
          seft.cap_nhat(chuyenNgay(ngay_xo));
          seft.curent_progress--;
          seft.ctrProgress.option('value', Math.round(((seft.total_progress-seft.curent_progress)/seft.total_progress) * 100));
        }
        else
          clearInterval(seft.time_progress);
      }, 1000);
      // seft.cap_nhat(chuyenNgay(dateFormat(new Date(),'dd/mm/yyyy')));
      // setTimeout(function(){
      //   seft.ctrProgress.option('value', 100);
      // },500);
    },
    methods:{
      setCookie:function(name,value,days) {
          var expires = "";
          if (days) {
              var date = new Date();
              date.setTime(date.getTime() + (days*24*60*60*1000));
              expires = "; expires=" + date.toUTCString();
          }
          document.cookie = name + "=" + (value || "")  + expires + "; path=/";
      },
      getCookie:function(name) {
          var nameEQ = name + "=";
          var ca = document.cookie.split(';');
          for(var i=0;i < ca.length;i++) {
              var c = ca[i];
              while (c.charAt(0)==' ') c = c.substring(1,c.length);
              if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
          }
          return null;
      },
      getUniqueCombinations:function(array, size) {
          // Hàm đệ quy để tạo tổ hợp
          function combine(arr, start, currentCombo) {
              if (currentCombo.length === size) {
                  result.push([...currentCombo]);
                  return;
              }
              for (let i = start; i < arr.length; i++) {
                  currentCombo.push(arr[i]);
                  combine(arr, i + 1, currentCombo);
                  currentCombo.pop();
              }
          }
          const result = [];
          combine(array, 0, []);
          return result;
      },
      thong_ke_moi:function(){
        // seft.kxh_phai_lonhon;
        // seft.dem_to_nho_hon
        var seft=this;
        if(seft.ds_dai_chon.length===0)
          return canhbao("Vui lòng Chọn Đài trước");
        else if(TruNgayRaSoNgay(seft.den_ngay,seft.tu_ngay,"dd/mm/yyyy")<28)
          return canhbao("Vui lòng lại thời gian dài hơn 28 ngày");
        if(seft.ds_dai_chon.length<seft.loai_tk)
          return canhbao("Vui lòng chọn thêm đài cần xem cho Chọn Đài");
        seft.isXemthuong=false;
        if(seft.ctrThongKe)
        {
          $("#thong_ke").dxTabPanel("dispose");
          seft.ctrThongKe=false;
        }
        setTimeout(function(){
          var xu_ly_items=[];
          // seft.du_lieu_dai_mien[seft.mien]['data'].filter()
          /**** Tìm theo kỳ ****/
          var mang_dl_dai={};
          var ds_dai_chon=[];
            if(seft.loai_tim===0)
            {
              seft.ds_dai_chon.forEach(function(STT){
                ds_dai_chon.push({stt:1*STT,dai:seft.mien+STT,ten_dai:seft.mien+STT})
                seft.du_lieu_dai_mien[seft.mien]['data'].filter(dm=>1*dm.stt===1*STT).forEach(function(dlD){
                  var obRow=JSON.parse(JSON.stringify(dlD.data.filter(d=>d.thu===dlD.thu)));
                  if(!mang_dl_dai[1*STT])
                    mang_dl_dai[1*STT]=obRow;
                  else
                    mang_dl_dai[1*STT]=mang_dl_dai[1*STT].concat(obRow);
                });
              });
            }
            else
            {
              seft.ds_dai_chon.forEach(function(STT){
                var dlD=seft.du_lieu_dai_mien[seft.mien]['data'].find(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan);
                if(dlD){
                  var obRow=JSON.parse(JSON.stringify(dlD.data.filter(kq=>kq.thu===seft.thu_tuan)));
                  ds_dai_chon.push({stt:1*STT,dai:dlD.ten_dai,ten_dai:dlD.ten_dai});
                  mang_dl_dai[1*STT]=obRow;
                }
              });
            }
          // console.log(mang_dl_dai);
          var mang_dai=Object.keys(mang_dl_dai);
          var ds_dai_chonN=JSON.parse(JSON.stringify(ds_dai_chon));
          var mang_cac_dai=seft.getUniqueCombinations(mang_dai,1*seft.loai_tk);
          mang_cac_dai.forEach(function(lstDai){
            var stt="",dai="",ten_dai="";
            if(seft.loai_tim===0)
            {
              lstDai.forEach(function(iDai){
                stt+=(stt?"&":"")+iDai;
                dai+=(dai?"&":seft.mien+" ")+iDai;
                ten_dai+=(ten_dai?"&":seft.mien+" ")+iDai;
              });
              ds_dai_chonN.push({stt:stt,dai:dai,ten_dai:ten_dai});
            }
            else if(lstDai.length>1)
            {
              lstDai.forEach(function(iDai){
                var csdai=ds_dai_chon.find(d=>1*d.stt===1*iDai);
                stt+=(stt?"&":"")+iDai;
                dai+=(dai?"&":seft.mien+" ")+iDai;
                ten_dai+=(ten_dai?" & ":seft.mien+" ")+csdai.ten_dai;
              });
              ds_dai_chonN.push({stt:stt,dai:dai,ten_dai:ten_dai});
            }
          });
          ds_dai_chonN.forEach(function(o){
              xu_ly_items.push({id:o.stt,text:o.dai,ketqua:false,ten_dai:o.ten_dai});
              if(o.stt!=='lich_su_so_chu')
                xu_ly_items.push({id:"kq_"+o.stt,text:'KQ '+o.dai,ketqua:true,ten_dai:o.ten_dai});
            });
          var cotDong=[],defaul_val={};
          var mang_ky=[];
          if(seft.sap_xep===0)
          {
            for(var k=0;k<seft.so_ky;k++)
            {
              var field='k_'+(k+1);
              mang_ky.push(field);
              defaul_val[field]='';
              cotDong.push({caption: k+1,dataType: 'number',dataField: 'k_'+(k+1),width:40});
            }
          }
          else
          {
            for(var k=seft.so_ky;k>0;k--)
            {  
              var field='k_'+k;
              mang_ky.push(field);
              defaul_val[field]='';
              cotDong.push({caption: k,dataType: 'number',dataField: 'k_'+k,width:40});
            }
          }
          seft.ctrThongKe = $('#thong_ke').dxTabPanel({
            dataSource: xu_ly_items,
            selectedItem: xu_ly_items[0],
            animationEnabled: false,
            scrollingEnabled: true,
            scrollByContent: true,
            showNavButtons: true,
            swipeEnabled: false,
            deferRendering: true,
            repaintChangesOnly: true,
            itemTitleTemplate: function (itemData, itemIndex, itemElement) {
              itemElement.append("<span class='text-bold'>" + itemData.text + "</span>");
            },
            itemTemplate: function (itemData, itemIndex, itemElement) {
              /***Phần Lọc kết quả từ số liệu thống kê***/
              var hien_kq=itemData.ketqua;
              /***Phần xử lý số liệu thống kê***/
              var dsThongKe=[],dsDataT1=[],dsDataT2=[],dsDataT3=[],dsDataALL=[];
              // console.log(bang);
              for(var s=0;s<100;s++)
              {
                var obj={};
                obj['id']=seft.guid('kqxs');
                obj['dem']=0;
                obj['tong']=0;
                obj['chua_ra']=0;
                obj['lich_su']=0;
                obj['so']=s.toString().padStart(2,'0');
                obj=Object.assign(obj,defaul_val);
                dsThongKe.push(obj);
              }
              /** Lưu ý sắp xếp ngày cho đúng cài đặt**/
              var id_kq=itemData.id.toString();
              if(hien_kq)
                id_kq=id_kq.replace(RegExp('kq_','g'),'');
              // console.log(mang_dl_dai);
              id_kq.split(RegExp('&','g')).forEach(function(STT){
                var bang=mang_dl_dai[1*STT].filter(function(obj){
                  return chuyenNgay(obj.field_ngay,"yyyymmdd")>=chuyenNgay(seft.tu_ngay,"dd/mm/yyyy") && chuyenNgay(obj.field_ngay,"yyyymmdd")<chuyenNgay(seft.den_ngay,"dd/mm/yyyy")
                }).sort(function(a,b){
                  return chuyenNgay(b.field_ngay,"yyyymmdd")-chuyenNgay(a.field_ngay,"yyyymmdd")
                });
                var so_ky=0;
                /***Đếm kết quả***/
                bang.reduce((acc, item) => {
                  if (!acc.some(obj => obj.field_ngay === item.field_ngay)) {
                      acc.push(item);
                  }
                  return acc;
                }, []).forEach(function(kq){
                  so_ky++;
                  if(so_ky<=seft.so_ky)
                  {
                    Object.keys(kq).forEach(function(tk){
                      if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                      {
                        var so=kq[tk].trim().substr(kq[tk].trim().length-2,2);
                        var timIDXSo=dsThongKe.findIndex(obj=>obj['so']===so);
                        if(timIDXSo!==-1)
                        {
                          var newObj=JSON.parse(JSON.stringify(dsThongKe[timIDXSo]))
                          if(!newObj['k_'+so_ky])
                            newObj['k_'+so_ky]=1;
                          else
                            newObj['k_'+so_ky]++;
                          // console.log(newObj);
                          dsThongKe[timIDXSo]=newObj;
                        }
                      }
                    });
                  }
                });
                /***Xong Đếm kết quả***/
              });
              /***Tính kết quả tổng***/
              for(var i=0;i<dsThongKe.length;i++)
              {
                var dem=0,tong=0,kxh_ht=0,kxh_ln=0;
                dsThongKe[i]['thoa_man']=false;
                var khoi_dong=-1;
                var so_lan=0;
                var so_lan_trung=0;
                var xet_tiep=true;
                var bieu_dien='';
                var ra_tiep=0;
                for(var k=0;k<mang_ky.length;k++)
                {
                  var kq=dsThongKe[i][mang_ky[k]];
                  // if(dsThongKe[i]['so']==="22"||dsThongKe[i]['so']==="23"||dsThongKe[i]['so']==="94")
                  //   console.log(dsThongKe[i]['so'],k,mang_ky[k],kq);
                  if(1*kq>0)
                  {
                    tong+=1*kq;
                    dem++;
                    if(kxh_ht>kxh_ln)
                      kxh_ln=kxh_ht;
                    ra_tiep++;
                    if(kxh_ht===0 && khoi_dong===-1)
                      xet_tiep=false;
                    if(khoi_dong===-1)
                      khoi_dong=kxh_ht;
                    if(xet_tiep && kxh_ht>0)
                    {
                      if(kxh_ht<=khoi_dong)
                      {
                        so_lan++;
                        if(kxh_ht===khoi_dong)
                          so_lan_trung++;
                      }
                      else
                      {
                        dsThongKe[i]['kxh_sc']=kxh_ht;
                        xet_tiep=false;
                      }
                      bieu_dien+=(bieu_dien?',':'')+kxh_ht;
                      // console.log(dsThongKe[i]['so']+" đang kxh "+kxh_ht+" xuất phát từ "+khoi_dong+" số lần hiện tại "+so_lan);
                    }
                    kxh_ht=0;
                  }
                  else 
                  {
                    if(xet_tiep)
                      for(var rt=0;rt<ra_tiep-1;rt++)
                        bieu_dien+=(bieu_dien?',0':'0');
                    ra_tiep=0;
                    kxh_ht++;
                  }
                  if(k===mang_ky-1&&kxh_ht>kxh_ln)
                    kxh_ln=kxh_ht;
                }
                // if(dsThongKe[i]['so']==="22"||dsThongKe[i]['so']==="23"||dsThongKe[i]['so']==="94")
                //   console.log(dsThongKe[i]['so'],khoi_dong,so_lan,bieu_dien);
                dsThongKe[i]['thoa_man']=(khoi_dong>=1*seft.kxh_tu && khoi_dong<=1*seft.kxh_den && so_lan>1);
                if(seft.kxh_locsau && so_lan_trung<=1)
                  dsThongKe[i]['thoa_man']=false;
                // if(dsThongKe[i]['thoa_man'])
                // {
                //   console.log("Số:"+dsThongKe[i]['so']+" lich su:"+bieu_dien+" Số lần "+so_lan+" Kỳ cuối "+dsThongKe[i]['kxh_sc'])
                // }
                // seft.kxh_phai_lonhon;
                // seft.dem_to_nho_hon
                dsThongKe[i]['dem']=dem;
                dsThongKe[i]['bieu_dien']=bieu_dien;
                dsThongKe[i]['tong']=tong;
                dsThongKe[i]['kxh']=khoi_dong>0?khoi_dong:0;
                dsThongKe[i]['lich_su']=kxh_ln;
              }
              if(!itemData.id.toString().startsWith('kq_'))
              {
                var colGrid=[];
                var tieu_de=itemData.ten_dai.replace('KQ ','')+(1*seft.dem_lon_hon>0 && seft.so_chu.length>0?'('+seft.so_chu.join('-')+')':'');
                colGrid=[{
                  caption: tieu_de,
                  fixed: true,
                  alignment:'center',
                  headerCellTemplate(container) {
                    container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
                    // container.append($('<div>Area, km<sup>2</sup></div>'));
                  },
                  // dataField: 'cac_dai',
                  columns: [
                    {
                      caption: 'Tổng',
                      dataField: 'tong',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số Lần',
                      dataField: 'dem',
                      dataType: 'number',
                    },

                    {
                      caption: 'KXH',
                      dataField: 'kxh',
                      dataType: 'number',
                    },
                    {
                      caption: 'Lâu Nhất',
                      dataField: 'lich_su',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số',
                      dataField: 'so',
                      cssClass:'text-bold',
                    }
                  ]
                }].concat(cotDong);
                $('<div>')
                .appendTo(itemElement)
                .dxDataGrid({
                  dataSource:dsThongKe,
                  export: {
                    enabled: true
                  },
                  columnFixing: {
                    enabled: true,
                  },
                  columnAutoWidth:true,
                  sorting: {
                      mode: "none" // or "multiple" | "none"
                  },
                  onRowPrepared: function(info) {
                    if(info.rowType === 'data') {
                      // console.log(info.data)
                      if(info.data['thoa_man'])
                        info.rowElement.addClass("to_mau");
                    }
                  },
                  keyExpr: 'id',
                  width: '100%',
                  export: {
                    enabled: true
                  },
                  paging: {
                    pageSize: 1000,
                  },
                  columns: colGrid,
                  showColumnLines: true,
                  showRowLines: true,
                  showBorders: true,
                });
              }
              else
              {
                var tieu_de=seft.days[chuyenNgay(seft.den_ngay,"dd/mm/yyyy").getDay()]+" "+seft.den_ngay +" "+itemData.ten_dai.replace('KQ ','');
                var colGrid=[{
                  caption: tieu_de,
                  fixed: true,
                  alignment:'center',
                  headerCellTemplate(container) {
                    container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
                    // container.append($('<div>Area, km<sup>2</sup></div>'));
                  },
                  // dataField: 'cac_dai',
                  columns: [
                    {
                      caption: 'Tổng',
                      dataField: 'tong',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số Lần',
                      dataField: 'dem',
                      dataType: 'number',
                    },

                    {
                      caption: 'KXH',
                      dataField: 'kxh',
                      dataType: 'number',
                    },
                    {
                      caption: 'Lâu Nhất',
                      dataField: 'lich_su',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số',
                      dataField: 'so',
                      cssClass:'text-bold',
                    },
                    {
                      caption: 'Kết quả',
                      dataField: 'bieu_dien',
                      cssClass:'text-left',
                    }
                  ]
                }];
                $('<div>')
                .appendTo(itemElement)
                .dxDataGrid({
                  dataSource:dsThongKe.filter(kq=>kq.thoa_man),
                  export: {
                    enabled: true
                  },
                  columnFixing: {
                    enabled: true,
                  },
                  columnAutoWidth:true,
                  sorting: {
                      mode: "none" // or "multiple" | "none"
                  },
                  onRowPrepared: function(info) {
                    if(info.rowType === 'data') {
                      // console.log(info.data)
                      // if(info.data['thoa_man'])
                      //   info.rowElement.addClass("to_mau");
                    }
                  },
                  keyExpr: 'id',
                  width: '100%',
                  export: {
                    enabled: true
                  },
                  paging: {
                    pageSize: 1000,
                  },
                  columns: colGrid,
                  showColumnLines: true,
                  showRowLines: true,
                  showBorders: true,
                });
              }
            },
            onSelectionChanged({ component }) {
            },
          }).dxTabPanel('instance');
        },1000);
        // canhbao("Đang cập nhật bản mới vui lòng thử lại sau!");
      },
      chay_thong_ke:function(){
        var seft=this;
        if(seft.ds_dai_chon.length===0)
          return canhbao("Vui lòng Chọn Đài trước");
        else if(TruNgayRaSoNgay(seft.den_ngay,seft.tu_ngay,"dd/mm/yyyy")<28)
          return canhbao("Vui lòng lại thời gian dài hơn 28 ngày");
        if(seft.ds_dai_chon.length<seft.loai_tk)
          return canhbao("Vui lòng chọn thêm đài cần xem cho Chọn Đài");
        seft.isXemthuong=false;
        if(seft.ctrThongKe)
        {
          $("#thong_ke").dxTabPanel("dispose");
          seft.ctrThongKe=false;
        }
        setTimeout(function(){
          var xu_ly_items=[];
          // seft.du_lieu_dai_mien[seft.mien]['data'].filter()
          /**** Tìm theo kỳ ****/
          var mang_dl_dai={};
          var ds_dai_chon=[],mang_dl_ls_so_chu=[],dl_lichsu=[];
          if(seft.so_chu.length>0 && seft.ds_dai_chon_so_chu.length>0)
          {
            var ten_dai='';
            /***** Kết hợp các bảng cần tìm cho số chủ để tìm lịch sử *****/
            seft.ds_dai_chon_so_chu.forEach(function(STT){
              var dlD=seft.du_lieu_dai_mien[seft.mien]['data'].find(dm=>1*dm.stt===1*STT);
              if(seft.loai_tim===1)
                dlD=seft.du_lieu_dai_mien[seft.mien]['data'].find(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan)
              if(dlD){
                ten_dai+=(ten_dai!==''?' & ':'')+dlD.ten_dai;
                var obRow=JSON.parse(JSON.stringify(dlD.data)).filter(function(obj){
                  if(seft.loai_tim===1 && seft.days[chuyenNgay(obj['field_ngay'].trim(),"yyyymmdd").getDay()]!==seft.thu_tuan)
                    return false;
                  return chuyenNgay(obj.field_ngay.trim(),"yyyymmdd")<chuyenNgay(seft.den_ngay.trim(),"dd/mm/yyyy")
                }).sort(function(a,b){
                  return chuyenNgay(b.field_ngay.trim(),"yyyymmdd")-chuyenNgay(a.field_ngay.trim(),"dd/mm/yyyy")
                });
                if(seft.loai_tim===1)
                  obRow=JSON.parse(JSON.stringify(obRow.filter(kq=>kq.thu===seft.thu_tuan)));
                obRow.forEach(function(objRow){
                  var dong=JSON.parse(JSON.stringify(objRow));
                  dong['thu']=seft.days[chuyenNgay(dong['field_ngay'].trim(),"yyyymmdd").getDay()];
                  var chkIDXRow=mang_dl_ls_so_chu.findIndex(n=>n.field_ngay.trim()===dong.field_ngay.trim());
                  if(chkIDXRow!==-1)
                  {
                    var objNKQ=JSON.parse(JSON.stringify(mang_dl_ls_so_chu[chkIDXRow]));
                    Object.keys(dong).forEach(function(tk){
                      if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                        objNKQ['d_'+STT+'_'+tk]=dong[tk].trim();
                    });
                    mang_dl_ls_so_chu[chkIDXRow]=objNKQ;
                  }
                  else
                  {
                    var objNKQ={};
                    Object.keys(dong).forEach(function(tk){
                      if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                        objNKQ['d_'+STT+'_'+tk]=dong[tk].trim();
                      else
                        objNKQ[tk]=dong[tk].trim();
                    });
                    mang_dl_ls_so_chu.push(objNKQ);
                  }
                });
              }
            });
            if(ten_dai!=='')
              ds_dai_chon.push({stt:'lich_su_so_chu',dai:'Lịch Sử Sổ Chủ',ten_dai:ten_dai});
            /***** Tìm số chủ trong kết quả đài cần tìm để lấy kết quả lên thống kê *****/
            // dl_lichsu
            var ghls=0,max_ls=1*seft.ls_bat_dau,kxh_ngcuoi='',da_gioi_han=false;
            mang_dl_ls_so_chu.sort(function(a,b){
              return chuyenNgay(b.field_ngay.trim(),"yyyymmdd")-chuyenNgay(a.field_ngay.trim(),"yyyymmdd")
            }).forEach(function(kq){
              var lay=false;
              Object.keys(kq).forEach(function(tk){
                if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                {
                  // var so=kq[tk].trim().substr(kq[tk].trim().length-2,2);
                  // if(seft.so_chu===so.trim())
                  if(seft.so_chu.find(so=>kq[tk].trim().endsWith(so)))
                  {
                    lay=true;
                    return;
                  }
                }
              });
              if(lay)
              {
                // console.log(kq['field_ngay'],ghls,kq)
                /**** Lấy chiều dài lịch sử trên 7 kỳ ****/
                if(ghls>=max_ls)
                  // dl_lichsu.push({id:seft.guid('kqxs'),ngay:kq['field_ngay'],so_ky:ghls});
                {
                  if(max_ls===1*seft.ls_bat_dau && !da_gioi_han)
                  {
                    max_ls=ghls;
                    da_gioi_han=true;
                  }
                  dl_lichsu.push({id:seft.guid('kqxs'),ngay:(kxh_ngcuoi?kxh_ngcuoi+' - ':"")+dateFormat(chuyenNgay(kq['field_ngay'],"yyyymmdd"),"dd/mm/yyyy"),so_ky:ghls,stt:dl_lichsu.length+1});
                }
                // kxh_ngcuoi=kq['field_ngay'];
                ghls=0;
              }
              else
              {
                ghls++;
              }
            });
            var kqSoChu=mang_dl_ls_so_chu.filter(function(kq){
              var lay=false;
              Object.keys(kq).forEach(function(tk){
                if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                {
                  seft.ds_dai_chon.forEach(function(STT){
                    if(tk.startsWith('d_'+STT+'_'))
                    {
                      // var so=kq[tk].trim().substr(kq[tk].trim().length-2,2);
                      // if(seft.so_chu===so.trim())
                      if(seft.so_chu.find(so=>kq[tk].trim().endsWith(so)))
                        lay=true;
                    }
                  });
                }
              });
              return lay;
            });
            seft.ds_dai_chon_so_chu.forEach(function(STT){
              var du_lieu_dai_mien=seft.du_lieu_dai_mien[seft.mien]['data'].filter(dm=>1*dm.stt===1*STT)
              if(seft.loai_tim===1)
                du_lieu_dai_mien=seft.du_lieu_dai_mien[seft.mien]['data'].filter(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan);
              du_lieu_dai_mien.forEach(function(dlD){
                var obRow=JSON.parse(JSON.stringify(dlD.data.filter(d=>d.thu===dlD.thu))).filter(function(obj){
                  return chuyenNgay(obj.field_ngay.trim(),"yyyymmdd")<chuyenNgay(seft.den_ngay.trim(),"dd/mm/yyyy")
                }).sort(function(a,b){
                  return chuyenNgay(b.field_ngay.trim(),"yyyymmdd")-chuyenNgay(a.field_ngay.trim(),"yyyymmdd")
                });
                obRow=obRow.filter(objR=>kqSoChu.find(objDC=>objDC['field_ngay'].trim()===objR['field_ngay'].trim()));
                if(!mang_dl_dai[1*STT])
                  mang_dl_dai[1*STT]=obRow;
                else
                  mang_dl_dai[1*STT]=mang_dl_dai[1*STT].concat(obRow);
              });
              if(seft.loai_tim===0)
                ds_dai_chon.push({stt:1*STT,dai:seft.mien+STT,ten_dai:seft.mien+STT});
              else
              {
                var dlDT=seft.du_lieu_dai_mien[seft.mien]['data'].find(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan);
                if(dlDT)
                  ds_dai_chon.push({stt:1*STT,dai:dlDT.ten_dai,ten_dai:dlDT.ten_dai});
                else
                  ds_dai_chon.push({stt:1*STT,dai:seft.mien+STT,ten_dai:seft.mien+STT});
              }
            });
            // console.log(mang_dl_dai);
          }
          else
          {
            if(seft.loai_tim===0)
            {
              seft.ds_dai_chon.forEach(function(STT){
                ds_dai_chon.push({stt:1*STT,dai:seft.mien+STT,ten_dai:seft.mien+STT})
                seft.du_lieu_dai_mien[seft.mien]['data'].filter(dm=>1*dm.stt===1*STT).forEach(function(dlD){
                  var obRow=JSON.parse(JSON.stringify(dlD.data.filter(d=>d.thu===dlD.thu)));
                  if(!mang_dl_dai[1*STT])
                    mang_dl_dai[1*STT]=obRow;
                  else
                    mang_dl_dai[1*STT]=mang_dl_dai[1*STT].concat(obRow);
                });
              });
            }
            else
            {
              seft.ds_dai_chon.forEach(function(STT){
                var dlD=seft.du_lieu_dai_mien[seft.mien]['data'].find(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan);
                if(dlD){
                  var obRow=JSON.parse(JSON.stringify(dlD.data.filter(kq=>kq.thu===seft.thu_tuan)));
                  ds_dai_chon.push({stt:1*STT,dai:dlD.ten_dai,ten_dai:dlD.ten_dai});
                  mang_dl_dai[1*STT]=obRow;
                }
              });
            }
          }
          // console.log(mang_dl_dai);
          var mang_dai=Object.keys(mang_dl_dai);
          var ds_dai_chonN=JSON.parse(JSON.stringify(ds_dai_chon));
          if((seft.lay_so_ky+seft.dem_be_hon+seft.kxh_phai_lonhon+seft.dem_nho_hon>0)||(1*seft.dem_lon_hon>0&&seft.so_chu.length>0))
          {
            var mang_cac_dai=seft.getUniqueCombinations(mang_dai,1*seft.loai_tk);
            mang_cac_dai.forEach(function(lstDai){
              var stt="",dai="",ten_dai="";
              if(seft.loai_tim===0)
              {
                lstDai.forEach(function(iDai){
                  stt+=(stt?"&":"")+iDai;
                  dai+=(dai?"&":seft.mien+" ")+iDai;
                  ten_dai+=(ten_dai?"&":seft.mien+" ")+iDai;
                });
                ds_dai_chonN.push({stt:stt,dai:dai,ten_dai:ten_dai});
              }
              else if(lstDai.length>1)
              {
                lstDai.forEach(function(iDai){
                  var csdai=ds_dai_chon.find(d=>1*d.stt===1*iDai);
                  stt+=(stt?"&":"")+iDai;
                  dai+=(dai?"&":seft.mien+" ")+iDai;
                  ten_dai+=(ten_dai?" & ":seft.mien+" ")+csdai.ten_dai;
                });
                ds_dai_chonN.push({stt:stt,dai:dai,ten_dai:ten_dai});
              }
            });
            ds_dai_chonN.forEach(function(o){
              xu_ly_items.push({id:o.stt,text:o.dai,ketqua:false,ten_dai:o.ten_dai});
              if(o.stt!=='lich_su_so_chu')
                xu_ly_items.push({id:"kq_"+o.stt,text:'KQ '+o.dai,ketqua:true,ten_dai:o.ten_dai});
            });
            // if(1*seft.loai_tk===2)
            // {
            //   for(var b=0;b<mang_dai.length;b++)
            //     for(var b1=b+1;b1<mang_dai.length;b1++)
            //     {
            //       if(seft.loai_tim===0)
            //         ds_dai_chonN.push({stt:mang_dai[b]+"&"+mang_dai[b1],dai:seft.mien+" "+mang_dai[b]+"&"+mang_dai[b1],ten_dai:seft.mien+" "+mang_dai[b]+"&"+mang_dai[b1]});
            //       else
            //       {
            //         var dai1=ds_dai_chon.find(d=>1*d.stt===1*mang_dai[b]);
            //         var dai2=ds_dai_chon.find(d=>1*d.stt===1*mang_dai[b1]);
            //         // console.log(mang_dai[b],dai1,mang_dai[b1],dai2)
            //         if(dai1 && dai2)
            //           ds_dai_chonN.push({stt:mang_dai[b]+"&"+mang_dai[b1],dai:seft.mien+" "+mang_dai[b]+"&"+mang_dai[b1],ten_dai:dai1.ten_dai+" & "+dai2.ten_dai});
            //       }
            //     }
            //   console.log(ds_dai_chonN);
            //   ds_dai_chonN.forEach(function(o){
            //     xu_ly_items.push({id:o.stt,text:o.dai,ketqua:false,ten_dai:o.ten_dai});
            //     if(o.stt!=='lich_su_so_chu')
            //       xu_ly_items.push({id:"kq_"+o.stt,text:'KQ '+o.dai,ketqua:true,ten_dai:o.ten_dai});
            //   });
            // }
          }
          else
            ds_dai_chon.forEach(function(o){
                xu_ly_items.push({id:o.stt,text:o.dai,ketqua:false,ten_dai:o.ten_dai});
            });
          var cotDong=[],defaul_val={};
          if(seft.sap_xep===0)
          {
            for(var k=0;k<seft.so_ky;k++)
            {
              var field='k_'+(k+1);
              defaul_val[field]='';
              cotDong.push({caption: k+1,dataType: 'number',dataField: 'k_'+(k+1),width:40});
            }
          }
          else
          {
            for(var k=seft.so_ky;k>0;k--)
            {  
              var field='k_'+k;
              defaul_val[field]='';
              cotDong.push({caption: k,dataType: 'number',dataField: 'k_'+k,width:40});
            }
          }
          seft.ctrThongKe = $('#thong_ke').dxTabPanel({
            dataSource: xu_ly_items,
            selectedItem: xu_ly_items[0],
            animationEnabled: false,
            scrollingEnabled: true,
            scrollByContent: true,
            showNavButtons: true,
            swipeEnabled: false,
            deferRendering: true,
            repaintChangesOnly: true,
            itemTitleTemplate: function (itemData, itemIndex, itemElement) {
              itemElement.append("<span class='text-bold'>" + itemData.text + "</span>");
            },
            itemTemplate: function (itemData, itemIndex, itemElement) {
              if(itemData.id==='lich_su_so_chu')
              {
                var tieu_de=itemData.ten_dai.replace('KQ ','')+(1*seft.dem_lon_hon>0 && seft.so_chu.length>0?'('+seft.so_chu.join('-')+')':'');
                var colGrid=[{
                  caption: tieu_de,
                  fixed: true,
                  alignment:'center',
                  headerCellTemplate(container) {
                    container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
                    // container.append($('<div>Area, km<sup>2</sup></div>'));
                  },
                  // dataField: 'cac_dai',
                  columns: [
                    {
                      caption: 'Ngày',
                      dataField: 'ngay',
                    },
                    {
                      caption: 'Số Kỳ',
                      dataField: 'so_ky',
                      dataType: 'number',
                    }
                  ]
                }];
                $('<div>')
                .appendTo(itemElement)
                .dxDataGrid({
                  dataSource:dl_lichsu.sort((a,b)=>a.stt-b.stt),
                  export: {
                    enabled: true
                  },
                  columnFixing: {
                    enabled: true,
                  },
                  columnAutoWidth:true,
                  sorting: {
                      mode: "none" // or "multiple" | "none"
                  },
                  keyExpr: 'id',
                  width: '100%',
                  export: {
                    enabled: true
                  },
                  paging: {
                    pageSize: 1000,
                  },
                  columns: colGrid,
                  showColumnLines: true,
                  showRowLines: true,
                  showBorders: true,
                });
                return;
              }
              /***Phần Lọc kết quả từ số liệu thống kê***/
              var hien_kq=itemData.ketqua;
              /***Phần xử lý số liệu thống kê***/
              var dsThongKe=[],dsDataT1=[],dsDataT2=[],dsDataT3=[],dsDataALL=[];
              // console.log(bang);
              for(var s=0;s<100;s++)
              {
                var obj={};
                obj['id']=seft.guid('kqxs');
                obj['dem']=0;
                obj['tong']=0;
                obj['chua_ra']=0;
                obj['lich_su']=0;
                obj['so']=s.toString().padStart(2,'0');
                obj=Object.assign(obj,defaul_val);
                dsThongKe.push(obj);
              }
              /** Lưu ý sắp xếp ngày cho đúng cài đặt**/
              // console.log(seft.du_lieu_thong_ke[itemData.id]);
              var id_kq=itemData.id.toString();
              if(hien_kq)
                id_kq=id_kq.replace(RegExp('kq_','g'),'');
              // console.log(mang_dl_dai);
              id_kq.split(RegExp('&','g')).forEach(function(STT){
                var bang=mang_dl_dai[1*STT].filter(function(obj){
                  return chuyenNgay(obj.field_ngay,"yyyymmdd")>=chuyenNgay(seft.tu_ngay,"dd/mm/yyyy") && chuyenNgay(obj.field_ngay,"yyyymmdd")<chuyenNgay(seft.den_ngay,"dd/mm/yyyy")
                }).sort(function(a,b){
                  return chuyenNgay(b.field_ngay,"yyyymmdd")-chuyenNgay(a.field_ngay,"yyyymmdd")
                });
                if(seft.so_chu.length>0 && seft.ds_dai_chon_so_chu.length>0)
                  bang=mang_dl_dai[1*STT].filter(function(obj){
                    return chuyenNgay(obj.field_ngay,"yyyymmdd")<chuyenNgay(seft.den_ngay,"dd/mm/yyyy")
                  }).sort(function(a,b){
                    return chuyenNgay(b.field_ngay,"yyyymmdd")-chuyenNgay(a.field_ngay,"yyyymmdd")
                  });
                // console.log(itemData.ten_dai,bang);
                /**** Tìm theo kỳ ****/
                // if(seft.loai_tim===1)
                //    bang=bang.filter(kq=>kq.thu===seft.thu_tuan);
                /**** Tìm Số Chủ ****/
                // if(seft.so_chu!=='')
                //   bang=bang.filter(function(kq){
                //     var lay=false;
                //     Object.keys(kq).forEach(function(tk){
                //       if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                //       {
                //         var so=kq[tk].substr(kq[tk].length-2,2);
                //         if(seft.so_chu===so.trim())
                //           lay=true;
                //       }
                //     });
                //     return lay;
                //   });
                var so_ky=0;
                /***Đếm kết quả***/
                bang.reduce((acc, item) => {
                  if (!acc.some(obj => obj.field_ngay === item.field_ngay)) {
                      acc.push(item);
                  }
                  return acc;
                }, []).forEach(function(kq){
                  so_ky++;
                  if(so_ky<=seft.so_ky)
                  {
                    Object.keys(kq).forEach(function(tk){
                      if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                      {
                        var so=kq[tk].trim().substr(kq[tk].trim().length-2,2);
                        var timIDXSo=dsThongKe.findIndex(obj=>obj['so']===so);
                        if(timIDXSo!==-1)
                        {
                          var newObj=JSON.parse(JSON.stringify(dsThongKe[timIDXSo]))
                          if(!newObj['k_'+so_ky])
                            newObj['k_'+so_ky]=1;
                          else
                            newObj['k_'+so_ky]++;
                          // console.log(newObj);
                          dsThongKe[timIDXSo]=newObj;
                        }
                      }
                    });
                  }
                });
                /***Xong Đếm kết quả***/
              });
              /***Tính kết quả tổng***/
              for(var i=0;i<dsThongKe.length;i++)
              {
                var dem=0,tong=0,flag_xo=true,kxh=0,flag_xo_n=true,kxh_n=0,kxh_ht=0,kxh_ln=0;
                // for(var k=seft.so_ky;k>0;k--)
                // {
                //   var ten_truong=k+1;
                //   // if(seft.sap_xep===1)
                //   //   ten_truong=(seft.so_ky-k)+1;
                //   var kq=dsThongKe[i]['k_'+ten_truong];
                //   if(1*kq>0)
                //   {
                //     flag_xo_n=false;
                //     break;
                //   }
                //   else if(flag_xo_n)
                //     kxh_n++;
                // }
                for(var k=0;k<seft.so_ky;k++)
                {
                  // var ten_truong=k+1;
                  var ten_truong=k+1;
                  // if(seft.sap_xep===1)
                  //   ten_truong=seft.so_ky-k;
                  var kq=dsThongKe[i]['k_'+ten_truong];
                  if(1*kq>0)
                  {
                    tong+=1*kq;
                    dem++;
                    flag_xo=false;
                    if(kxh_ht>kxh_ln)
                      kxh_ln=kxh_ht;
                    kxh_ht=0;
                    kxh_nbd='';
                  }
                  else 
                  {
                    if(flag_xo)
                      kxh++;
                    kxh_ht++;
                  }
                  if(k===seft.so_ky-1&&kxh_ht>kxh_ln)
                    kxh_ln=kxh_ht;
                }
                dsThongKe[i]['dem']=dem;
                dsThongKe[i]['tong']=tong;
                dsThongKe[i]['kxh']=kxh;
                // dsThongKe[i]['kxh_n']=kxh_n;
                dsThongKe[i]['lich_su']=kxh_ln;
              }
              var colGrid=[],colGrid1=[],colGrid2=[],colGrid3=[];
              if(hien_kq)
              {
                if(seft.lay_so_ky>0)
                {
                  var tkDataT=JSON.parse(JSON.stringify(dsThongKe)).filter(t=>1*t['k_'+seft.so_ky]>0);
                  var dsDataT=[];
                  var ncolGrid=[];
                  ncolGrid.push({caption:'',cssClass:'text-bold',headerCellTemplate(el) {el.parent().parent().css("display", 'none')},dataField: 'so1',width:40});
                  for(var cot=0;cot<seft.lay_so_ky*2;cot++)
                  {
                    ncolGrid.push({caption:'',dataType: 'number',dataField: 'c_'+(cot+1),width:40});
                    if(cot==seft.lay_so_ky-1)
                    {
                      ncolGrid.push({caption:'',dataField: 'ket_qua1',width:40});
                      ncolGrid.push({caption:'',dataField: 'vach',width:50,cssClass:'bg-vach',});
                      ncolGrid.push({caption:'',cssClass:'text-bold',dataField: 'so2',width:40});
                    }
                  }
                  ncolGrid.push({caption:'',dataField: 'ket_qua2',width:40});
                  var tieu_de1=itemData.ten_dai.replace('KQ ','');
                  if(seft.so_ky>0)
                  {
                    if(seft.sap_xep===0)
                      tieu_de1=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                    else
                      tieu_de1=itemData.ten_dai.replace('KQ ','')+" "+seft.so_ky+"-1-"+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                  }
                  colGrid1=[{
                    caption: tieu_de1,
                    alignment:'center',
                    headerCellTemplate(container) {
                      container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de1+'</div>'));
                      // container.append($('<div>Area, km<sup>2</sup></div>'));
                    },
                    // dataField: 'cac_dai',
                    columns: ncolGrid
                  }];
                  tkDataT.forEach(function(objD){
                    var objT={};
                    objT['so']=objD['so'];
                    var cot=0;
                    Object.keys(objD).filter(h=>h.startsWith('k_')).sort((a,b)=>seft.sap_xep===0?a-b:b-a).forEach(function(stk){
                      if(1*objD[stk]>0 && cot<=seft.lay_so_ky)
                      {
                        cot++;
                        var ten_cot='c_'+cot;
                        if(objD[stk])
                          objT[ten_cot]=objD[stk];
                        else
                          objT[ten_cot]='';
                      }
                    });
                    for(var chkSo=cot+1;chkSo<=seft.lay_so_ky;chkSo++)
                      objT['c_'+chkSo]='';
                    objT['to_mau']=false;
                    objT['ket_qua']='*';
                    if(1*objD['dem']<=seft.dem_be_hon && seft.dem_be_hon>0)
                    {
                      objT['ket_qua']=objD['dem'];
                      objT['to_mau']=true;
                    }
                    dsDataT.push(objT);
                  });
                  dsDataT.forEach(function(objD,idx){
                    if(idx<Math.round(dsDataT.length/2))
                    {
                      var objN={};
                      objN['id']=seft.guid('kqxs');
                      objN['so1']=objD['so'];
                      for(var cot=0;cot<seft.lay_so_ky;cot++)
                      {
                        if(objD['c_'+(cot+1)])
                          objN['c_'+(cot+1)]=objD['c_'+(cot+1)];
                        else
                          objN['c_'+(cot+1)]='';
                      }
                      objN['ket_qua1']=objD['ket_qua'];
                      objN['to_mau1']=objD['to_mau'];
                      dsDataT1.push(objN);
                    }
                    else
                    {
                      var idxR=idx%Math.round(dsDataT.length/2);
                      dsDataT1[idxR]['so2']=objD['so'];;
                      for(var cot=0;cot<seft.lay_so_ky;cot++)
                      {
                        if(objD['c_'+(cot+1)])
                          dsDataT1[idxR]['c_'+(seft.lay_so_ky+cot+1)]=objD['c_'+(cot+1)];
                        else
                          dsDataT1[idxR]['c_'+(seft.lay_so_ky+cot+1)]='';
                      }
                      dsDataT1[idxR]['ket_qua2']=objD['ket_qua'];
                      dsDataT1[idxR]['to_mau2']=objD['to_mau'];
                    }
                  });
                }
                if(1*seft.kxh_phai_lonhon>0)
                {
                  var tkDataT=JSON.parse(JSON.stringify(dsThongKe)).filter(t=>1*t.kxh>=1*seft.kxh_phai_lonhon);
                  var dsDataT=[];
                  var ncolGrid=[];
                  ncolGrid.push({caption:'',cssClass:'text-bold',headerCellTemplate(el) {el.parent().parent().css("display", 'none')},dataField: 'so1',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach1',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',dataField: 'ket_qua1',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',cssClass:'text-bold',dataField: 'so2',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach2',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',dataField: 'ket_qua2',width:40});
                  var tieu_de2=itemData.ten_dai.replace('KQ ','');
                  if(seft.so_ky>0)
                    tieu_de2=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.kxh_phai_lonhon;
                  colGrid2=[{
                    caption: tieu_de2,
                    alignment:'center',
                    headerCellTemplate(container) {
                      container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de2+'</div>'));
                      // container.append($('<div>Area, km<sup>2</sup></div>'));
                    },
                    // dataField: 'cac_dai',
                    columns: ncolGrid
                  }];
                  dsDataT2=[];
                  tkDataT.forEach(function(objD,idx){
                    if(idx<Math.round(tkDataT.length/2))
                    {
                      var objN={};
                      objN['id']=seft.guid('kqxs');
                      objN['so1']=objD['so'];
                      objN['ket_qua1']=objD['kxh'];
                      dsDataT2.push(objN);
                    }
                    else
                    {
                      var idxR=idx%Math.round(tkDataT.length/2);
                      dsDataT2[idxR]['so2']=objD['so'];
                      dsDataT2[idxR]['ket_qua2']=objD['kxh'];
                    }
                  });
                }
                if(1*seft.dem_nho_hon>0)
                {
                  var tkDataT=JSON.parse(JSON.stringify(dsThongKe)).filter(t=>1*t['k_'+seft.so_ky]===0 && 1*t.dem<=1*seft.dem_nho_hon);
                  var dsDataT=[];
                  var ncolGrid=[];
                  ncolGrid.push({caption:'',cssClass:'text-bold',headerCellTemplate(el) {el.parent().parent().css("display", 'none')},dataField: 'so1',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach1',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',dataField: 'ket_qua1',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',cssClass:'text-bold',dataField: 'so2',width:40});
                  ncolGrid.push({caption:'',dataField: 'vach2',width:20,cssClass:'bg-vach',});
                  ncolGrid.push({caption:'',dataField: 'ket_qua2',width:40});
                  var tieu_de3=itemData.ten_dai.replace('KQ ','');
                  if(seft.so_ky>0)
                    tieu_de3=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.dem_nho_hon;
                  colGrid3=[{
                    caption: tieu_de3,
                    alignment:'center',
                    headerCellTemplate(container) {
                      container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de3+'</div>'));
                      // container.append($('<div>Area, km<sup>2</sup></div>'));
                    },
                    // dataField: 'cac_dai',
                    columns: ncolGrid
                  }];
                  dsDataT3=[];
                  tkDataT.forEach(function(objD,idx){
                    if(idx<Math.round(tkDataT.length/2))
                    {
                      var objN={};
                      objN['id']=seft.guid('kqxs');
                      objN['so1']=objD['so'];
                      objN['ket_qua1']=objD['dem'];
                      dsDataT3.push(objN);
                    }
                    else
                    {
                      var idxR=idx%Math.round(tkDataT.length/2);
                      dsDataT3[idxR]['so2']=objD['so'];
                      dsDataT3[idxR]['ket_qua2']=objD['dem'];
                    }
                  });
                  if(dsDataT3.length===0)
                    dsDataT3.push({id:seft.guid('kqxs'),so1:0,ket_qua2:0});
                }
              }
              else
              {
                var tieu_de=itemData.ten_dai.replace('KQ ','')+(1*seft.dem_lon_hon>0 && seft.so_chu.length>0?'('+seft.so_chu.join('-')+')':'');
                colGrid=[{
                  caption: tieu_de,
                  fixed: true,
                  alignment:'center',
                  headerCellTemplate(container) {
                    container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
                    // container.append($('<div>Area, km<sup>2</sup></div>'));
                  },
                  // dataField: 'cac_dai',
                  columns: [
                    {
                      caption: 'Tổng',
                      dataField: 'tong',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số Lần',
                      dataField: 'dem',
                      dataType: 'number',
                    },

                    {
                      caption: 'KXH',
                      dataField: 'kxh',
                      dataType: 'number',
                    },
                    {
                      caption: 'Lâu Nhất',
                      dataField: 'lich_su',
                      dataType: 'number',
                    },
                    {
                      caption: 'Số',
                      dataField: 'so',
                      cssClass:'text-bold',
                    }
                  ]
                }].concat(cotDong);
              }
              if(!hien_kq)
                $('<div>')
                .appendTo(itemElement)
                .dxDataGrid({
                  dataSource:dsThongKe,
                  export: {
                    enabled: true
                  },
                  columnFixing: {
                    enabled: true,
                  },
                  columnAutoWidth:true,
                  sorting: {
                      mode: "none" // or "multiple" | "none"
                  },
                  onRowPrepared: function(info) {
                    if(info.rowType === 'data') {
                      if(seft.so_chu.find(so=>info.data['so'].trim()===so) && 1*seft.dem_lon_hon>0 && seft.so_chu.length>0)
                        info.rowElement.addClass("to_mau");
                    }
                  },
                  keyExpr: 'id',
                  width: '100%',
                  export: {
                    enabled: true
                  },
                  paging: {
                    pageSize: 1000,
                  },
                  columns: colGrid,
                  showColumnLines: true,
                  showRowLines: true,
                  showBorders: true,
                });
              else
              {
                if(1*seft.dem_lon_hon>0)
                {
                  var tkDataT=JSON.parse(JSON.stringify(dsThongKe));
                  var dsDataT=[],demcot=0;
                  tkDataT.forEach(function(objD,idx){
                    if(idx%20===0)
                      demcot++;
                    if(dsDataT.length<20)
                    {
                      var objN={};
                      objN['id']=seft.guid('kqxs');
                      objN['stt']=1*idx;
                      objN['so'+demcot]=objD['so'];
                      objN['tong'+demcot]=objD['tong'];
                      objN['dem'+demcot]=objD['dem'];
                      objN['kxh'+demcot]=objD['kxh'];
                      if(1*seft.dem_lon_hon>0&&seft.so_chu.length>0)
                        objN['to_mau'+demcot]=(1*objD['dem']>=1*seft.dem_lon_hon);
                      else if(1*seft.dem_to_nho_hon>0)
                        objN['to_mau'+demcot]=(1*objD['dem']<=1*seft.dem_to_nho_hon);
                      dsDataT.push(objN);
                    }
                    else
                    {
                      var idxR=idx%20;
                      var fIdxR=dsDataT.findIndex(r=>1*r.stt===idxR);
                      if(fIdxR!==-1)
                      {
                        dsDataT[fIdxR]['so'+demcot]=objD['so'];
                        dsDataT[fIdxR]['tong'+demcot]=objD['tong'];
                        dsDataT[fIdxR]['dem'+demcot]=objD['dem'];
                        dsDataT[fIdxR]['kxh'+demcot]=objD['kxh'];
                        if(1*seft.dem_lon_hon>0&&seft.so_chu.length>0)
                          dsDataT[fIdxR]['to_mau'+demcot]=(1*objD['dem']>=1*seft.dem_lon_hon);
                        else if(1*seft.dem_to_nho_hon>0)
                          dsDataT[fIdxR]['to_mau'+demcot]=(1*objD['dem']<=1*seft.dem_to_nho_hon);
                      }
                    }
                  });
                  var tieu_de=itemData.ten_dai.replace('KQ ','');
                  if(seft.so_ky>0)
                  {
                    if(seft.so_chu.length>0)
                    {
                      if(1*seft.dem_lon_hon>0)
                      {
                        if(seft.sap_xep===0)
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.dem_lon_hon;//+" "+seft.thu_tuan+" "+seft.den_ngay;
                        else
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" "+seft.so_ky+"-1-"+seft.dem_lon_hon;//+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                      }
                      else
                      {
                        if(seft.sap_xep===0)
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.dem_lon_hon;//+" "+seft.thu_tuan+" "+seft.den_ngay;
                        else
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" "+seft.so_ky+"-1-"+seft.dem_lon_hon;//+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                      }
                    }
                    else
                    {
                      if(1*seft.dem_to_nho_hon>0)
                      {
                        if(seft.sap_xep===0)
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.dem_to_nho_hon;//+" "+seft.thu_tuan+" "+seft.den_ngay;
                        else
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" "+seft.so_ky+"-1-"+seft.dem_to_nho_hon;//+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                      }
                      else
                      {
                        if(seft.sap_xep===0)
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" 1-"+seft.so_ky+"-"+seft.dem_to_nho_hon;//+" "+seft.thu_tuan+" "+seft.den_ngay;
                        else
                          tieu_de=itemData.ten_dai.replace('KQ ','')+" "+seft.so_ky+"-1-"+seft.dem_to_nho_hon;//+seft.lay_so_ky+" "+seft.thu_tuan+" "+seft.den_ngay;
                      }
                    }
                  }
                  var colGrid=[
                    {
                      caption: 'STT',
                      dataField: 'so1',
                      cssClass:'text-bold',
                      width:50,
                    },
                    {
                      caption: 'Tổng',
                      dataField: 'tong1',
                      dataType: 'number',
                      width:50,
                    },
                    {
                      caption: 'SL',
                      dataField: 'dem1',
                      dataType: 'number',
                      width:50,
                    },
                    {
                      caption: 'KXH',
                      dataField: 'kxh1',
                      dataType: 'number',
                      width:50,
                    },
                    {
                      caption:'',
                      alignment:'center',
                      headerCellTemplate(container) {
                        container.append($('<div></div>'));
                        // container.append($('<div>Area, km<sup>2</sup></div>'));
                      },
                      // dataField: 'cac_dai',
                      columns: [
                        {
                          caption: '',
                          dataField: 'vach_a',
                          cssClass:'bg-vach',
                        },
                        {
                          caption: '',
                          dataField: 'so2',
                          width:50,
                          cssClass:'text-bold',
                          headerCellTemplate(el) {el.parent().parent().css("display", 'none')}
                        },
                        {
                          caption: '',
                          dataField: 'tong2',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'dem2',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'kxh2',
                          dataType: 'number',
                          width:50,
                        }
                      ]
                    },
                    {
                      caption:tieu_de,
                      alignment:'center',
                      headerCellTemplate(container) {
                        container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
                      },
                      // dataField: 'cac_dai',
                      columns: [
                        {
                          caption: '',
                          dataField: 'vach_b',
                          cssClass:'bg-vach',
                        },
                        {
                          caption: '',
                          dataField: 'so3',
                          cssClass:'text-bold',
                          width:50,
                          headerCellTemplate(el) {el.parent().parent().css("display", 'none')}
                        },
                        {
                          caption: '',
                          dataField: 'tong3',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'dem3',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'kxh3',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'vach_c',
                          cssClass:'bg-vach',
                        },
                        {
                          caption: '',
                          dataField: 'so4',
                          cssClass:'text-bold',
                          width:50,
                        }
                      ]
                    },
                    {
                      caption:seft.so_chu.join('-'),
                      alignment:'center',
                      headerCellTemplate(container) {
                        container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+seft.so_chu.join('-')+'</div>'));
                      },
                      // dataField: 'cac_dai',
                      columns: [
                        {
                          caption: '',
                          dataField: 'tong4',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'dem4',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'kxh4',
                          dataType: 'number',
                          width:50,
                        }
                      ]
                    },
                    {
                      caption:(seft.thu_tuan+" "+seft.den_ngay).replace('KQ ',''),
                      alignment:'center',
                      headerCellTemplate(container) {
                        var tieu_de=seft.thu_tuan+" "+seft.den_ngay;
                        container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de.replace('KQ ','')+'</div>'));
                      },
                      // dataField: 'cac_dai',
                      columns: [
                        {
                          caption: '',
                          dataField: 'vach_d',
                          cssClass:'bg-vach',
                        },
                        {
                          caption: '',
                          dataField: 'so5',
                          dataType: 'number',
                          cssClass:'text-bold',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'tong5',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'dem5',
                          dataType: 'number',
                          width:50,
                        },
                        {
                          caption: '',
                          dataField: 'kxh5',
                          dataType: 'number',
                          width:50,
                        }
                      ]
                    },
                  ];
                  $('<div>')
                  .appendTo(itemElement)
                  .dxDataGrid({
                    dataSource:dsDataT,
                    export: {
                      enabled: true
                    },
                    columnFixing: {
                      enabled: true,
                    },
                    columnAutoWidth:true,
                    sorting: {
                        mode: "none" // or "multiple" | "none"
                    },
                    onCellPrepared: function(e) {
                      if(e.rowType === "data") {
                        if(e.data['to_mau1']===true && e.column.dataField.endsWith("1"))
                          e.cellElement.css("background-color",seft.chon_mau);
                        else if(e.data['to_mau2']===true && e.column.dataField.endsWith("2"))
                          e.cellElement.css("background-color",seft.chon_mau);
                        else if(e.data['to_mau3']===true && e.column.dataField.endsWith("3"))
                          e.cellElement.css("background-color",seft.chon_mau);
                        else if(e.data['to_mau4']===true && e.column.dataField.endsWith("4"))
                          e.cellElement.css("background-color",seft.chon_mau);
                        else if(e.data['to_mau5']===true && e.column.dataField.endsWith("5"))
                          e.cellElement.css("background-color",seft.chon_mau);
                      }
                    },
                    keyExpr: 'id',
                    width: '100%',
                    export: {
                      enabled: true
                    },
                    paging: {
                      pageSize: 1000,
                    },
                    columns: colGrid,
                    showColumnLines: true,
                    showRowLines: true,
                    showBorders: true,
                  });
                }
                else
                {
                  var strHtml='';
                  var id_grid='grdKQ_'+id_kq.replace(RegExp('&','g'),'_');
                  if(1*seft.kxh_phai_lonhon>0)
                    strHtml+='<div class="ml-3" id="'+id_grid+'_2"></div>';
                  if(1*seft.dem_nho_hon>0)
                    strHtml+='<div class="ml-3" id="'+id_grid+'_3"></div>';
                  itemElement.append($('<div class="row"><div class="ml-3" id="'+id_grid+'_1"></div>'+strHtml+'</div></div>'));
                  $('#'+id_grid+'_1').dxDataGrid({
                    dataSource:dsDataT1,
                    columnAutoWidth:false,
                    export: {
                      enabled: true
                    },
                    width:'602px',
                    sorting: {
                        mode: "none" // or "multiple" | "none"
                    },
                    onRowPrepared: function(info) {
                      if(info.rowType === 'data' && hien_kq) {
                        info.rowElement.children('td').each(function(td_idx,td) {
                          if(td_idx<seft.lay_so_ky+2 && td && info.data['to_mau1']===true)
                             $(td).css("background-color",seft.chon_mau);
                          else if(td_idx>seft.lay_so_ky+2 && td && info.data['to_mau2']===true)
                             $(td).css("background-color",seft.chon_mau);
                          // do your cool stuff
                        });   
                      }
                    },
                    keyExpr: 'id',
                    paging: {
                      pageSize: 1000,
                    },
                    columns: colGrid1,
                    showColumnLines: true,
                    showRowLines: true,
                    showBorders: true,
                  });
                  if(1*seft.kxh_phai_lonhon>0)
                  {
                    $('#'+id_grid+'_2').dxDataGrid({
                      dataSource:dsDataT2,
                      columnAutoWidth:false,
                      export: {
                        enabled: true
                      },
                      width:'230px',
                      sorting: {
                          mode: "none" // or "multiple" | "none"
                      },
                      keyExpr: 'id',
                      paging: {
                        pageSize: 1000,
                      },
                      columns: colGrid2,
                      showColumnLines: true,
                      showRowLines: true,
                      showBorders: true,
                    });
                  }
                  if(1*seft.dem_nho_hon>0)
                  {
                    $('#'+id_grid+'_3').dxDataGrid({
                      dataSource:dsDataT3,
                      columnAutoWidth:false,
                      export: {
                        enabled: true
                      },
                      width:'230px',
                      sorting: {
                          mode: "none" // or "multiple" | "none"
                      },
                      keyExpr: 'id',
                      paging: {
                        pageSize: 1000,
                      },
                      columns: colGrid3,
                      showColumnLines: true,
                      showRowLines: true,
                      showBorders: true,
                    });
                  }
                }
              }
            },
            onSelectionChanged({ component }) {
            },
          }).dxTabPanel('instance');
        },500);
      },
      xem_ket_qua:function(){
        var seft=this;
        seft.ds_dai_chon_xem_ket_qua=[];
        if(seft.ds_dai_chon.length===0)
          return canhbao("Vui lòng Chọn Đài trước");
        if(seft.ctrThongKe)
        {
          $("#thong_ke").dxTabPanel("dispose");
          seft.ctrThongKe=false;
        }
        seft.isXemthuong=true;
        var xu_ly_ket_qua=[];
        for(var s=0;s<10;s++)
        {
          var objS={};
          objS['id']=seft.guid('kqxs');
          objS['chuc']=s;
          xu_ly_ket_qua.push(objS);
        }
        seft.ds_dai_chon.sort((a,b)=>a-b).forEach(function(STT){
          seft.du_lieu_dai_mien[seft.mien]['data'].filter(dm=>1*dm.stt===1*STT && dm.thu===seft.thu_tuan).forEach(function(dlD){
            var dataDai=JSON.parse(JSON.stringify(dlD.data.filter(d=>d.thu===dlD.thu)));
            if(seft.loai_tim===0)
              dataDai=JSON.parse(JSON.stringify(dlD.data));
            var obRow=dataDai.filter(function(obj){
              return obj.field_ngay.trim()<=1*dateFormat(chuyenNgay(seft.den_ngay,"dd/mm/yyyy"),"yyyymmdd")
            }).sort(function(a,b){
              return 1*b.field_ngay-1*a.field_ngay
            });
            if(obRow.length>0)
            {
              // console.log(dlD.ten_dai,obRow);
              var kq=obRow[0];
              for(var s=0;s<10;s++)
              {
                var fIdxDong=xu_ly_ket_qua.findIndex(idx=>1*idx.chuc===s);
                if(fIdxDong!==-1)
                  if(!xu_ly_ket_qua[fIdxDong]['dai_'+STT])
                      xu_ly_ket_qua[fIdxDong]['dai_'+STT]='';
              }
              Object.keys(kq).forEach(function(tk){
                if(tk!=='_id' && tk!=='id' && tk!=='thu' && tk!=='field_ngay')
                {
                  var chuc=kq[tk].trim().substr(kq[tk].trim().length-2,1);
                  var fIdxDong=xu_ly_ket_qua.findIndex(idx=>1*idx.chuc===1*chuc);
                  var donvi=kq[tk].trim().substr(kq[tk].trim().length-1,1);
                  if(fIdxDong!==-1)
                    xu_ly_ket_qua[fIdxDong]['dai_'+STT]+=(xu_ly_ket_qua[fIdxDong]['dai_'+STT]!==''?',':'')+donvi;
                }
              });
              seft.ds_dai_chon_xem_ket_qua.push({stt:1*STT,ten_dai:dlD.ten_dai,ngay:dateFormat(chuyenNgay(kq.field_ngay,"yyyymmdd"),"dd/mm/yyyy"),data:kq});
            }
          });
        });
        seft.xu_ly_ket_qua=xu_ly_ket_qua;
        if(seft.ctrGridKQ)
        {
          $("#grdKQ").dxDataGrid("dispose");
          seft.ctrGridKQ=false;
        }
        var tieu_de='Kết quả theo hàng chục và đơn vị',cot_dong=[];
        seft.ds_dai_chon_xem_ket_qua.forEach(function(dai){
          cot_dong.push({caption: dai.ten_dai,dataField: 'dai_'+dai.stt});
        });
        var colGrid=[{
          caption: tieu_de,
          alignment:'center',
          headerCellTemplate(container) {
            container.append($('<div style=" font-size: 12pt; font-weight: bold; color: black; ">'+tieu_de+'</div>'));
            // container.append($('<div>Area, km<sup>2</sup></div>'));
          },
          // dataField: 'cac_dai',
          columns: [{caption: 'Hàng Chục',dataField: 'chuc'}].concat(cot_dong)
        }];
        setTimeout(function(){
          seft.ctrGridKQ=$('#grdKQ').dxDataGrid({
            dataSource:seft.xu_ly_ket_qua,
            columnAutoWidth:true,
            sorting: {
                mode: "none" // or "multiple" | "none"
            },
            keyExpr: 'id',
            width: '100%',
            columns: colGrid,
            showColumnLines: true,
            showRowLines: true,
            showBorders: true,
          }).dxDataGrid('instance');
        },300);
        // console.log(seft.ds_dai_chon_xem_ket_qua);
      },
      lay_ds_dai:function(){
        var seft=this;
        seft.du_lieu_dai_mien={};
        seft.ds_dai_chon_xem_ket_qua=[];
        if(seft.ctrChonDai)
          seft.ctrChonDai.option('value','');
        if(seft.ctrChonDaiSoChu)
          seft.ctrChonDaiSoChu.option('value','');
        var dsDaiMien=JSON.parse(JSON.stringify(seft.danh_sach_dai));
        var dsDaiThu=dsDaiMien.filter(d=>d.mien===seft.mien && d.thu===seft.thu_tuan).sort((a,b)=>a.stt-b.stt);
        dsDaiThu.forEach(function(obj){
          if(seft.loai_tim===0)
            obj['label']=seft.mien+obj['stt']+" - "+obj['ten_dai'];
          else
            obj['label']=obj['ten_dai'];
        });
        if(!seft.du_lieu_dai_mien[seft.mien])
        {
          var dsDai=dsDaiMien.filter(d=>d.mien===seft.mien).sort((a,b)=>(a.thu+"_"+a.stt)-(b.thu+"_"+b.stt));
          if(seft.loai_tim===1)
            dsDai=dsDaiMien.filter(d=>d.mien===seft.mien && d.thu===seft.thu_tuan).sort((a,b)=>(a.thu+"_"+a.stt)-(b.thu+"_"+b.stt))
          dsDai.forEach(function(obj){
            if(!seft.du_lieu_dai_mien[seft.mien])
              seft.du_lieu_dai_mien[seft.mien]={data:[]};
            var fMD=seft.du_lieu_dai_mien[seft.mien]['data'].find(d=>d.dai===obj.du_lieu_dai);
            var fMDT=seft.du_lieu_dai_mien[seft.mien]['data'].find(d=>d.dai===obj.du_lieu_dai && d.thu===obj.thu);
            if(!fMD)
            {
              seft.csm_obj_tables({app_id:"kqxs",obj_name:obj.du_lieu_dai,e_where:
                                   {
                                    operator: 'AND',
                                    conditions: [
                                      { field: 'field_ngay', type: 'gte', value: dateFormat(chuyenNgay(seft.tu_ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")},
                                      { field: 'field_ngay', type: 'lte', value: dateFormat(chuyenNgay(seft.den_ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")}
                                    ]
                                   }
                                  },function(rs){
                // console.log(seft.thu_tuan,rs.rows.find(dong=>dong['field_ngay'].trim()==="24/01/2024"));
                // rs.rows.forEach(function(objR){
                //   var objN=JSON.parse(JSON.stringify(objR)); 
                //   if(objN['field_ngay'].trim()==="24/01/2024")
                //       console.log(objN);
                //   delete objN['_id'];
                //   if(seft.days[chuyenNgay(objN['field_ngay'].trim(),"dd/mm/yyyy").getDay()]!==objN['thu'])
                //   {
                //     objN['thu']=seft.days[chuyenNgay(objN['field_ngay'].trim(),"dd/mm/yyyy").getDay()];
                //     objN['field_ngay']=objN['field_ngay'].trim();
                //     seft.csm_obj_updates({app_id:'kqxs',obj_name:obj.du_lieu_dai,command:"update",obj_update:objN,e_where:{id:objN['id']}},function(msgU){
                //       if(msgU.success===true)
                //         thongbao('Đã cập nhật xong kết quả')
                //     });
                //   }
                // });
                var data_dai=rs.rows.filter(function(kq){
                  if(kq["field_ngay"])
                    return true;
                  else
                  {
                    seft.csm_obj_updates({app_id:'kqxs',obj_name:obj.du_lieu_dai,command:"delete",obj_update:kq,e_where:{"field": "id","type": "eq","value":kq.id}},function(msgU){
                      if(msgU.success===true)
                        thongbao('Đã xoá kết quả sai')
                    });
                    return false;
                  }
                });
                var idxDai=seft.du_lieu_dai_mien[seft.mien]['data'].findIndex(d=>d.dai===obj.du_lieu_dai && d.thu===obj.thu);
                if(idxDai===-1)
                  seft.du_lieu_dai_mien[seft.mien]['data'].push({stt:obj.stt,thu:obj.thu,ten_dai:obj['ten_dai'],dai:obj.du_lieu_dai,data:data_dai});
                else
                  seft.du_lieu_dai_mien[seft.mien]['data'][idxDai]['data']=data_dai;
              });
            }
            else if(!fMDT)
            {
              var objN=JSON.parse(JSON.stringify(fMD)); 
              objN['thu']=obj.thu;
              objN['stt']=obj.stt;
              seft.du_lieu_dai_mien[seft.mien]['data'].push(objN);
            }
          });
        }
        seft.ctrChonDai.option('dataSource',dsDaiThu);
        seft.ctrChonDaiSoChu.option('dataSource',dsDaiThu);
      },
      chay_cap_nhat:function(){
        var seft=this;
        var soNgay=TruNgayRaSoNgay(seft.den_ngay,seft.tu_ngay,"dd/mm/yyyy");
        seft.total_progress=soNgay;
        seft.curent_progress=soNgay;
        seft.time_progress=setInterval(function(){
          if(seft.curent_progress>0)
          {
            var ngay_xo=CongNgay(seft.tu_ngay,seft.curent_progress,"dd/mm/yyyy");
            seft.cap_nhat(chuyenNgay(ngay_xo));
            seft.curent_progress--;
            seft.ctrProgress.option('value', Math.round(((seft.total_progress-seft.curent_progress)/seft.total_progress) * 100));
          }
          else
            clearInterval(seft.time_progress);
        }, 1000);
      },
      cap_nhat:function(ngay_lay){
        var seft=this;
        var ngay_cap_nhat=dateFormat(ngay_lay,'dd-mm-yyyy');
        // console.log(ngay_cap_nhat);
        //Kết Quả Miền Nam
        var proxyServer="157.15.38.151:14594";
        var proxyUsername="muaproxy6875dfd52d30c";
        var proxyPassword="lkfnjdsvkbjelbhs";
        var link='https://api.phanmemmottrieu.net/scrape-web';
        if(window.hasOwnProperty("process"))
          link='';
        (link!==""?fetch(link,{
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // Không cache - luôn lấy dữ liệu mới
          body: JSON.stringify({
            "link":'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam/'+ngay_cap_nhat+'.html',
            "proxyServer":proxyServer,
            "proxyUsername":proxyUsername,
            "proxyPassword":proxyPassword
          })
        }):fetch(link+'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam/'+ngay_cap_nhat+'.html', { cache: 'no-store' }))
        .then(function(response) {
        	if(link==="")
            return response.text();
          else
            return response.json().data; 
        })
        .then(function(html) {
            let domParser = new DOMParser();
            let docP = domParser.parseFromString(html, "text/html");
            var bangketqua=docP.querySelector('[class="box_kqxs"]');
            if(bangketqua)
            {
                var ngay=bangketqua.querySelector('.ngay').innerText.trim();
                bangketqua.querySelectorAll('table.rightcl').forEach(function(kq){
                    var tinh=kq.querySelector('.tinh').innerText.trim();
                    if(tinh.trim()==='TP. HCM')
                        tinh='tphcm';
                    tinh='kqxs_'+seft.xoa_dau(tinh.trim().replace(/ /g, ''));
                    var objKQ={field_ngay:dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")},idx=0;
                    kq.querySelectorAll('tr').forEach(function(dong){
                        dong.querySelectorAll('td').forEach(function(cot){
                            cot.querySelectorAll('div').forEach(function(giai){
                                idx++;
                                if(idx===1)
                                    objKQ['field_dau']=giai.innerText;
                                else if(idx===18)
                                    objKQ['field_duoi']=giai.innerText;
                                else
                                    objKQ['field_so'+idx]=giai.innerText;
                            });
                        });
                    });
                    objKQ['id']=seft.guid('kqxs');
                    objKQ['thu']=seft.days[chuyenNgay(objKQ['field_ngay'],"yyyymmdd").getDay()];
                    seft.csm_obj_updates({app_id:'kqxs',obj_name:tinh,command:"create",obj_update:objKQ,e_where:{"field": "id","type": "eq","value":objKQ.id}},function(msgU){
                      if(msgU.success===true)
                        thongbao('Đã cập nhật xong kết quả')
                    });
                });
            }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
        //Kết Quả Miền Trung
        (link!==""?fetch(link,{
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // Không cache - luôn lấy dữ liệu mới
          body: JSON.stringify({
            "link":'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-trung/'+ngay_cap_nhat+'.html',
            "proxyServer":proxyServer,
            "proxyUsername":proxyUsername,
            "proxyPassword":proxyPassword
          })
        }):fetch(link+'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-trung/'+ngay_cap_nhat+'.html', { cache: 'no-store' }))
        .then(function(response) {
          if(link==="")
            return response.text();
          else
            return response.json().data; 
        })
        .then(function(html) {
            let domParser = new DOMParser();
            let docP = domParser.parseFromString(html, "text/html");
            var bangketqua=docP.querySelector('[class="box_kqxs"]');
            if(bangketqua)
            {
                var ngay=bangketqua.querySelector('.ngay').innerText.trim();
                bangketqua.querySelectorAll('table.rightcl').forEach(function(kq){
                    var tinh=kq.querySelector('.tinh').innerText.trim();
                    if(tinh.trim()==='Thừa T. Huế'||tinh.trim()==='Huế')
                        tinh='thuathienhue';
                    tinh='kqxs_'+seft.xoa_dau(tinh.trim().replace(/ /g, ''));
                    var objKQ={field_ngay:dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")},idx=0;
                    kq.querySelectorAll('tr').forEach(function(dong){
                        dong.querySelectorAll('td').forEach(function(cot){
                            cot.querySelectorAll('div').forEach(function(giai){
                                idx++;
                                if(idx===1)
                                    objKQ['field_dau']=giai.innerText;
                                else if(idx===18)
                                    objKQ['field_duoi']=giai.innerText;
                                else
                                    objKQ['field_so'+idx]=giai.innerText;
                            });
                        });
                    });
                    objKQ['thu']=seft.days[chuyenNgay(objKQ['field_ngay'],"yyyymmdd").getDay()];
                    objKQ['id']=seft.guid('kqxs');
                    seft.csm_obj_updates({app_id:'kqxs',obj_name:tinh,command:"create",obj_update:objKQ,e_where:{"field": "id","type": "eq","value":objKQ.id}},function(msgU){
                      if(msgU.success===true)
                        thongbao('Đã cập nhật xong kết quả')
                    });
                });
            }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
        //Kết Quả Miền Bắc
        (link!==""?fetch(link,{
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store', // Không cache - luôn lấy dữ liệu mới
          body: JSON.stringify({
            "link":'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/'+ngay_cap_nhat+'.html',
            "proxyServer":proxyServer,
            "proxyUsername":proxyUsername,
            "proxyPassword":proxyPassword
          })
        }):fetch(link+'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/'+ngay_cap_nhat+'.html', { cache: 'no-store' }))
        .then(function(response) {
          if(link==="")
            return response.text();
          else
            return response.json().data; 
        })
        .then(function(html) {
            let domParser = new DOMParser();
            let docP = domParser.parseFromString(html, "text/html");
            var bangketqua=docP.querySelector('[class="box_kqxs"]');
            if(bangketqua)
            {
                var ngay=bangketqua.querySelector('table.bkqtinhmienbac .tngay a').innerText.trim();
                bangketqua.querySelectorAll('table.bkqtinhmienbac').forEach(function(kq){
                    var tinh='mienbac';
                    tinh='kqxs_'+seft.xoa_dau(tinh.trim().replace(/ /g, ''));
                    var objKQ={field_ngay:dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")},idx=28;
                    kq.querySelectorAll('tr:not(:first-child)').forEach(function(dong){
                        dong.querySelectorAll('td').forEach(function(cot){
                            cot.querySelectorAll('div').forEach(function(giai){
                                idx--;
                                if(idx===27)
                                    objKQ['field_duoi']=giai.innerText;
                                else if(idx===1)
                                    objKQ['field_dau']=giai.innerText;
                                else
                                    objKQ['field_so'+idx]=giai.innerText;
                            });
                        });
                    });
                    objKQ['thu']=seft.days[chuyenNgay(objKQ['field_ngay'],"yyyymmdd").getDay()];
                    objKQ['id']=seft.guid('kqxs');
                    seft.csm_obj_updates({app_id:'kqxs',obj_name:tinh,command:"create",obj_update:objKQ,e_where:{"field": "id","type": "eq","value":objKQ.id}},function(msgU){
                      if(msgU.success===true)
                        thongbao('Đã cập nhật xong kết quả')
                    });
                });
            }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
      },
      cap_nhat_xskt:function(ngay_lay,mien,dai){
        var seft=this;
        var ngay_cap_nhat=dateFormat(ngay_lay,'d-m-yyyy');
        var link='api.shtml?link=';
        if(window.hasOwnProperty("process"))
          link='';
        //Kết Quả Miền Nam
        fetch(link+'https://xskt.com.vn/xsmn/ngay-'+ngay_cap_nhat, { cache: 'no-store' })
        .then(function(response) {
            return response.text();
        })
        .then(function(html) {
          let domParser = new DOMParser();
          let docP = domParser.parseFromString(html, "text/html");
          var bangketqua = docP.querySelector('.tbl-xsmn');
          if (bangketqua) {
            var ngay = bangketqua.querySelector('.dockq').getAttribute("title").match(/\d{2}([\/.-])\d{2}\1\d{4}/g)[0].trim().replace(/\-/g, "/");;
            var tinh = [];
            bangketqua.querySelectorAll('a').forEach(function (kq, idx) {
                var t = kq.innerText.trim();
                if (t.trim() === 'TP.HCM')
                    t = 'tphcm';
                if (!kq.getAttribute("title"))
                    tinh.push({ id: idx, dai: 'kqxs_' + seft.xoa_dau(t.trim().replace(/ /g, '')), data: { field_ngay: dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd") } });
            });
            bangketqua.querySelectorAll('tr').forEach(function (dong, idx) {
                dong.querySelectorAll('td').forEach(function (cot, idc) {
                    if (!cot.getAttribute("title")) {
                      var fidx = tinh.findIndex(function (d) { return d.id === idc; })
                      var giai = cot.innerText.trim();//.split(/\n/g);
                      if (fidx !== -1) {
                        var objKQ = tinh[fidx]["data"];
                        if (Object.keys(objKQ).length === 1) {
                            objKQ['field_dau'] = giai.trim();
                        }
                        else if (bangketqua.querySelectorAll('tr').length - 1 === idx)
                            objKQ['field_duoi'] = giai.trim();
                        else {
                            var cung_giai = cot.innerHTML.split("<br>");
                            if (cung_giai.length === 1)
                                objKQ['field_so' + Object.keys(objKQ).length] = giai.trim();
                            else {
                                cung_giai.forEach(function (g) {
                                    objKQ['field_so' + Object.keys(objKQ).length] = g.trim();
                                });
                            }
                        }
                      }
                    }
                });
            });
            tinh.forEach(function(up){
              up.data['id']=seft.guid('kqxs');
              up.data['thu']=seft.days[chuyenNgay(up.data['field_ngay'],"yyyymmdd").getDay()];
              seft.csm_obj_updates({app_id:'kqxs',obj_name:up.dai,command:"create",obj_update:up.data,e_where:{"field": "id","type": "eq","value":up.data.id}},function(msgU){
                if(msgU.success===true)
                  thongbao('Đã cập nhật xong kết quả')
              });
            });
          }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
        //Kết Quả Miền Trung
        fetch(link+'https://xskt.com.vn/xsmt/ngay-'+ngay_cap_nhat, { cache: 'no-store' })
        .then(function(response) {
            return response.text();
        })
        .then(function(html) {
          let domParser = new DOMParser();
          let docP = domParser.parseFromString(html, "text/html");
          var bangketqua = docP.querySelector('.tbl-xsmn');
          if (bangketqua) {
            var ngay = bangketqua.querySelector('.dockq').getAttribute("title").match(/\d{2}([\/.-])\d{2}\1\d{4}/g)[0].trim().replace(/\-/g, "/");;
            var tinh = [];
            bangketqua.querySelectorAll('a').forEach(function (kq, idx) {
                var t = kq.innerText.trim();
              if(t.trim()==='Thừa Thiên Huế')
                t='thuathienhue';
              else if(t.trim()==='Đắc Lắc')
                t='daklak';
              else if(t.trim()==='Đắc Nông')
                t='daknong';
              if (!kq.getAttribute("title"))
                  tinh.push({ id: idx, dai: 'kqxs_' + seft.xoa_dau(t.trim().replace(/ /g, '')), data: { field_ngay: dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd") } });
            })
            bangketqua.querySelectorAll('tr').forEach(function (dong, idx) {
                dong.querySelectorAll('td').forEach(function (cot, idc) {
                    if (!cot.getAttribute("title")) {
                        var fidx = tinh.findIndex(function (d) { return d.id === idc; })
                        var giai = cot.innerText.trim();//.split(/\n/g);
                        if (fidx !== -1) {
                            var objKQ = tinh[fidx]["data"];
                            if (Object.keys(objKQ).length === 1) {
                                objKQ['field_dau'] = giai.trim();
                            }
                            else if (bangketqua.querySelectorAll('tr').length - 1 === idx)
                                objKQ['field_duoi'] = giai.trim();
                            else {
                                var cung_giai = cot.innerHTML.split("<br>");
                                if (cung_giai.length === 1)
                                    objKQ['field_so' + Object.keys(objKQ).length] = giai.trim();
                                else {
                                    cung_giai.forEach(function (g) {
                                        objKQ['field_so' + Object.keys(objKQ).length] = g.trim();
                                    });
                                }
                            }
                        }
                    }
                });
            });
            tinh.forEach(function(up){
              up.data['id']=seft.guid('kqxs');
              up.data['thu']=seft.days[chuyenNgay(up.data['field_ngay'],"yyyymmdd").getDay()];
              seft.csm_obj_updates({app_id:'kqxs',obj_name:up.dai,command:"create",obj_update:up.data,e_where:{"field": "id","type": "eq","value":up.data.id}},function(msgU){
                if(msgU.success===true)
                  thongbao('Đã cập nhật xong kết quả')
              });
            });
          }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
        //Kết Quả Miền Bắc
        fetch(link+'https://xskt.com.vn/xsmb/ngay-'+ngay_cap_nhat, { cache: 'no-store' })
        .then(function(response) {
            return response.text();
        })
        .then(function(html) {
          let domParser = new DOMParser();
          let docP = domParser.parseFromString(html, "text/html");
          var bangketqua = docP.querySelector('[id^="MB"]');
          if (bangketqua) {
            var ngay = bangketqua.querySelector('.dockq').getAttribute("title").match(/\d{2}([\/.-])\d{2}\1\d{4}/g)[0].trim().replace(/\-/g, "/");
            var tinh = 'mienbac';
            tinh = 'kqxs_' + seft.xoa_dau(tinh.trim().replace(/ /g, ''));
            var objKQ={field_ngay:dateFormat(chuyenNgay(ngay.trim(),"dd/mm/yyyy"),"yyyymmdd")},idxKQ=27;
            bangketqua.querySelectorAll('tr').forEach(function (kq) {
                kq.querySelectorAll('td').forEach(function (cot, idx) {
                    if (cot.querySelector("em") || cot.querySelector("p")) {
                      var giai = cot.innerText.trim();
                      var cung_giai = cot.innerHTML.replace("<p>","").replace("</p>","").replace(new RegExp("<br>","g")," ").split(" ");
                      if (idxKQ === 27)
                      {
                        objKQ['field_duoi'] = giai.trim();
                        idxKQ--;
                      }
                      else if (idxKQ === 4)
                      {
                        var cung_giai = cot.innerText.split(" ");
                        objKQ['field_dau'] = cung_giai[3].trim();
                        objKQ['field_so2'] = cung_giai[2].trim();
                        objKQ['field_so3'] = cung_giai[1].trim();
                        objKQ['field_so4'] = cung_giai[0].trim();
                      }
                      else {
                        if (cung_giai.length === 1)
                        {
                          objKQ['field_so' + idxKQ] = giai.trim();
                          idxKQ--;
                        }
                        else {
                          cung_giai.forEach(function (g) {
                            objKQ['field_so' + idxKQ] = g.trim();
                            idxKQ--;
                          });
                        }
                      }
                    }
                });
            });
            objKQ['thu']=seft.days[chuyenNgay(objKQ['field_ngay'],"yyyymmdd").getDay()];
            objKQ['id']=seft.guid('kqxs');
            seft.csm_obj_updates({app_id:'kqxs',obj_name:tinh,command:"create",obj_update:objKQ,e_where:{"field": "id","type": "eq","value":objKQ.id}},function(msgU){
              if(msgU.success===true)
                thongbao('Đã cập nhật xong kết quả')
            });
          }
        })
        .catch(function(err) {  
            console.log('Failed to fetch page: ', err);  
        });
      }
    },
    template:`
        <div class="container pt-0 pb-0 kqxs">
          <div class="row p-1">
            <div class="col-md-3 p-1 csm_border">
              <div class="dx-field">
                <div class="dx-field-label">Từ Ngày</div>
                <div class="dx-field-value">
                  <div id="tdate"></div>
                </div>
              </div>
              <div class="dx-field">
                <div class="dx-field-label">Đến Ngày</div>
                <div class="dx-field-value">
                  <div id="fdate"></div>
                </div>
              </div>
              <div class="dx-field">
                <div class="dx-field-label">Miền</div>
                <div class="dx-field-value">
                  <div id="mien"></div>
                </div>
              </div>
              <div class="dx-field">
                <div class="dx-field-label">Màu Tô</div>
                <div class="dx-field-value">
                  <div id="chon_mau"></div>
                </div>
              </div>
              <div class="dx-field">
                <div class="dx-field-label">Thứ Tuần</div>
                <div class="dx-field-value">
                  <div id="thu_tuan"></div>
                </div>
              </div>
              <div class="dx-field">
                <div id="progress"><div id="progressBarStatus"></div></div>
              </div>
              <div class="dx-field text-center" :class='unlock?"":"hidden"'>
                <button class="btn m-3" @click="chay_cap_nhat">Cập nhật kết quả</button>
              </div>
            </div>
            <div class="col-md-9 p-1 csm_border">
              <div class="row">
                <div class="col-md-6">
                  <div class="dx-field">
                    <div class="dx-field-label">Loại Thống Kê</div>
                    <div class="dx-field-value">
                      <div id="loai_tk"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Loại Tìm</div>
                    <div class="dx-field-value">
                      <div id="loai_tim"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Chu Kỳ</div>
                    <div class="dx-field-value">
                      <div id="so_ky"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Lấy số Kỳ</div>
                    <div class="dx-field-value">
                      <div id="lay_so_ky"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Đếm KQ1 <=</div>
                    <div class="dx-field-value">
                      <div id="dem_be_hon"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">KXH KQ2 >=</div>
                    <div class="dx-field-value">
                      <div id="kxh_phai_lonhon"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Đếm KQ3 <=</div>
                    <div class="dx-field-value">
                      <div id="dem_nho_hon"></div>
                    </div>
                  </div>
                  <div style=" border: solid 1px green; padding: 5px; ">
                    <div class="dx-field">
                      <div class="dx-field-label">KXH Từ >=</div>
                      <div class="dx-field-value">
                        <div id="kxh_tu"></div>
                      </div>
                    </div>
                    <div class="dx-field">
                      <div class="dx-field-label">KXH Đến <=</div>
                      <div class="dx-field-value">
                        <div id="kxh_den"></div>
                      </div>
                    </div>
                    <div class="dx-field">
                      <div class="dx-field-label">Lọc Sâu</div>
                      <div class="dx-field-value">
                        <div id="kxh_locsau"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="dx-field">
                    <div class="dx-field-label">Chọn Đài</div>
                    <div class="dx-field-value">
                      <div id="chon_dai"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Sắp Xếp</div>
                    <div class="dx-field-value">
                      <div id="sap_xep"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Lịch Sử Số Chủ</div>
                    <div class="dx-field-value">
                      <div id="chon_dai_so_chu"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Tìm Số Chủ</div>
                    <div class="dx-field-value">
                      <div id="so_chu"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Đếm Số Chủ >=</div>
                    <div class="dx-field-value">
                      <div id="dem_lon_hon"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Đếm Số Lần <=</div>
                    <div class="dx-field-value">
                      <div id="dem_to_nho_hon"></div>
                    </div>
                  </div>
                  <div class="dx-field">
                    <div class="dx-field-label">Max LSBĐ >=</div>
                    <div class="dx-field-value">
                      <div id="ls_bat_dau"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="dx-field text-center">
                <button class="btn m-3" @click="xem_ket_qua">Kết Quả</button>
                <button class="btn m-3" @click="chay_thong_ke">Thống Kê</button>
                <button class="btn m-3" @click="thong_ke_moi">Thống Kê Mới</button>
              </div>
            </div>
          </div>
          <div class="row p-1">
            <div class="col-md-12 p-1 csm_border">
              <div v-if="isXemthuong===true"  style="min-height:200px">
                <div id="ket_qua" class="">
                  <div class="box_kqxs" v-if="ds_dai_chon_xem_ket_qua.length>0">
                    <div class="row" :class="mien==='MB'?'bkqtinhmienbac':'bkqtinhmiennam'" width="100%">
                      <div class="mt-3 mb-3" :class="'col-md-'+(12/ds_dai_chon_xem_ket_qua.length)" v-for="(dai, idx) in ds_dai_chon_xem_ket_qua">
                        <div class="box_kqxs_content card">
                          <div class="row card-header">
                            <div class="card-title">
                              {{ds_thu.find(t=>t.ma===dai.thu)?ds_thu.find(t=&gt;t.ma===dai.thu).ten:''}} {{dai.ten_dai}} {{dai.ngay}}
                            </div>
                          </div>
                          <div class="card-body p-0">
                            <div class="row">
                              <div class="giaidbl col-3 p-0">Giải ĐB</div>
                              <div class="giaidb col-9 p-0">
                                <div class="giaiSo"><span style=" margin-top: 15px; display: inline-block; ">{{dai.data.field_duoi}}</span></div>
                              </div>
                            </div>
                            <div class="row bg-gray">
                              <div class="giai1l col-3 p-0">Giải nhất</div>
                              <div class="giai1 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so17}}</div>
                              </div>
                              <div class="giai1 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so26}}</div>
                              </div>
                            </div>
                            <div class="row">
                              <div class="giai2l col-3 p-0">Giải nhì</div>
                              <div class="giai2 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so16}}</div>
                              </div>
                              <div class="giai2 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so24}}</div>
                                <div class="giaiSo">{{dai.data.field_so25}}</div>
                              </div>
                            </div>
                            <div class="row bg-gray">
                              <div class="giai3l col-3 p-0">Giải ba</div>
                              <div class="giai3 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so15}}</div>
                                <div class="giaiSo">{{dai.data.field_so14}}</div>
                              </div>
                              <div class="giai3 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so18}}</div>
                                <div class="giaiSo">{{dai.data.field_so19}}</div>
                                <div class="giaiSo">{{dai.data.field_so20}}</div>
                                <div class="giaiSo">{{dai.data.field_so21}}</div>
                                <div class="giaiSo">{{dai.data.field_so22}}</div>
                                <div class="giaiSo">{{dai.data.field_so23}}</div>
                              </div>
                            </div>
                            <div class="row">
                              <div class="giai4l col-3 p-0">Giải tư</div>
                              <div class="giai4 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so13}}</div>
                                <div class="giaiSo">{{dai.data.field_so12}}</div>
                                <div class="giaiSo">{{dai.data.field_so11}}</div>
                                <div class="giaiSo">{{dai.data.field_so10}}</div>
                                <div class="giaiSo">{{dai.data.field_so9}}</div>
                                <div class="giaiSo">{{dai.data.field_so8}}</div>
                                <div class="giaiSo">{{dai.data.field_so7}}</div>
                              </div>
                              <div class="giai4 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so14}}</div>
                                <div class="giaiSo">{{dai.data.field_so15}}</div>
                                <div class="giaiSo">{{dai.data.field_so16}}</div>
                                <div class="giaiSo">{{dai.data.field_so17}}</div>
                              </div>
                            </div>
                            <div class="row bg-gray">
                              <div class="giai5l col-3 p-0">Giải năm</div>
                              <div class="giai5 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so6}}</div>
                              </div>
                              <div class="giai5 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so8}}</div>
                                <div class="giaiSo">{{dai.data.field_so9}}</div>
                                <div class="giaiSo">{{dai.data.field_so10}}</div>
                                <div class="giaiSo">{{dai.data.field_so11}}</div>
                                <div class="giaiSo">{{dai.data.field_so12}}</div>
                                <div class="giaiSo">{{dai.data.field_so13}}</div>
                              </div>
                            </div>
                            <div class="row">
                              <div class="giai6l col-3 p-0">Giải sáu</div>
                              <div class="giai6 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so5}}</div>
                                <div class="giaiSo">{{dai.data.field_so4}}</div>
                                <div class="giaiSo">{{dai.data.field_so3}}</div>
                              </div>
                              <div class="giai6 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_so5}}</div>
                                <div class="giaiSo">{{dai.data.field_so6}}</div>
                                <div class="giaiSo">{{dai.data.field_so7}}</div>
                              </div>
                            </div>
                            <div class="row bg-gray">
                              <div class="giai7l col-3 p-0">Giải bảy</div>
                              <div class="giai7 col-9 p-0" v-if="mien!=='MB'">
                                <div class="giaiSo">{{dai.data.field_so2}}</div>
                              </div>
                              <div class="giai7 col-9 p-0" v-else>
                                <div class="giaiSo">{{dai.data.field_dau}}</div>
                                <div class="giaiSo">{{dai.data.field_so2}}</div>
                                <div class="giaiSo">{{dai.data.field_so3}}</div>
                                <div class="giaiSo">{{dai.data.field_so4}}</div>
                              </div>
                            </div>
                            <div class="row" v-if="mien!=='MB'">
                              <div class="giai8l col-3 p-0">Giải 8</div>
                              <div class="giai8 col-9 p-0">
                                <div class="giaiSo">{{dai.data.field_dau}}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="row">
                      <div id="grdKQ">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else style="min-height:200px">
                <div id="thong_ke"></div>
              </div>
            </div>
          </div>
        </div>
    `,
      style:`
        .kqxs .dx-header-row > td[role="columnheader"]> div.dx-datagrid-text-content {  
          font-size: 10pt;  
          font-weight: bold;  
          color: black;
        }  
        .kqxs .dx-header-row > td[role="columnheader"],.kqxs .bg-vach{
          background: #eeeff1 !important;
        }  
        .kqxs .btn{
          background: #083671de;
          color: #fff;
        }
        .kqxs .btn:hover {
          background: #0A1D56;
          color: #fff;
        }
        .kqxs .csm_border{
          border-radius: 3px;
          border: 1px solid #0A1D56;
          padding: 10px;
        }
        .kqxs .dx-progressbar-status {
          float: unset !important;
          text-align: center;
          font-size: 10pt;
          font-weight: bold;
        }
        .kqxs .dx-tabpanel-container {
          margin-top: -37px !important;
        }
        .kqxs .complete .dx-progressbar-range {
          background-color: green;
        }
        .kqxs .text-bold{
          text-align: center;
          font-size: 10pt;
          font-weight: bold;
        }
        .kqxs .dx-datagrid td{
          text-align: center !important;
        }
      
      .box_kqxs .title,
      .box_kqxs .title a{
        text-align: center;
        font-family: "Times New Roman", Times, serif;
        color: #fff;
        font-size: 16px;
        vertical-align: middle;
        font-weight: 700;
        text-transform: uppercase;
      }
      .box_kqxs .top .iconrightkq a,
      ul.menu li a,
      ul.menu2 li a {
        font-family: Arial, Helvetica, sans-serif;
        text-decoration: none;
      }
      .box_kqxs .title a:hover {
        color: #ff0;
      }
      .box_kqxs .top .bkl {
        background: url(/template/2016/images/bkq-top1.png) top left no-repeat;
        padding-left: 13px;
      }
      .box_kqxs .top .bkr {
        background: url(/template/2016/images/bkq-top3.png) top right no-repeat;
        padding-right: 13px;
      }
      .box_kqxs .top .bkm {
        background: url(/template/2016/images/bkq-top2.png) top repeat-x;
        height: 40px;
        line-height: 30px;
      }
      .box_kqxs .top .icon {
        text-align: center;
        width: 20px;
        float: left;
      }
      .box_kqxs .top .title {
        text-align: left;
        float: left;
        padding-left: 10px;
        margin-top: 5px;
      }
      .box_kqxs .top .title a,
      .box_kqxs .top .title a:visited {
        color: #fff;
      }
      .box_kqxs .top .title a:hover {
        color: #ff0;
      }
      .box_kqxs .top .icon .icon_new {
        background: url(/template/2016/images/new.gif) left center no-repeat;
        display: block;
        width: 20px;
        height: 20px;
        margin-top: 7px;
      }
      .box_kqxs .top .icon .icon_old {
        background: url(/template/2016/images/old.gif) left center no-repeat;
        display: block;
        width: 20px;
        height: 20px;
        margin-top: 7px;
      }
      .box_kqxs .top .iconrightkq {
        float: right;
        margin-left: 5px;
        text-align: left;
        text-align: right;
        margin-top: 10px;
      }
      .box_kqxs .top .iconrightkq a {
        color: #f5f5f5;
        font-size: 11px;
        font-weight: 400;
      }
      .box_kqxs .top .iconrightkq a:hover {
        color: #ff0;
        text-decoration: none;
      }
      .box_kqxs .top .iconright {
        float: right;
        margin-left: 5px;
        width: 20px;
        text-align: right;
        margin-top: 10px;
      }
      .box_kqxs .top .iconright a.icontk {
        display: block;
        background: url(/template/2016/images/icon-thongke.gif) no-repeat;
        width: 25px;
        height: 14px;
      }
      .box_kqxs .bottom .bkl {
        background: url(/template/2016/images/bkq-bottom1.png) top left no-repeat;
        padding-left: 13px;
      }
      .box_kqxs .bottom .bkr {
        background: url(/template/2016/images/bkq-bottom3.png) top right no-repeat;
        padding-right: 13px;
      }
      .box_kqxs .bottom .bkm {
        background: url(/template/2016/images/bkq-bottom2.png) top repeat-x;
        height: 17px;
        line-height: 30px;
      }
      .box_kqxs a,
      .box_kqxs a:visited {
        color: #03c;
      }
      .box_kqxs .ngay a,
      .box_kqxs .ngay a:visited,
      .box_kqxs .tngay {
        color: #03c;
      }
      .box_kqxs .loading {
        background: url(/images/loading.gif) center no-repeat;
        height: 10px;
        min-width: 10px;
        display: block;
        margin: 2px 0;
      }
      .box_kqxs .tick {
        background: url(/template/2016/images/tickcss.gif) center right no-repeat;
      }
      .box_kqxs div img {
        margin: 0 0 0 1px;
        border: 0;
        max-height: 15px;
      }
      .box_kqxs .bkqmiennam .rightcl .giai8 div img,
      .box_kqxs .bkqtinhmienbac .giai7 div img,
      .box_kqxs .bkqtinhmienbac .giaidb div img {
        max-height: 20px;
      }
      #noidung,
      .box_skitter .image {
        overflow: hidden;
      }
      .btndathang,
      .btndathang_details {
        width: 67px;
        height: 21px;
        display: inline-block;
        background: url(/template/2016/images/btnbuy.png);
        margin: 2px;
      }
      .ddsmoothmenu {
        height: 28px;
        font-size: 12px;
        padding: 5px 0;
      }
      .ddsmoothmenu ul {
        z-index: 2000;
        list-style-type: none;
        margin: 0;
        padding: 0;
      }
      .ddsmoothmenu ul li {
        display: inline;
        float: left;
        margin: 0;
        padding: 0;
      }
      .ddsmoothmenu ul li a {
        display: block;
        color: #333;
        text-decoration: none;
        text-transform: uppercase;
        font-weight: 700;
        background-image: url(/template/2016/images/menu-sepa.png);
        background-repeat: no-repeat;
        background-position: left center;
        margin: 0;
        padding: 7px 16px 5px;
      }
      .ddsmoothmenu ul li ul li a span {
        padding-left: 10px;
        background: url(/template/2016/images/arrow_1.gif) 0 center no-repeat;
      }
      .ddsmoothmenu ul li ul li {
        margin-bottom: -1px;
        display: list-item;
        float: none;
        position: inherit;
      }
      .ddsmoothmenu ul li ul li a {
        display: block;
        text-decoration: none;
        font-weight: 700;
        background: 0 0;
        height: 25px;
        line-height: 25px;
        border-bottom: 1px solid #f6f6c9;
        border-top: 1px solid #f6f6c9;
        margin: 0;
        padding: 0 5px;
      }
      .ddsmoothmenu ul li ul li a.parent {
        background: url(/template/2016/images/submenu-pointer-bottom.png) right center
          no-repeat;
      }
      .ddsmoothmenu ul li a.no-sepa {
        background-image: none;
      }
      * html .ddsmoothmenu ul li a {
        display: inline-block;
      }
      .ddsmoothmenu ul li a:link,
      .ddsmoothmenu ul li a:visited {
        color: #fff;
        white-space: nowrap;
      }
      .ddsmoothmenu ul li ul li a:link,
      .ddsmoothmenu ul li ul li a:visited {
        color: #333;
        text-transform: none;
        white-space: nowrap;
      }
      .ddsmoothmenu ul li ul li a:hover {
        color: #ec0000;
        text-transform: none;
        white-space: nowrap;
      }
      .ddsmoothmenu ul li ul li a.selected {
        background-color: #feffe5;
        background-image: none;
        color: #ec0000;
        padding-bottom: 0;
      }
      .ddsmoothmenu ul li ul li a.selected:hover {
        padding-bottom: 0;
      }
      .ddsmoothmenu ul li a:hover {
        background-color: #feffe5;
        background-image: none;
        color: #333;
        border-radius: 5px;
      }
      .ddsmoothmenu ul li a.no-child-menu:hover {
        color: #333;
        background-color: transparent;
      }
      .ddsmoothmenu ul li ul {
        position: absolute;
        left: 0;
        display: none;
        visibility: hidden;
      }
      .ddsmoothmenu ul li ul.submenu-border {
        background-color: #feffe5;
        border-radius: 0 0 5px 5px;
        padding: 5px 0;
        border: 1px solid #ccc;
        border-top: 0;
        margin-top: 3px;
      }
      .ddsmoothmenu ul li ul li ul.submenu-border {
        background-color: #feffe5;
        border-radius: 0 0 5px 5px;
        margin-left: -5px;
        top: 0;
        position: absolute;
        padding: 5px 0;
        margin-top: 0;
      }
      ul#menukqxstinh.submenu-border {
        width: 480px;
      }
      ul#menukqxstinh.submenu-border div.submenu-border {
        width: 100%;
      }
      ul#menukqxstinh.submenu-border li {
        width: 33%;
        float: left;
      }
      ul#menukqxstinh.submenu-border li.root {
        width: auto;
        display: block;
        float: none;
        text-align: center;
        clear: both;
        background: #f0d88e;
        padding: 0;
      }
      ul#menukqxstinh.submenu-border li.root a:hover {
        background: #f0d88e;
      }
      ul#menukqxstinh.submenu-border li.root a span {
        background: 0 0;
      }
      .ddsmoothmenu ul li ul li ul {
        top: 0;
      }
      .ddsmoothmenu ul li ul li a.top-menu-popup-a {
        color: #333;
        border: none;
        border-top: dotted 1px #ccc;
        padding-left: 10px;
        font-weight: 400;
        text-transform: none;
        background-image: none;
      }
      .ddsmoothmenu ul li ul li a.top-menu-popup-a:hover {
        background-color: #f2f2f2;
      }
      * html .ddsmoothmenu {
        height: 1%;
      }
      .downarrowclass {
        position: absolute;
        top: 12px;
        right: 7px;
      }
      .rightarrowclass {
        position: absolute;
        top: 6px;
        right: 5px;
      }
      #jquery-lightbox,
      #jquery-overlay,
      #lightbox-nav,
      .ddshadow {
        position: absolute;
        top: 0;
        left: 0;
      }
      .ddshadow {
        width: 0;
        height: 0;
        background: silver;
      }
      .toplevelshadow {
        opacity: 0.8;
      }
      span.top-menu-popup-span {
        color: #c00d0e;
        display: block;
        font-size: 14px;
        font-weight: 700;
        padding-bottom: 10px;
        padding-top: 10px;
        text-transform: uppercase;
      }
      .top-menu-popup {
        min-width: 170px;
      }
      .top-menu-popup ul li a {
        font-weight: 400 !important;
      }
      .ddsmoothmenu ul li ul li.child a {
        font-weight: 400;
        padding-left: 5px;
      }
      .ddsmoothmenu ul li ul li.child a span {
        background: url(/template/2016/images/arrow_02.gif) -8px center no-repeat;
        padding-left: 15px;
      }
      .ddsmoothmenu ul li a.selected,
      .ddsmoothmenu ul li a.selected:hover {
        background-color: #feffe5;
        background-image: none;
        color: #333;
        padding-bottom: 10px;
        border-radius: 5px 5px 0 0;
      }
      #hottoday {
        border: 1px solid #9e9e9e;
      }
      #hottoday .border {
        border: none;
      }
      body {
        font: 11px Arial, Helvetica, sans-serif;
      }
      div.banner_ads,
      div.header_ext {
        position: relative;
        float: left;
        overflow: hidden;
      }
      ul.menu li a.hottoday_mien,
      ul.menu2 li a.hottoday_tinh7 {
        font-weight: 400;
      }
      .bkqtinhmiennam .giai4 div:nth-child(n + 5) {
        width: 33.33%;
      }
      #hottoday .hottoday_mien,
      #hottoday .hottoday_tinh25 {
        color: #000;
        text-align: right;
      }
      #hottoday table td:hover {
        color: #4a4a4a;
        background-color: #c4e1ff;
      }
      .modulesLR.moduleBrown {
        border: 1px solid #9e9e9e;
      }
      .modulesLR.moduleBrown .body-r {
        text-align: left;
        padding: 0 3px;
      }
      .ui-button,
      .ui-datepicker th,
      .ui-state-default,
      .ui-widget-content .ui-state-default,
      .ui-widget-header .ui-state-default {
        text-align: center;
      }
      .modulesLR.moduleBrown .title-l {
        background: #eee;
        color: #000;
        border: 1px solid #9e9e9e;
        border-top: 0;
      }
      .modulesLR.moduleBrown:hover {
        border: 1px solid #757575;
      }
      .modulesLR.moduleBrown:hover .title-l {
        border: 1px solid #757575;
        border-top: 0;
        background: #e0e0e0;
      }
      .modulesLR.moduleBrown .title-l:hover,
      .modulesLR.moduleBrown .title-l:visited {
        background: #e0e0e0;
      }
      .modulesLR.moduleBrown .title-r h1,
      .modulesLR.moduleBrown .title-r h1 a {
        color: #000;
      }
      .modulesLR.moduleBrown.moduleWhite {
        background: #fff;
      }
      #topmenu_mien_home li a {
        font-size: 13px;
        width: 82px;
      }
      #tab_xstt a {
        height: 18px;
        min-width: 110px;
        width: initial;
        padding: 8px 5px 5px;
        font-size: 12px;
        font-weight: 700;
        display: inline-block;
        margin: 0;
        border: 1px solid #ccc;
        border-bottom: 0;
        border-radius: 5px 5px 0 0;
        background: url(/template/2016/images/bgrad50.png) left -5px repeat-x #fff;
        color: #322c20;
      }
      .bkqmiennam .rightcl .giai1 div,
      .bkqmiennam .rightcl .giai2 div,
      .bkqmiennam .rightcl .giai3 div,
      .bkqmiennam .rightcl .giai4 div,
      .bkqmiennam .rightcl .giai6 div,
      .bkqmiennam .rightcl .giai7 div,
      .bkqmiennam .rightcl .giai8 div,
      .bkqmiennam .rightcl .giaidb div,
      .bkqmiennam {
        border: 1px solid #999;
        background-color: #fff;
        border-right: 0;
        border-bottom: 0;
        size: 11px;
        width: 100%;
      }
      .bkqmiennam div img {
        margin: 3px 0;
      }
      .bkqmiennam .leftcl td {
        border: 1px solid #999;
        border-top: 0;
        border-left: 0;
        text-align: center;
        height: 24px;
        padding: 0;
      }
      .bkqmiennam .ccgt {
        width: 123px;
      }
      .bkqmiennam .ccgt .rightcl .giai1,
      .bkqmiennam .ccgt .rightcl .giai2,
      .bkqmiennam .ccgt .rightcl .giai3,
      .bkqmiennam .ccgt .rightcl .giai4,
      .bkqmiennam .ccgt .rightcl .giai5,
      .bkqmiennam .ccgt .rightcl .giai6,
      .bkqmiennam .ccgt .rightcl .giai7,
      .bkqmiennam .ccgt .rightcl .giai8,
      .bkqmiennam .ccgt .rightcl .giaidb {
        font-size: 14px;
        color: #000;
        text-align: right;
        padding-right: 10px;
      }
      .bkqmiennam .rightcl td {
        border: 1px solid #999;
        border-top: 0;
        border-left: 0;
        text-align: center;
        height: 24px;
        padding: 0;
      }
      .bkqmiennam .leftcl .thu {
        height: 24px;
        font-weight: 700;
        font-size: 13px;
      }
      .bkqmiennam .leftcl .ngay {
        height: 24px;
        font-weight: 700;
        font-size: 13px;
        
      }
      .bkqmiennam .leftcl .ngay a,
      .bkqmiennam .leftcl .ngay a:visited {
        color: #000;
      }
      .bkqmiennam .rightcl .tinh {
        height: 24px;
        font-weight: 700;
        font-size: 13px;
      }
      .bkqmiennam .rightcl .matinh {
        height: 24px;
        font-weight: 700;
        font-size: 13px;
        
      }
      .bkqmiennam .leftcl .giai8 {
        height: 36px;
        font-size: 13px;
      }
      .bkqmiennam .rightcl .giai8 {
        height: 36px;
        font-weight: 700;
        color: maroon;
        font-size: 24px;
        line-height: 100%;
      }
      .bkqmiennam .leftcl .giai7 {
        height: 25px;
        font-size: 13px;
        
      }
      .bkqmiennam .rightcl .giai7 {
        height: 25px;
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqmiennam .leftcl .giai6 {
        height: 66px;
        font-size: 13px;
      }
      .bkqmiennam .rightcl .giai6 {
        height: 66px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
      }
      .bkqmiennam .rightcl .giai6 div {
        height: 16px;
        padding: 0;
        margin: 3px 0;
      }
      .bkqmiennam .leftcl .giai5 {
        height: 25px;
        font-size: 13px;
        
      }
      .bkqmiennam .rightcl .giai5 {
        height: 25px;
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqmiennam .rightcl .giai5 div {
        display: block;
      }
      .bkqmiennam .leftcl .giai4 {
        height: 154px;
        font-size: 13px;
      }
      .bkqmiennam .rightcl .giai4 {
        height: 154px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
      }
      .bkqmiennam .rightcl .giai4 div {
        height: 16px;
        padding: 0;
        margin: 4px 0;
        clear: both;
      }
      .bkqmiennam .leftcl .giai3 {
        height: 45px;
        font-size: 13px;
        
      }
      .bkqmiennam .rightcl .giai3 {
        height: 45px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
        
      }
      .bkqmiennam .rightcl .giai3 div {
        height: 16px;
        padding: 0;
        margin: 2px 0;
      }
      .bkqmiennam .leftcl .giai2 {
        height: 25px;
        font-size: 13px;
      }
      .bkqmiennam .rightcl .giai2 {
        height: 25px;
        font-size: 16px;
        font-weight: 700;
      }
      .bkqmiennam .leftcl .giai1 {
        height: 25px;
        font-size: 13px;
        
      }
      .bkqmiennam .rightcl .giai1 {
        height: 25px;
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqmiennam .leftcl .giaidb {
        height: 34px;
        font-size: 13px;
      }
      .leftcl .giaidb a {
        color: #000;
      }
      .bkqmiennam .rightcl .giaidb {
        height: 34px;
        font-weight: 700;
        color: maroon;
        font-size: 18px;
      }
      .bkqmiennam .rightcl .giaidb a {
        color: maroon;
      }
      .bkqmienbac {
        border: 1px double #999;
        background: #fff;
        border-right: 0;
        border-bottom: 0;
        size: 11px;
        width: 100%;
      }
      .bkqmienbac .title {
        background-image: url(/template/2016/images/bgboxkqxs.jpg);
        height: 35px;
        text-align: left;
        color: #fff;
        font-size: 16px;
        vertical-align: middle;
        font-weight: 700;
        padding-left: 25px;
      }
      .bkqmienbac .leftcl td,
      .bkqmienbac .rightcl td {
        border: 1px double #999;
        border-top: 0;
        border-left: 0;
        text-align: center;
        height: 24px;
        padding: 1px;
      }
      .bkqmienbac .thu {
        border: 1px double #999;
        border-top: 0;
        border-left: 0;
        height: 30px;
        font-weight: 700;
        font-size: 13px;
        text-align: center;
      }
      .bkqmienbac .ngay {
        border: 1px double #999;
        border-top: 0;
        border-left: 0;
        height: 30px;
        text-align: left;
        padding-left: 20px;
        font-weight: 700;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .matinh,
      .bkqmienbac .rightcl .tinh {
        height: 24px;
        font-size: 13px;
        font-weight: 700;
      }
      .bkqmienbac .phathanh {
        float: right;
      }
      .bkqmienbac .rightcl .matinh {
        
      }
      .bkqmienbac .leftcl .giai8 {
        height: 36px;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .giai8 {
        height: 36px;
        font-weight: 700;
        color: #903;
        font-size: 24px;
      }
      .bkqmienbac .leftcl .giai7 {
        height: 24px;
        font-size: 13px;
        
      }
      .bkqmienbac .rightcl .giai7 {
        height: 24px;
        font-size: 18px;
        font-weight: 700;
        
        color: maroon;
      }
      .bkqmienbac .leftcl .giai6 {
        height: 24px;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .giai6 {
        height: 24px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
      }
      .bkqmienbac .leftcl .giai5 {
        height: 66px;
        font-size: 13px;
        
      }
      .bkqmienbac .rightcl .giai5 {
        height: 66px;
        font-size: 16px;
        font-weight: 700;
        
        line-height: 130%;
      }
      .bkqmienbac .leftcl .giai4 {
        height: 66px;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .giai4 {
        height: 66px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
      }
      .bkqmienbac .leftcl .giai3 {
        height: 66px;
        font-size: 13px;
        
      }
      .bkqmienbac .rightcl .giai3 {
        height: 66px;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
        
      }
      .bkqmienbac .leftcl .giai2 {
        height: 24px;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .giai2 {
        height: 24px;
        font-size: 16px;
        font-weight: 700;
      }
      .bkqmienbac .leftcl .giai1 {
        height: 24px;
        font-size: 13px;
        
      }
      .bkqmienbac .rightcl .giai1 {
        height: 24px;
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqmienbac .leftcl .giaidb {
        height: 34px;
        font-size: 13px;
      }
      .bkqmienbac .rightcl .giaidb {
        height: 34px;
        font-weight: 700;
        color: maroon;
        font-size: 22px;
      }
      .bkqtinhmiennam .ngay,
      .bkqtinhmiennam .thu {
        color: #03c;
        font-weight: 700;
        
      }
      .bkqtinhmiennam {
        border: 1px solid #999;
        border-right: 0;
        border-bottom: 0;
        size: 11px;
        width: 100%;
      }
      .bkqtinhmiennam td {
        border: 1px solid #999;
        border-top: 0;
        border-left: 0;
        text-align: center;
        height: 24px;
        padding: 0;
      }
      .bkqtinhmiennam .thu {
        font-size: 13px;
      }
      .bkqtinhmiennam .ngay {
        font-size: 13px;
        text-align: left;
        font-style: italic;
        padding-left: 10px;
      }
      .bkqtinhmiennam .giaithuong {
        font-weight: 700;
        font-size: 13px;
        
        text-align: center;
        color: #b00;
      }
      .bkqtinhmiennam span.loaive {
        float: right;
        padding-right: 10px;
        color: #000;
      }
      .bkqtinhmiennam .tinh {
        font-weight: 700;
        font-size: 13px;
      }
      .bkqtinhmiennam .matinh {
        font-weight: 700;
        font-size: 13px;
        
      }
      .bkqtinhmiennam .giai8l {
        font-size: 13px;
      }
      .bkqtinhmiennam .giai8 {
        font-weight: 700;
        color: maroon;
        font-size: 24px;
        line-height: 100%;
      }
      .bkqtinhmiennam .giai4 div,
      .bkqtinhmiennam .giai6 div {
        line-height: 150%;
        display: inline-block;
        font-weight: 700;
      }
      .bkqtinhmiennam .gtgiai8 {
        font-weight: 700;
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai7l {
        font-size: 13px;
        
      }
      .bkqtinhmiennam .giai7 {
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqtinhmiennam .gtgiai7 {
        font-weight: 700;
        
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai6l {
        font-size: 13px;
      }
      .bkqtinhmiennam .gtgiai6 {
        font-weight: 700;
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai6 div {
        width: 33%;
        float: left;
        font-size: 16px;
      }
      .bkqtinhmiennam .giai5l {
        font-size: 13px;
        
      }
      .bkqtinhmiennam .giai5 {
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqtinhmiennam .gtgiai5 {
        font-weight: 700;
        
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai4l {
        font-size: 13px;
      }
      .bkqtinhmiennam .giai4 div {
        width: 24%;
        font-size: 16px;
      }
      .bkqtinhmiennam .giai4 {
        text-align: center;
      }
      .bkqtinhmiennam .gtgiai4 {
        font-weight: 700;
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai3,
      .bkqtinhmiennam .giai3l {
        font-size: 13px;
        
      }
      .bkqtinhmiennam .giai3 {
        text-align: center;
      }
      .bkqtinhmiennam .gtgiai3 {
        
      }
      .bkqtinhmiennam .giai3 div {
        width: 49%;
        display: inline-block;
        float: left;
        font-size: 16px;
        font-weight: 700;
      }
      .bkqtinhmiennam .giai2l {
        font-size: 13px;
      }
      .bkqtinhmiennam .giai2 {
        font-size: 16px;
        font-weight: 700;
      }
      .bkqtinhmiennam .gtgiai2,
      .bkqtinhmiennam .gtgiai3 {
        font-weight: 700;
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giai1l {
        font-size: 13px;
        
      }
      .bkqtinhmiennam .giai1 {
        font-size: 16px;
        font-weight: 700;
        
      }
      .bkqtinhmiennam .gtgiai1 {
        font-weight: 700;
        
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
      }
      .bkqtinhmiennam .giaidbl {
        font-size: 13px;
      }
      .bkqtinhmiennam .giaidb {
        font-weight: 700;
        color: maroon;
        font-size: 18px;
      }
      .bkqtinhmiennam .gtgiaianui,
      .bkqtinhmiennam .gtgiaianui5,
      .bkqtinhmiennam .gtgiaidb,
      .bkqtinhmiennam .gtgiaidbp {
        font-size: 14px;
        text-align: right;
        padding-right: 7px;
        font-weight: 700;
      }
      .bkqtinhmiennam .giaianui {
        text-align: right;
        padding-right: 7px;
      }
      .bkqtinhmiennam .giaianui5 {
        text-align: right;
        padding-right: 7px;
        
      }
      .bkqtinhmiennam .gtgiaianui5,
      .bkqtinhmiennam .gtgiaidbp {
        
      }
      .bkqtinhmiennam .giaidbp {
        text-align: right;
        padding-right: 7px;
        
      }
      .bkqtinhmiennam td.bxdauduoi {
        padding: 1px;
        width: 100px;
        vertical-align: top;
      }
      .bkqtinhmienbac {
        border: 1px solid #999;
        background: #fff;
        border-bottom: 0;
        size: 11px;
        width: 100%;
      }
      .bkqtinhmienbac .giai1,
      .bkqtinhmienbac .giai1l,
      .bkqtinhmienbac .giai3,
      .bkqtinhmienbac .giai3l,
      .bkqtinhmienbac .giai5,
      .bkqtinhmienbac .giai5l,
      .bkqtinhmienbac .giai7,
      .bkqtinhmienbac .giai7l,
      .bkqtinhmienbac .giaidbphul,
      .bkqtinhmienbac .giaithuong,
      .bkqtinhmienbac .gtgiai1,
      .bkqtinhmienbac .gtgiai3,
      .bkqtinhmienbac .gtgiai7,
      .bkqtinhmienbac .gtgiaidbphu,
      .bkqtinhmienbac .matinh,
      .bkqtinhmienbac .ngay,
      .bkqtinhmienbac .thu,
      .bkqtinhmienbac td.bxdauduoi {
        
      }
      .bkqtinhmienbac td {
        border: 1px solid #999;
        border-top: 0;
        border-left: 0;
        text-align: center;
        height: 24px;
        padding: 0;
      }
      .bkqtinhmienbac .thu {
        font-weight: 700;
        font-size: 13px;
      }
      .bkqtinhmienbac .ngay {
        font-weight: 700;
        font-size: 13px;
        text-align: left;
        font-style: italic;
        padding-left: 10px;
        color: #03c;
      }
      .bkqtinhmienbac .giaithuong {
        font-weight: 700;
        font-size: 13px;
        text-align: center;
        color: #bf0000;
        width: 120px;
      }
      .bkqtinhmienbac span.loaive {
        float: right;
        color: #000;
        padding-right: 10px;
      }
      .bkqtinhmienbac .gtgiai4,
      .bkqtinhmienbac .gtgiai5,
      .bkqtinhmienbac .gtgiai6,
      .bkqtinhmienbac .gtgiai7 {
        text-align: right;
        padding-right: 7px;
      }
      .bkqtinhmienbac .matinh,
      .bkqtinhmienbac .tinh {
        font-weight: 700;
        font-size: 13px;
      }
      .bkqtinhmienbac .phathanh {
        display: block;
        float: right;
        position: static;
        margin-right: 10px;
        font-style: normal;
        font-weight: 700;
      }
      .bkqtinhmienbac .tngay {
        display: block;
        float: left;
        position: static;
        margin-left: 10px;
      }
      .bkqtinhmienbac .giai6 div,
      .bkqtinhmienbac .giai7 div {
        display: inline-block;
        float: left;
        line-height: 130%;
        font-weight: 700;
      }
      .bkqtinhmienbac .phathanh .tentinh {
        color: #069;
        font-weight: 700;
        font-family: Arial, Helvetica, sans-serif;
      }
      .bkqtinhmienbac .giai8l {
        font-size: 13px;
      }
      .bkqtinhmienbac .giai8 div {
        font-weight: 700;
        color: maroon;
        font-size: 24px;
      }
      .bkqtinhmienbac .giai7l {
        font-size: 13px;
      }
      .bkqtinhmienbac .giai7 {
        font-weight: 700;
      }
      .bkqtinhmienbac .gtgiai7 {
        font-weight: 700;
        font-size: 14px;
      }
      .bkqtinhmienbac .giai7 div {
        width: 24%;
        font-size: 18px;
        color: maroon;
      }
      .bkqtinhmienbac .giai6l {
        font-size: 13px;
      }
      .bkqtinhmienbac .gtgiai6 {
        font-weight: 700;
        font-size: 14px;
      }
      .bkqtinhmienbac .giai6 div {
        width: 33%;
        font-size: 16px;
      }
      .bkqtinhmienbac .giai3 div,
      .bkqtinhmienbac .giai4 div,
      .bkqtinhmienbac .giai5 div {
        vertical-align: bottom;
        display: inline-block;
        float: left;
      }
      .bkqtinhmienbac .giai5l {
        font-size: 13px;
      }
      .bkqtinhmienbac .giai5 {
        font-size: 16px;
        font-weight: 700;
      }
      .bkqtinhmienbac .gtgiai5 {
        font-weight: 700;
        
        font-size: 14px;
      }
      .bkqtinhmienbac .giai5 div {
        font-size: 16px;
        font-weight: 700;
        margin: 4px 0 2px;
        width: 33%;
      }
      .bkqtinhmienbac .giai4l {
        font-size: 13px;
      }
      .bkqtinhmienbac .gtgiai4 {
        font-weight: 700;
        font-size: 14px;
      }
      .bkqtinhmienbac .giai4 div {
        width: 49%;
        font-size: 16px;
        font-weight: 700;
        margin: 4px 0 2px;
      }
      .bkqtinhmienbac div img {
        margin: 3px 0;
      }
      .bkqtinhmienbac .giai3l {
        font-size: 13px;
      }
      .bkqtinhmienbac .giai3 {
        font-size: 13px;
        text-align: center;
      }
      .bkqtinhmienbac .gtgiai1,
      .bkqtinhmienbac .gtgiai2,
      .bkqtinhmienbac .gtgiai3 {
        text-align: right;
        padding-right: 7px;
        font-weight: 700;
      }
      .bkqtinhmienbac .gtgiai3 {
        font-size: 14px;
      }
      .bkqtinhmienbac .giai3 div {
        font-size: 16px;
        font-weight: 700;
        margin: 4px 0 2px;
        width: 33%;
      }
      .bkqtinhmienbac .giai2l {
        font-size: 13px;
      }
      .bkqtinhmienbac .gtgiai2 {
        font-size: 14px;
      }
      .bkqtinhmienbac .giai2 div {
        width: 49%;
        display: inline-block;
        float: left;
        font-size: 16px;
        font-weight: 700;
        line-height: 130%;
      }
      .bkqtinhmienbac .giai1 div,
      .bkqtinhmienbac .giaidb div {
        display: block;
        width: 100%;
      }
      .bkqtinhmienbac .giai1l {
        font-size: 13px;
      }
      .bkqtinhmienbac .giai1 {
        font-size: 16px;
        font-weight: 700;
      }
      .bkqtinhmienbac .gtgiai1 {
        font-size: 14px;
      }
      .bkqtinhmienbac .giaidbl {
        font-size: 13px;
      }
      .giaidbl a,
      .giaidbl a:visited {
        color: #000;
      }
      .bkqtinhmienbac .giaidb {
        font-weight: 700;
        color: maroon;
        font-size: 18px;
      }
      .bkqtinhmienbac .gtgiaianui,
      .bkqtinhmienbac .gtgiaidb,
      .bkqtinhmienbac .gtgiaidbphu {
        text-align: right;
        padding-right: 7px;
        font-size: 14px;
        font-weight: 700;
      }
      .bkqtinhmienbac .giaidbphul {
        text-align: right;
        padding-right: 7px;
      }
      .bkqtinhmienbac .giaianuil {
        text-align: right;
        padding-right: 7px;
      }
      .bkqmiennam .leftcl .thu,
      .bkqmiennam .leftcl td {
        border: 1px solid #9e9e9e;
        border-top: 0;
        border-left: 0;
      }
      .bkqmiennam {
        border: 1px solid #9e9e9e;
        border-right: 0;
        border-bottom: 0;
      }
      .bangSo .border,
      .border {
        border-bottom: 0;
        border-right: 0;
      }
      .bkqtinhmienbac .giai1,
      .bkqtinhmienbac .giai3,
      .bkqtinhmienbac .giai5,
      .bkqtinhmienbac .giai7,
      .bkqtinhmienbac .ngay,
      .bkqtinhmienbac .thu {
        background: #f3f3f3;
      }
      .border {
        border-left: 1px solid #9e9e9e;
        border-top: 1px solid #9e9e9e;
      }
      .bangSo .border {
        border-left: 1px solid #e6e6e6;
        border-top: 1px solid #e6e6e6;
      }
      .box_kqxs .bkqtinhmienbac div {
        line-height: 24px;
      }
      .box_kqxs .bkqtinhmienbac div div {
        font-family: vni-centurnormal;
        font-family: Arial, Helvetica, sans-serif;
        font-weight: 700;
        line-height: 22px;
        font-size: 20px;
      }
      .box_kqxs .loading {
        margin: 0;
      }
      .box_kqxs .top .iconrightkq {
        margin-top: 7px;
      }
      .box_kqxs .bkqtinhmienbac .giaidb div {
        font-size: 44px;
        color: maroon;
        height: 50px;
      }
      .bkqmiennam.bkqmienbac {
        border: none;
      }
      .bkqmiennam.bkqmienbac .border .bangSo .border {
        border: none;
        border-left: 1px #e6e6e6 solid;
        border-top: 1px #e6e6e6 solid;
      }
      .box_kqxstt_mienbac .boxdauduoimien {
        padding: 0;
      }
      .box_kqxs .bkqtinhmienbac .giai1 div {
        font-size: 32px;
      }
      .box_kqxs .bkqtinhmienbac .giai7 div {
        font-size: 30px;
      }
      .numberHightlight {
        position: relative;
      }
      .numberHightlight.log {
        padding: 0 4px 0 0;
      }
      .numberHightlight_log {
        position: absolute;
        top: -10px;
        font-size: 8px;
        color: #000;
      }
      .boxdauduoimien .numberHightlight_log {
        top: 0;
      }
      .box_kqxs .box_kqxs_content {
        border-collapse: collapse;
        width: 100%;
      }
      .box_kqxs .bkqtinhmiennam .giaidb div {
        font-size: 44px;
        color: maroon;
      }
      .box_kqxs .bkqtinhmiennam .giai1 div {
        font-size: 32px;
      }
      .box_kqxs .bkqtinhmiennam .giai8 div {
        font-size: 44px;
        height: 55px;
        line-height: 55px;
      }
      .box_kqxs .bkqtinhmiennam .giai1 div,
      .box_kqxs .bkqtinhmiennam .giai2 div,
      .box_kqxs .bkqtinhmiennam .giai3 div,
      .box_kqxs .bkqtinhmiennam .giai4 div,
      .box_kqxs .bkqtinhmiennam .giai5 div,
      .box_kqxs .bkqtinhmiennam .giai6 div,
      .box_kqxs .bkqtinhmiennam .giai7 div,
      .box_kqxs .bkqtinhmiennam .giai8 div {
        padding: 2px 0;
        margin: 0;
      }
      .bkqtinhmiennam .ketquaHightlight,
      .bkqtinhmiennam .ketquadaysoHightlight {
        padding: 2px;
      }
      .bkqtinhmiennam .giai1 div:hover,
      .bkqtinhmiennam .giai2 div:hover,
      .bkqtinhmiennam .giai3 div:hover,
      .bkqtinhmiennam .giai4 div:hover,
      .bkqtinhmiennam .giai5 div:hover,
      .bkqtinhmiennam .giai6 div:hover,
      .bkqtinhmiennam .giai7 div:hover,
      .bkqtinhmiennam .giai8 div:hover,
      .bkqtinhmiennam .giaiActive,
      .bkqtinhmiennam .giaiActive td,
      .bkqtinhmiennam .giaiActiveClick,
      .bkqtinhmiennam .giaiActiveClick td,
      .bkqtinhmiennam .giaidb div:hover {
        background: #ffeaa5;
      }
      .box_kqxs .bkqtinhmiennam .giai3 div {
        width: 50%;
      }
      .box_kqxs .bkqtinhmiennam .giai6 div {
        width: 33.33%;
      }
      .box_kqxs .bkqtinhmiennam .giai2 div {
        width: 100%;
        font-size: 24px;
      }
      .box_kqxs .bkqtinhmiennam .giai4 div {
        min-width: 70px;
      }
      .box_kqxs .bkqtinhmiennam .giai5 div,
      .box_kqxs .bkqtinhmiennam .giai7 div {
        width: 100%;
      }
      .box_kqxs .bkqtinhmiennam td span.phathanh {
        float: left;
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
        background: 0 0;
        border: none;
      }
      .box_kqxs .bkqtinhmiennam td div.loai_ve,
      .box_kqxs .bkqtinhmiennam td div.loaive,
      .box_kqxs .bkqtinhmiennam td div.loaive_content {
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
      }
      .box_kqxs .bkqtinhmiennam td .loai_ves {
        margin-right: 5px;
      }
      .box_kqxs .bkqtinhmiennam td div.loai_ve {
        float: right;
      }
      .box_kqxs .bkqtinhmiennam td div.loaive_content {
        float: right;
        font-weight: 700;
      }
      .bkqtinhmiennam > tbody > tr:last-child > td {
        border-bottom: 0;
        padding: 0;
      }
      .bkqtinhmiennam .shadow.somien,
      .bkqtinhmiennam .shadow.sotinh {
        position: relative;
      }
      .bkqtinhmiennam .shadow.sotinh.hangActive strong,
      .bkqtinhmiennam .shadow.sotinh.hangActiveClick strong,
      .box_kqxs .shadow.somien.hangActive strong,
      .box_kqxs .shadow.somien.hangActiveClick strong {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        margin-left: 3px;
        left: 0;
        margin-top: -8px;
        background: #757171;
        background: radial-gradient(circle at 5px 5px, gold, #001);
        text-shadow: none;
        color: #fff;
        line-height: 16px;
      }
      .bkqtinhmiennam .shadow.sotinh strong::after {
        content: "";
        position: absolute;
        width: 16px;
        height: 8px;
        border-radius: 40px/20px;
        left: 2px;
        top: 3px;
      }
      .box_kqxs .bkqtinhmienbac .giai2 div,
      .box_kqxs .bkqtinhmienbac .giai6 div {
      }
      .box_kqxs .bkqtinhmienbac .giai1 div,
      .box_kqxs .bkqtinhmienbac .giai2 div,
      .box_kqxs .bkqtinhmienbac .giai3 div,
      .box_kqxs .bkqtinhmienbac .giai4 div,
      .box_kqxs .bkqtinhmienbac .giai5 div,
      .box_kqxs .bkqtinhmienbac .giai6 div,
      .box_kqxs .bkqtinhmienbac .giai7 div,
      .box_kqxs .bkqtinhmienbac .giai8 div {
        padding: 2px 0;
        margin: 0;
      }
      
      .ketquaHightlight,
      .ketquadaysoHightlight {
        background: #db2363;
        color: #fff;
        padding: 1px;
        border-radius: 50%;
        box-shadow: 3px 3px 10px -2px rgba(0, 0, 0, 0.4);
        font-weight: 400;
        font-family: Arial, Helvetica, sans-serif;
      }
      .ketquaHightlight .runLoto,
      .ketquadaysoHightlight .runLoto {
        border: none;
        background: 0 0;
        padding: 0;
        font-weight: 400;
        margin: 0;
        text-shadow: none;
      }
      .bkqtinhmienbac .ketquaHightlight,
      .bkqtinhmienbac .ketquadaysoHightlight {
        padding: 2px;
      }
      .ketquaHightlight.hangdonvi,
      .ketquadaysoHightlight.hangdonvi {
        background: #f30;
        background: radial-gradient(circle at 5px 5px, #56fdf8, #000);
      }
      .ketquaHightlight.hangchuc,
      .ketquadaysoHightlight.hangchuc {
        background: #41e241;
        background: radial-gradient(circle at 5px 5px, #41e241, #001);
      }
      .ketquaHightlight.cahaihang,
      .ketquadaysoHightlight.cahaihang {
        background: linear-gradient(
          to right,
          #07eb07,
          #517c51 48%,
          #35988c 52%,
          #3ef3ed
        );
        background: radial-gradient(circle at 5px 5px, gold, #001);
      }
      .ball.blue {
        background: radial-gradient(circle at 20px 20px, #09f, #001);
      }
      .ball.red {
        background: radial-gradient(circle at 20px 20px, #f30, #001);
      }
      .ball.green {
        background: radial-gradient(circle at 20px 20px, #0f4, #001);
      }
      .ball.yellow {
        background: radial-gradient(circle at 20px 20px, #fc0, #001);
      }
      .shadow.somien,
      .shadow.sotinh {
        min-width: 20px;
      }
      .bkqmiennam .giai1 div:hover,
      .bkqmiennam .giai2 div:hover,
      .bkqmiennam .giai3 div:hover,
      .bkqmiennam .giai4 div:hover,
      .bkqmiennam .giai5 div:hover,
      .bkqmiennam .giai6 div:hover,
      .bkqmiennam .giai7 div:hover,
      .bkqmiennam .giai8 div:hover,
      .bkqmiennam .giaidb div:hover,
      .bkqtinhmienbac .giai1 div:hover,
      .bkqtinhmienbac .giai2 div:hover,
      .bkqtinhmienbac .giai3 div:hover,
      .bkqtinhmienbac .giai4 div:hover,
      .bkqtinhmienbac .giai5 div:hover,
      .bkqtinhmienbac .giai6 div:hover,
      .bkqtinhmienbac .giai7 div:hover,
      .bkqtinhmienbac .giai8 div:hover,
      .bkqtinhmienbac .giaidb div:hover {
        background: #ffeaa5;
      }
      .box_kqxs .bkqtinhmienbac .giai3 div,
      .box_kqxs .bkqtinhmienbac .giai5 div,
      .box_kqxs .bkqtinhmienbac .giai6 div {
        width: 33.33%;
      }
      .box_kqxs .bkqtinhmienbac .giai2 div,
      .box_kqxs .bkqtinhmienbac .giai4 div {
        width: 50%;
      }
      .box_kqxs .bkqtinhmienbac .giai7 div {
        width: 25%;
        color: maroon;
      }
      .box_kqxs .bkqtinhmienbac td span.phathanh {
        float: left;
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
        background: 0 0;
        border: none;
      }
      
      .box_kqxs .bkqtinhmienbac td div.loaive {
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
      }
      .box_kqxs .bkqtinhmienbac td .loai_ves {
        margin-right: 5px;
      }
      .box_kqxs .bkqtinhmienbac td div.loai_ve {
        float: right;
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
      }
      .box_kqxs .bkqtinhmienbac td .loai_ves div.loai_ve {
        font-weight: 400;
      }
      .box_kqxs .bkqtinhmienbac td div.loaive_content {
        float: right;
        font-size: 13px;
        font-family: Arial, Helvetica, sans-serif;
        font-weight: 700;
      }
      .box_kqxs td .daysoThongke div,
      .box_kqxs td.daysoThongke div {
        font-weight: 400;
      }
      .box_kqxs td.tanso_hangdonvi {
        height: 30px;
        line-height: 15px;
      }
      .box_kqxs td.tanso_hangchuc span.numberHightlight,
      .box_kqxs td.tanso_hangdonvi span.numberHightlight {
        height: 29px;
        line-height: 29px;
      }
      .box_kqxs td.tanso_hangchuc {
        height: 30px;
        line-height: 15px;
      }
      .bkqtinhmienbac > tbody > tr:last-child > td {
        border-bottom: 0;
      }
      .bkqtinhmienbac > tbody > tr:last-child > td.bxdauduoi {
        border: none;
      }
      .bkqtinhmienbac > tbody > tr:first-child > td {
        border-right: 0;
      }
      .box_kqxs .bkqtinhmienbac .box_kqxs_content td:last-child,
      .box_kqxs .bkqtinhmiennam .box_kqxs_content td:last-child {
        border-right: 0;
      }
      .bkqtinhmienbac .shadow.somien,
      .bkqtinhmienbac .shadow.sotinh {
        position: relative;
      }
      .bkqtinhmienbac .shadow.sotinh.hangActive strong,
      .bkqtinhmienbac .shadow.sotinh.hangActiveClick strong,
      .box_kqxs .shadow.somien.hangActive strong,
      .box_kqxs .shadow.somien.hangActiveClick strong {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        margin-left: 3px;
        left: 0;
        margin-top: -8px;
        background: #757171;
        background: radial-gradient(circle at 5px 5px, gold, #001);
        text-shadow: none;
        color: #fff;
        line-height: 16px;
      }
      .bkqtinhmienbac .shadow.sotinh strong::after {
        content: "";
        position: absolute;
        width: 16px;
        height: 8px;
        border-radius: 40px/20px;
        left: 2px;
        top: 3px;
      }
      .box_kqxs .top {
        position: relative;
      }
      .box_kqxs .top .config_Bangketqua {
        position: absolute;
        right: 1px;
        top: 0;
        color: #fff;
        font-size: 18px;
      }
      .box_kqxs .top .config_Bangketqua .config_Bangketqua_list {
        position: absolute;
        height: 10px;
        width: 170px;
        top: 0;
        right: 10px;
      }
      .box_kqxs .top .config_Bangketqua .config_Bangketqua_list .config_Item {
        float: left;
        font-size: 13px;
        margin: 0 5px;
        padding: 1px 5px;
      }
      .box_kqxs .config_Bangketqua_list .config_Item:hover {
        background: #e4e4e2;
      }
      .box_kqxs .config_Bangketqua_list .config_Item.config_Item_Hover {
        background: #ffeaa5;
      }
      .ketquaHightlight_giaiSo.cungConvat {
        background: radial-gradient(circle at 5px 5px, #56fdf8, #000);
      }
      .ketquaHightlight_giaiSo {
        color: #fff;
        padding: 2px;
        border-radius: 50%;
        box-shadow: 3px 3px 10px -2px rgba(0, 0, 0, 0.4);
        background: radial-gradient(circle at 5px 5px, gold, #001);
      }
      .box_kqxs td div {
        font-family: vni-centurbold;
        font-family: Arial, Helvetica, sans-serif;
        font-weight: 700;
      }
      .box_kqxs .bkqmiennam .bkqtinhmienbac td div {
        font-family: Arial;
        font-weight: 700;
      }
      .bkqmiennam .rightcl .giai1,
      .bkqmiennam .rightcl .giai2,
      .bkqmiennam .rightcl .giai3,
      .bkqmiennam .rightcl .giai4,
      .bkqmiennam .rightcl .giai5,
      .bkqmiennam .rightcl .giai6,
      .bkqmiennam .rightcl .giai7,
      .bkqmiennam .rightcl .giai8 {
        font-size: 20px;
        font-weight: 700;
        padding: 0;
      }
      .bkqmiennam .rightcl .giai3 {
        height: 46px;
      }
      .bkqmiennam .leftcl .giai1,
      .bkqmiennam .leftcl .giai2,
      .bkqmiennam .leftcl .giai5,
      .bkqmiennam .leftcl .giai7,
      .bkqmiennam .rightcl .giai2,
      .bkqmiennam .rightcl .giai5,
      .bkqmiennam .rightcl .giai7 {
        height: 26px;
      }
      .bkqmiennam .leftcl .giai3,
      .bkqmiennam .leftcl .giai8 {
        height: 46px;
      }
      .bkqmiennam .leftcl .giai6,
      .bkqmiennam .rightcl .giai6 {
        height: 66px;
      }
      .bkqmiennam .leftcl .giai4,
      .bkqmiennam .rightcl .giai4 {
        height: 154px;
      }
      .bkqmiennam .leftcl .giaidb,
      .bkqmiennam .rightcl .giaidb {
        height: 35px;
        line-height: 35px;
      }
      .bkqmiennam .rightcl .giai1 {
        height: 26px;
      }
      .bkqmiennam .rightcl .giai8 {
        height: 46px;
        font-size: 44px;
        font-weight: 700;
      }
      .bkqmiennam .rightcl .giai8 div {
        line-height: 46px;
      }
      .bkqmiennam .rightcl .giai2 div,
      .bkqmiennam .rightcl .giai3 div,
      .bkqmiennam .rightcl .giai5 div,
      .bkqmiennam .rightcl .giai7 div {
        line-height: 26px;
      }
      .bkqmiennam .rightcl .giai3 div,
      .bkqmiennam .rightcl .giai4 div,
      .bkqmiennam .rightcl .giai6 div {
        height: 22px;
        line-height: 22px;
        margin: 0;
      }
      .bkqmiennam .rightcl .giaidb {
        font-size: 28px;
        font-weight: 700;
      }
      .bkqmiennam .rightcl .giaidb div {
        display: block;
        line-height: 35px;
      }
      .bkqmiennam .rightcl .giai1 div {
        display: block;
        line-height: 26px;
      }
      .bkqmiennam .leftcl .ngay,
      .bkqmiennam .leftcl .thu,
      .bkqmiennam .rightcl .matinh,
      .bkqmiennam .rightcl .tinh {
        font-family: "Time New Roman";
        border-radius: 0;
        background: #f3f3f3;
      }
      .bkqtinhmienbac .ngay {
        border-radius: 0;
      }
      .bkqmiennam .rightcl .matinh {
        font-weight: 400;
        background: #f3f3f3;
      }
      .box_kqxs .bkqtinhmienbac td .overMienbac {
        height: 59px;
        line-height: 59px;
      }
      .box_kqxs .bkqtinhmienbac td .overMienbac div {
        line-height: 30px;
        height: 25px;
      }
      .box_kqxs .bkqtinhmiennam td .overMiennam_db,
      .box_kqxs .bkqtinhmiennam td .overMiennam_db div {
        line-height: 56px;
        height: 56px;
      }
      .box_kqxs .bkqtinhmiennam .ngay,
      .box_kqxs .bkqtinhmiennam .ngay a,
      .box_kqxs .bkqtinhmiennam .ngay a:visited,
      .box_kqxs .bkqtinhmiennam .thu,
      .box_kqxs .bkqtinhmiennam .thu a,
      .box_kqxs .bkqtinhmiennam .thu a:visited,
      .box_kqxs .bkqtinhmiennam .tngay {
        font-weight: 400;
        color: #000;
      }
      .box_kqxs .bkqtinhmiennam .ngay a:hover,
      .box_kqxs .bkqtinhmiennam .thu a:hover {
        font-weight: 700;
        color: red;
      }
      .box_kqxs .bkqtinhmienbac .ngay,
      .box_kqxs .bkqtinhmienbac .ngay a,
      .box_kqxs .bkqtinhmienbac .ngay a:visited,
      .box_kqxs .bkqtinhmienbac .thu,
      .box_kqxs .bkqtinhmienbac .thu a,
      .box_kqxs .bkqtinhmienbac .thu a:visited,
      .box_kqxs .bkqtinhmienbac .tngay {
        font-weight: 400;
        color: #000;
      }
      .box_kqxs .bkqtinhmienbac .ngay a:hover,
      .box_kqxs .bkqtinhmienbac .thu a:hover {
        font-weight: 700;
        color: red;
      }
      .bkqmiennam .matinh:hover,
      .bkqmiennam .tinh:hover {
        background: #ffeaa5;
      }
      .bkqmiennam .leftcl .giai1,
      .bkqmiennam .leftcl .giai3,
      .bkqmiennam .leftcl .giai5,
      .bkqmiennam .leftcl .giai7,
      .bkqmiennam .rightcl .giai1,
      .bkqmiennam .rightcl .giai3,
      .bkqmiennam .rightcl .giai5,
      .bkqmiennam .rightcl .giai7 {
        background: #f3f3f3;
      }
      .bangkq6x36 div.bool,
      .bangkq6x45 div.bool,
      .bkqtt4 div.bool {
        margin-right: 19px;
      }
      .bkqmiennam .leftcl .giaiActive,
      .bkqmiennam .leftcl .giaiActive td,
      .bkqmiennam .leftcl .giaiActiveClick,
      .bkqmiennam .leftcl .giaiActiveClick td,
      .bkqmiennam .rightcl .giaiActive,
      .bkqmiennam .rightcl .giaiActive td,
      .bkqmiennam .rightcl .giaiActiveClick,
      .bkqmiennam .rightcl .giaiActiveClick td,
      .bkqtinhmienbac .giaiActive,
      .bkqtinhmienbac .giaiActive td,
      .bkqtinhmienbac .giaiActiveClick,
      .bkqtinhmienbac .giaiActiveClick td,
      .hangActive,
      .hangActiveClick {
        background: #ffeaa5;
      }
      .kqxs .box_kqxs .row{
        margin: 0px !important;
        border: none;
        text-align: center;
      }
      .kqxs .card-title{
        font-size: 13pt;
        font-weight: bold;
        text-align: center;
        margin: auto !important;
      }
      .kqxs .card-body .col-3{
        margin: auto;
        width: 50%;
      }
      .kqxs .to_mau{
        background: #cc9108;
      }
      .kqxs .xu_ly{
        font-size: 13pt;
      }
      .kqxs .xu_ly .khung_trai{
        border: 1px solid gray;
      }
      .kqxs .dx-datagrid td.text-left{
        text-align: left !important;
      }
 `
}