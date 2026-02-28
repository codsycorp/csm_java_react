{
/*
1. Tickler
- Bo viền nhỏ nhất có thể
- Font đồng bộ lại toàn bộ Time New Roman.
- Đồng bộ lại font chữ định dạng khoảng cách của tickler tự động.
- Bo Viền Trong màu đỏ gạch cho tất cả các tickler.
- Chữ Trong Tickler Màu Xanh theo bảng màu.
2. Phần Châm Ngôn  Tác giả nằm dưới dòng có ngoặc kép.
- Phần chọn đưa nhuần vô giữa âm dương. Ẩn giờ vào trong phần chọn.
3. Bên Xem Ngày :
- Bỏ Icon Chọn ngày
- Phần Tổng Quan.
Thập Nhị Chi Ngày -> Thập Nhị Địa Chi Ngày và đưa xuống duới Thập Thiên Can Ngày
Thập Thiên Can Ngày -> Thập Thiên Can
- Khoảng cách đều giữa các ô thông tin
- Canh giữa nội dung trên dưới đều nhau cho tất cả các ô thông tin.
*/
    name:"vn369_congcu",
    props: [],
    data:function(){
      return {
        Data_Count:0,
        Data_Max:0,
        app_id:"vpts",
        DAYNAMES:new Array("CN", "T2", "T3", "T4", "T5", "T6", "T7"),
        today:dateFormat(new Date(),"dd/mm/yyyy"),
        today_am:'',
        SDTemplate:'',
        CUU_TINH_VAN1_GIAP_TY:64,
        KIET_HUNG_THOI:[],
        GIO_KHONG_VONG:[],
        print_name:'Bản In',
        HY_THAN:[
          {stt:1,can_ngay:"Giáp-Kỷ",huong:"Đông Bắc"},
          {stt:2,can_ngay:"Ất-Canh",huong:"Tây Bắc"},
          {stt:3,can_ngay:"Bính-Tân",huong:"Tây Nam"},
          {stt:4,can_ngay:"Đinh-Nhâm",huong:"Nam"},
          {stt:5,can_ngay:"Mậu-Quý",huong:"Đông Nam"},
        ],
        HAC_THAN:[
          {stt:0,can_chi_ngay:"Quý Tỵ-Giáp Ngọ-Ất Mùi-Bính Thân-Đinh Dậu-Mậu Tuất-Kỷ Hợi-Canh Tý-Tân Sửu-Nhâm Dần-Quý Mão-Giáp Thìn-Ất Tỵ-Bính Ngọ-Đinh Mùi-Mậu Thân",huong:"Tại Thiên Giới"},
          {stt:1,can_chi_ngay:"Kỷ Dậu-Canh Tuất-Tân Hợi-Nhâm Tý-Quý Sửu-Giáp Dần",huong:"Đông Bắc"},
          {stt:2,can_chi_ngay:"Ất Mão-Bính Thìn-Đinh Tỵ-Mậu Ngọ-Kỷ Mùi",huong:"Đông"},
          {stt:3,can_chi_ngay:"Canh Thân-Tân Dậu-Nhâm Tuất-Quý Hợi-Giáp Tý-Ất Sửu",huong:"Đông Nam"},
          {stt:4,can_chi_ngay:"Bính Dần-Đinh Mão-Mậu Thìn-Kỷ Tỵ-Canh Ngọ",huong:"Nam"},
          {stt:5,can_chi_ngay:"Tân Mùi-Nhâm Thân-Quý Dậu-Giáp Tuất-Ất Hợi-Bính Tý",huong:"Tây Nam"},
          {stt:6,can_chi_ngay:"Đinh Sửu-Mậu Dần-Kỷ Mão-Canh Thìn-Tân Tỵ",huong:"Tây"},
          {stt:7,can_chi_ngay:"Nhâm Ngọ-Quý Mùi-Giáp Thân-Ất Dậu-Bính Tuất-Đinh Hợi",huong:"Tây Bắc"},
          {stt:8,can_chi_ngay:"Mậu Tý-Kỷ Sửu-Canh Dần-Tân Mão-Nhâm Thìn",huong:"Bắc"},
        ],
        TAI_THAN:[
          {stt:1,can_ngay:"Giáp-Ất",huong:"Đông Nam"},
          {stt:2,can_ngay:"Bính-Đinh",huong:"Đông"},
          {stt:3,can_ngay:"Mậu",huong:"Bắc"},
          {stt:4,can_ngay:"Kỷ",huong:"Nam"},
          {stt:5,can_ngay:"Canh-Tân",huong:"Tây Nam"},
          {stt:6,can_ngay:"Nhâm",huong:"Tây"},
          {stt:7,can_ngay:"Quý",huong:"Tây Bắc"},
        ],
        SAO_TOT:[],
        SAO_XAU:[],
        TU_LUU_LINH_BAN:[],
        LUU_NGUYET_PHI_TINH:[{"thang_dl":2,"thang_al":1,"ty_ngo_mao_dau":"Bát bạch","thin_tuat_suu_mui":"Ngũ hoàng","dan_than_ty_hoi":"Nhị hắc"},{"thang_dl":3,"thang_al":2,"ty_ngo_mao_dau":"Thất xích","thin_tuat_suu_mui":"Tứ lục","dan_than_ty_hoi":"Nhất bạch"},{"thang_dl":4,"thang_al":3,"ty_ngo_mao_dau":"Lục bạch","thin_tuat_suu_mui":"Tam bích","dan_than_ty_hoi":"Cửu tử"},{"thang_dl":5,"thang_al":4,"ty_ngo_mao_dau":"Ngũ hoàng","thin_tuat_suu_mui":"Nhị hắc","dan_than_ty_hoi":"Bát bạch"},{"thang_dl":6,"thang_al":5,"ty_ngo_mao_dau":"Tứ lục","thin_tuat_suu_mui":"Nhất bạch","dan_than_ty_hoi":"Thất xích"},{"thang_dl":7,"thang_al":6,"ty_ngo_mao_dau":"Tam bích","thin_tuat_suu_mui":"Cửu tử","dan_than_ty_hoi":"Lục bạch"},{"thang_dl":8,"thang_al":7,"ty_ngo_mao_dau":"Nhị hắc","thin_tuat_suu_mui":"Bát bạch","dan_than_ty_hoi":"Ngũ hoàng"},{"thang_dl":9,"thang_al":8,"ty_ngo_mao_dau":"Nhất bạch","thin_tuat_suu_mui":"Thất xích","dan_than_ty_hoi":"Tứ lục"},{"thang_dl":10,"thang_al":9,"ty_ngo_mao_dau":"Cửu tử","thin_tuat_suu_mui":"Lục bạch","dan_than_ty_hoi":"Tam bích"},{"thang_dl":11,"thang_al":10,"ty_ngo_mao_dau":"Bát bạch","thin_tuat_suu_mui":"Ngũ hoàng","dan_than_ty_hoi":"Nhị hắc"},{"thang_dl":12,"thang_al":11,"ty_ngo_mao_dau":"Thất xích","thin_tuat_suu_mui":"Tứ lục","dan_than_ty_hoi":"Nhất bạch"},{"thang_dl":1,"thang_al":12,"ty_ngo_mao_dau":"Lục bạch","thin_tuat_suu_mui":"Tam bích","dan_than_ty_hoi":"Cửu tử"},{"thang_dl":0,"thang_al":0,"ty_ngo_mao_dau":"","thin_tuat_suu_mui":"","dan_than_ty_hoi":""}],
        LucThapGiapTy:[],
        lucthaphoagiap:[],
        thangtruc:[{"stt":"1","ten_truc":"Kiến","chi_thang1":"Dần","chi_thang2":"Mão","chi_thang3":"Thìn","chi_thang4":"Tỵ","chi_thang5":"Ngọ","chi_thang6":"Mùi","chi_thang7":"Thân","chi_thang8":"Dậu","chi_thang9":"Tuất","chi_thang10":"Hợi","chi_thang11":"Tý","chi_thang12":"Sửu","y_nghia":"%3Cp%3E%26nbsp%3B%3C%2Fp%3E%0A%0A%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A67px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ki%E1%BA%BFn%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%20Th%E1%BB%95%20Ph%E1%BB%A7%20%28x%E1%BA%A5u%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20v%E1%BB%9Bi%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20gi%26aacute%3B%20th%26uacute%3B%20nh%C6%B0ng%20x%E1%BA%A5u%20v%E1%BB%9Bi%20%C4%91%E1%BB%99ng%20th%E1%BB%95%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ki%26ecirc%3Bn%20nghi%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20b%E1%BA%A5t%20kh%E1%BA%A3%20khai%20th%C6%B0%C6%A1ng%20%26nbsp%3B-%20%26nbsp%3BKi%26ecirc%3Bn%20h%E1%BB%A3p%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20ch%E1%BA%B3ng%20kh%26aacute%3B%20m%E1%BB%9F%20kho%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ki%26ecirc%3Bn%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20V%E1%BA%A1n%20v%E1%BA%ADt%20sanh%20d%E1%BB%A5c%2C%20c%C6%B0%E1%BB%9Dng%20ki%E1%BB%87n%2C%20l%26agrave%3B%20ng%26agrave%3By%20ki%E1%BB%87n%20tr%26aacute%3Bng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%95%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A62px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A62px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20bi%26ecirc%3Bn%20c%E1%BA%A3nh%2C%20chi%26ecirc%3Bu%20hi%E1%BB%81n%2C%20c%E1%BB%AD%20ch%26aacute%3Bnh%20tr%E1%BB%B1c%2C%20giao%20thi%E1%BB%87p%2C%20hu%E1%BA%A5n%20binh%2C%20h%26agrave%3Bnh%20h%E1%BA%A1nh%2C%20khi%E1%BB%83n%20s%E1%BB%AD%2C%20l%26acirc%3Bm%20ch%26aacute%3Bnh%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%26acirc%3Bn%20%26nbsp%3Bd%26acirc%3Bn%2C%20ph%26oacute%3B%20%26nbsp%3Bnh%E1%BA%ADm%2C%20thi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bphong%20b%26aacute%3Bi%2C%20thi%26ecirc%3Bm%20%C6%B0%E1%BB%9Bc%2C%20th%C6%B0%E1%BB%A3ng%20quan%2C%20tuy%E1%BB%83n%20t%C6%B0%E1%BB%9Bng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20xu%E1%BA%A5t%20s%C6%B0.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A39px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A39px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20d%E1%BB%A5%2C%20xu%E1%BA%A5t%20s%C6%B0%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20m%E1%BB%8Di%20s%E1%BB%B1%20kh%E1%BB%9Fi%20%C4%91%E1%BA%A7u%20th%C6%B0%E1%BB%9Dng%20t%E1%BB%91t%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%20%C4%91%E1%BA%B7ng%20l%E1%BB%A3i%2C%20sanh%20con%20r%E1%BA%A5t%20t%E1%BB%91t.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20%26nbsp%3Bt%26aacute%3Bng%2C%20ch%E1%BB%89nh%20%26nbsp%3Bdung%20%26nbsp%3Bth%E1%BA%BF%20%26nbsp%3B%C4%91%E1%BA%A7u%2C%20ch%E1%BB%89nh%26nbsp%3Bth%E1%BB%A7%20t%26uacute%3Bc%20gi%26aacute%3Bp%2C%20c%E1%BA%A7u%20%26nbsp%3Bt%E1%BB%B1%2C%20c%E1%BA%A7u%26nbsp%3By%2C%20doanh%20ki%E1%BA%BFn%20cung%20th%E1%BA%A5t%2C%20gi%E1%BA%A3i%20tr%E1%BB%AB%2C%26nbsp%3Bho%E1%BA%A1i%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20vi%26ecirc%3Bn%2C%20h%C6%B0ng%20%26nbsp%3Bt%E1%BA%A1o%2C%20khai%20%26nbsp%3Bth%C6%B0%C6%A1ng%20%26nbsp%3Bkh%E1%BB%91%2C%20kh%E1%BA%A3i%20%26nbsp%3Bto%E1%BA%A3n%2C%20k%26igrave%3B%20ph%26uacute%3Bc%2C%20k%E1%BA%BFt%20h%26ocirc%3Bn%20nh%26acirc%3Bn%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%20n%E1%BA%A1p%20th%26aacute%3Bi%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%26nbsp%3Bph%26aacute%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20%E1%BB%91c%2C%20ph%E1%BA%A1t%20m%E1%BB%99c%2C%20thi%E1%BB%87n%20th%26agrave%3Bnh%20qu%26aacute%3Bch%2C%20th%C6%B0%E1%BB%A3ng%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20l%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20s%26aacute%3Bch%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20ti%E1%BA%BFn%26nbsp%3Bbi%E1%BB%83u%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ch%C6%B0%C6%A1ng%2C%20tu%20%26nbsp%3Bcung%20%26nbsp%3Bth%E1%BA%A5t%2C%20tu%20%26nbsp%3Bth%C6%B0%C6%A1ng%20%26nbsp%3Bkh%E1%BB%91%2C%20tu%20%26nbsp%3Btr%26iacute%3B%20%26nbsp%3Bs%E1%BA%A3n%20%26nbsp%3Bth%E1%BA%A5t%2C%20t%26agrave%3Bi%20%26nbsp%3Bch%E1%BB%A7ng%2C%20v%E1%BA%A5n%20%26nbsp%3Bdanh%2C%20xu%E1%BA%A5t%20h%26oacute%3Ba%20t%26agrave%3Bi%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A61px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A61px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20L%E1%BB%A3p%20nh%26agrave%3B%2C%20%C4%91%26agrave%3Bo%20%26nbsp%3Bao%20%26nbsp%3Bgi%E1%BA%BFng%2C%20ch%26ocirc%3Bn%20%26nbsp%3Bc%E1%BA%A5t%2C%20m%E1%BB%9F%20kho%2C%20%C4%91%E1%BB%99ng%20%C4%91%E1%BA%A5t%20ban%20n%E1%BB%81n%2C%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20m%E1%BB%9F%20kho%20v%E1%BB%B1a%2C%26nbsp%3Bv%E1%BA%BD%20h%E1%BB%8Da%20ch%E1%BB%A5p%20%E1%BA%A3nh%2C%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20nh%E1%BA%ADm%20ch%E1%BB%A9c%2C%20n%E1%BA%A1p%20l%E1%BB%85%20c%E1%BA%A7u%20th%26acirc%3Bn%2C%20l%26oacute%3Bt%20gi%C6%B0%E1%BB%9Dng%2C%26nbsp%3Bv%26agrave%3Bo%20l%26agrave%3Bm%20h%26agrave%3Bnh%20ch%26aacute%3Bnh%2C%20d%26acirc%3Bng%20n%E1%BA%A1p%20%C4%91%C6%A1n%20s%E1%BB%9B%2C%20%C4%91%26oacute%3Bng%20th%E1%BB%8D%20d%C6%B0%E1%BB%A1ng%20sanh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"2","ten_truc":"Trừ","chi_thang1":"Mão","chi_thang2":"Thìn","chi_thang3":"Tỵ","chi_thang4":"Ngọ","chi_thang5":"Mùi","chi_thang6":"Thân","chi_thang7":"Dậu","chi_thang8":"Tuất","chi_thang9":"Hợi","chi_thang10":"Tý","chi_thang11":"Sửu","chi_thang12":"Dần","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A24px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Tr%E1%BB%AB%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20Nhi%E1%BB%81u%20Vi%E1%BB%87c%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Tr%E1%BB%AB%20kh%E1%BA%A3%20ph%E1%BB%A5c%20d%C6%B0%E1%BB%A3c%2C%20b%E1%BB%87nh%20tai%20di%E1%BB%87c%20l%C6%B0%C6%A1ng%20%26nbsp%3B%20-%20%26nbsp%3B%20Tr%E1%BB%AB%20n%26ecirc%3Bn%20t%26igrave%3Bm%20th%E1%BA%A7y%20%C4%91%E1%BB%95%20thu%E1%BB%91c%2C%20b%E1%BB%87nh%20t%E1%BA%ADt%20l%E1%BA%A1i%20l%26agrave%3Bnh.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Tr%E1%BB%AB%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20T%E1%BA%A3o%20tr%E1%BB%AB%20%26aacute%3Bc%20s%26aacute%3Bt%2C%20l%26agrave%3B%20ng%26agrave%3By%20kh%E1%BB%A9%20c%E1%BB%B1u%20ngh%26ecirc%3Bnh%20t%26acirc%3Bn.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%A7y%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A62px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A62px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%26agrave%3Bn%20%26nbsp%3Bthi%26ecirc%3Bn%2C%20ch%E1%BB%89nh%20dung%20th%E1%BA%BF%20%C4%91%E1%BA%A7u%2C%20ch%E1%BB%89nh%20th%E1%BB%A7%20t%26uacute%3Bc%20gi%26aacute%3Bp%2C%20c%E1%BA%A7u%20y%2C%20c%E1%BB%AD%20ch%26aacute%3Bnh%20tr%E1%BB%B1c%2C%20gi%E1%BA%A3i%26nbsp%3Btr%E1%BB%AB%2C%20h%26agrave%3Bnh%20h%E1%BA%A1nh%2C%26nbsp%3Bkhi%E1%BB%83n%20s%E1%BB%AD%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%26nbsp%3Bl%26acirc%3Bm%20ch%26aacute%3Bnh%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%26acirc%3Bn%20d%26acirc%3Bn%2C%20m%E1%BB%99c%20d%E1%BB%A5c%2C%20nh%E1%BA%ADp%20h%E1%BB%8Fa%2C%20ph%26oacute%3B%20nh%E1%BA%ADm%2C%20thi%20%26acirc%3Bn%20phong%26nbsp%3Bb%26aacute%3Bi%2C%20th%C6%B0%E1%BB%A3ng%20quan%2C%20t%E1%BA%A3o%26nbsp%3Bx%26aacute%3B%20v%C5%A9%2C%20t%E1%BB%91ng%20l%E1%BB%85%2C%20xu%E1%BA%A5t%26nbsp%3Bh%26agrave%3Bnh%2C%20xu%E1%BA%A5t%20%26nbsp%3Bh%26oacute%3Ba%2C%20%C4%91%E1%BB%99ng%20%26nbsp%3Bth%E1%BB%95.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A61px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A61px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Gi%E1%BA%A3i%20tr%E1%BB%AB%2C%20c%E1%BA%A1o%20%C4%91%E1%BA%A7u%2C%20r%26agrave%3Bo%20gi%E1%BA%ADu%2C%20b%E1%BB%8F%20c%26aacute%3Bi%20c%C5%A9%20%C4%91%26oacute%3Bn%20c%26aacute%3Bi%20m%E1%BB%9Bi%2C%20ph%E1%BB%A5c%20d%C6%B0%E1%BB%A3c%2C%20%C4%91%E1%BB%99ng%20%C4%91%E1%BA%A5t%2C%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20th%E1%BB%9D%20c%26uacute%3Bng%20T%26aacute%3Bo%20Th%E1%BA%A7n%2C%20c%E1%BA%A7u%20th%E1%BA%A7y%20ch%E1%BB%AFa%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20b%E1%BB%87nh%20b%E1%BA%B1ng%20c%26aacute%3Bch%20m%E1%BB%95%20x%E1%BA%BB%20hay%20%26nbsp%3Bch%26acirc%3Bm%20c%E1%BB%A9u%2C%20h%E1%BB%91t%20thu%E1%BB%91c%2C%20x%E1%BA%A3%20tang%2C%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%20l%26agrave%3Bm%20l%26ograve%3B%20nhu%E1%BB%99m%20l%26ograve%3B%20g%E1%BB%91m%2C%20n%E1%BB%AF%20%26nbsp%3Bnh%26acirc%3Bn%20kh%E1%BB%9Fi%20%26nbsp%3B%C4%91%E1%BA%A7u%2C%20u%E1%BB%91ng%20%26nbsp%3Bthu%E1%BB%91c%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20K%E1%BA%BFt%20h%26ocirc%3Bn%20nh%26acirc%3Bn%2C%20thi%26ecirc%3Bm%20%C6%B0%E1%BB%9Bc%2C%20vi%E1%BB%85n%20h%26agrave%3Bnh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Xu%E1%BA%A5t%20kho%2C%20b%E1%BB%8F%20v%E1%BB%91n%20l%26agrave%3Bm%20%C4%83n%2C%20h%E1%BB%99i%20h%E1%BB%8Dp%2C%20nam%20nh%26acirc%3Bn%20k%E1%BB%8B%20kh%E1%BB%9Fi%20%C4%91%E1%BA%A7u%2C%20u%E1%BB%91ng%20thu%E1%BB%91c.%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20%C4%90%E1%BA%BB%20con%20nh%E1%BA%B1m%20Tr%E1%BB%B1c%20Tr%E1%BB%AB%20kh%26oacute%3B%20nu%26ocirc%3Bi%2C%20n%26ecirc%3Bn%20l%26agrave%3Bm%20%26Acirc%3Bm%20%C4%90%E1%BB%A9c%20cho%20n%26oacute%3B.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"3","ten_truc":"Mãn","chi_thang1":"Thìn","chi_thang2":"Tỵ","chi_thang3":"Ngọ","chi_thang4":"Mùi","chi_thang5":"Thân","chi_thang6":"Dậu","chi_thang7":"Tuất","chi_thang8":"Hợi","chi_thang9":"Tý","chi_thang10":"Sửu","chi_thang11":"Dần","chi_thang12":"Mão","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A83px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20M%26atilde%3Bn%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%20Thi%26ecirc%3Bn%20Ph%E1%BB%A7%20%28t%E1%BB%91t%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETh%E1%BB%95%20%26Ocirc%3Bn%2C%20Qu%E1%BA%A3%20T%26uacute%3B%2C%20Thi%26ecirc%3Bn%20C%E1%BA%A9u%20%28x%E1%BA%A5u%29%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20v%E1%BB%9Bi%20t%E1%BA%BF%20t%E1%BB%B1%2C%20c%E1%BA%A7u%20t%26agrave%3Bi%2C%20c%E1%BA%A7u%20ph%26uacute%3B%2C%20x%E1%BA%A5u%20v%E1%BB%9Bi%20c%26aacute%3Bc%20vi%E1%BB%87c%20kh%26aacute%3Bc.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20M%26atilde%3Bn%20kh%26aacute%3B%20t%E1%BB%A9%20th%E1%BB%8B%2C%20ph%E1%BB%A5c%20d%C6%B0%E1%BB%A3c%20t%26agrave%3Bo%20%C6%B0%C6%A1ng%26nbsp%3B%20-%26nbsp%3B%20M%26atilde%3Bn%20n%26ecirc%3Bn%20m%E1%BB%9F%20h%26agrave%3Bng%20ch%E1%BB%A3%2C%20ph%E1%BB%A5c%20d%C6%B0%E1%BB%A3c%20h%E1%BB%8Da%20l%26acirc%3By.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20M%26atilde%3Bn%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Phong%20thu%2C%20m%C4%A9%20m%26atilde%3Bn%2C%20l%26agrave%3B%20ng%26agrave%3By%20thi%26ecirc%3Bn%20%C4%91%E1%BA%BF%20b%E1%BA%A3o%20kh%E1%BB%91%20t%26iacute%3Bch%20m%26atilde%3Bn.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%95%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%E1%BB%95%20vi%26ecirc%3Bn%2C%20c%E1%BA%A7u%20t%26agrave%3Bi%2C%20giao%20d%E1%BB%8Bch%2C%20khai%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20khai%20th%E1%BB%8B%2C%20kinh%20l%E1%BA%A1c%2C%20l%E1%BA%ADp%20kho%26aacute%3Bn%2C%26nbsp%3Bl%E1%BA%ADp%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20kh%E1%BA%BF%2C%26nbsp%3Bn%E1%BA%A1p%20t%26agrave%3Bi%2C%20ti%E1%BA%BFn%20nh%26acirc%3Bn%20kh%E1%BA%A9u%2C%20tu%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20t%26agrave%3Bi%20ch%E1%BA%BF%2C%20t%E1%BA%AFc%20huy%E1%BB%87t%2C%20xu%E1%BA%A5t%20h%26oacute%3Ba%20t%26agrave%3Bi.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A60px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A60px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20d%E1%BB%B1ng%20nh%26agrave%3B%2C%20s%E1%BB%ADa%20t%E1%BA%A1o%20kho%20l%E1%BA%ABm%2C%20khai%20tr%C6%B0%C6%A1ng%20h%26agrave%3Bng%20ch%E1%BB%A3%2C%20%C4%91i%20thuy%E1%BB%81n%26nbsp%3Bcho%20vay%26nbsp%3Bth%26acirc%3Bu%20n%E1%BB%A3%2C%26nbsp%3Bmua%26nbsp%3Bh%26agrave%3Bng%2C%20b%26aacute%3Bn%20h%26agrave%3Bng%2C%20%C4%91em%20ng%C5%A9%20c%E1%BB%91c%20v%26agrave%3Bo%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20kho%26nbsp%3B%C4%91%E1%BA%B7t%20t%26aacute%3Bng%20k%26ecirc%3B%20g%26aacute%3Bc%26nbsp%3Bg%26aacute%3Bc%20%C4%91%26ograve%3Bn%20%C4%91%26ocirc%3Bng%26nbsp%3Bs%E1%BB%ADa%20ch%E1%BB%AFa%26nbsp%3Bkho%26nbsp%3Bv%E1%BB%B1a%26nbsp%3B%C4%91%E1%BA%B7t%20y%26ecirc%3Bn%20ch%E1%BB%97%20m%26aacute%3By%20d%E1%BB%87t%26nbsp%3Bn%E1%BA%A1p%20n%26ocirc%3B%20t%E1%BB%B3%2C%20v%26agrave%3Bo%20h%E1%BB%8Dc%20k%E1%BB%B9%20ngh%E1%BB%87%2C%20l%26agrave%3Bm%20chu%E1%BB%93ng%20g%26agrave%3B%20ng%E1%BB%97ng%20v%E1%BB%8Bt.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Chi%26ecirc%3Bu%20%26nbsp%3Bhi%E1%BB%81n%2C%20c%E1%BA%A7u%20%26nbsp%3By%2C%20c%E1%BB%AD%20%26nbsp%3Bch%26aacute%3Bnh%20%26nbsp%3Btr%E1%BB%B1c%2C%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%20nh%26acirc%3Bn%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%20l%26acirc%3Bm%20ch%26aacute%3Bnh%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%26acirc%3Bn%20d%26acirc%3Bn%26nbsp%3Bn%E1%BA%A1p%20th%26aacute%3Bi%2C%20ph%26oacute%3B%20nh%E1%BA%ADm%2C%26nbsp%3Bthi%20%26acirc%3Bn%20phong%20b%26aacute%3Bi%2C%20th%C6%B0%E1%BB%A3ng%20quan%2C%20v%E1%BA%A5n%20danh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ch%26ocirc%3Bn%20c%E1%BA%A5t%2C%20ph%E1%BB%A5c%20d%C6%B0%E1%BB%A3c%2C%20l%26atilde%3Bnh%20ch%E1%BB%A9c%2C%20u%E1%BB%91ng%20thu%E1%BB%91c%2C%20v%26agrave%3Bo%20l%26agrave%3Bm%20h%26agrave%3Bnh%20ch%26aacute%3Bnh%2C%20d%26acirc%3Bng%20n%E1%BA%A1p%20%C4%91%C6%A1n%20s%E1%BB%9B.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"5","ten_truc":"Định","chi_thang1":"Ngọ","chi_thang2":"Mùi","chi_thang3":"Thân","chi_thang4":"Dậu","chi_thang5":"Tuất","chi_thang6":"Hợi","chi_thang7":"Tý","chi_thang8":"Sửu","chi_thang9":"Dần","chi_thang10":"Mão","chi_thang11":"Thìn","chi_thang12":"Tỵ","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A84px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20%C4%90%E1%BB%8Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%3C%2Fstrong%3E%3Cstrong%3E%20Tam%20H%E1%BB%A3p%2C%20Thi%26ecirc%3Bn%20Gi%E1%BA%A3i%20%28t%E1%BB%91t%29%3C%2Fstrong%3E%3Cbr%20%2F%3E%0A%09%09%09%3Cstrong%3E%C4%90%E1%BA%A1i%20Hao%2C%20T%E1%BB%AD%20Kh%26iacute%3B%2C%20Quan%20Ph%26ugrave%3B%20%28x%E1%BA%A5u%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20v%E1%BB%9Bi%20c%E1%BA%A7u%20t%26agrave%3Bi%2C%20k%26yacute%3B%20h%E1%BB%A3p%20%C4%91%E1%BB%93ng%2C%20y%E1%BA%BFn%20ti%E1%BB%87c%20x%E1%BA%A5u%20v%E1%BB%9Bi%20t%E1%BB%91%20t%E1%BB%A5ng%2C%20tranh%20ch%E1%BA%A5p%2C%20ch%E1%BB%AFa%20b%E1%BB%87nh.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20%C4%90%E1%BB%8Bnh%20nghi%20t%E1%BA%A5n%20s%26uacute%3Bc%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%20c%26aacute%3Bc%20tr%26agrave%3Bng%26nbsp%3B%20-%26nbsp%3B%20%C4%90%E1%BB%8Bnh%20n%26ecirc%3Bn%20nh%E1%BA%ADp%20l%E1%BB%A5c%20s%26uacute%3Bc%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%20%C4%91%E1%BB%81u%20t%E1%BB%91t.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20%C4%90%E1%BB%8Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20%C4%91%E1%BB%8Bnh%2C%20b%26igrave%3Bnh%20th%C6%B0%E1%BB%9Dng%2C%20thi%26ecirc%3Bn%20%C4%91%E1%BA%BF%20ch%26uacute%3Bng%20kh%26aacute%3Bch%20l%26agrave%3B%20ng%26agrave%3By%20%C4%91%E1%BB%8Bnh%20t%E1%BB%8Da.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20M%E1%BB%99c%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Gi%26aacute%3B%20th%26uacute%3B%2C%20khai%20th%E1%BB%8B%2C%20kh%E1%BB%9Fi%20t%E1%BA%A1o%2C%20k%26igrave%3B%20ph%26uacute%3Bc%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20nh%E1%BA%ADp%20h%E1%BB%8Fa%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%C6%B0%E1%BB%A3ng%20nh%26acirc%3Bm%2C%20trang%20tu%2C%20tu%20l%E1%BB%99%2C%20t%E1%BA%A1o%20%E1%BB%91c%2C%20t%E1%BA%BF%20t%E1%BB%B1%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A78px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A78px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20M%C6%B0u%20s%E1%BB%B1%2C%20giao%20t%E1%BA%BF%2C%20th%C6%B0%C6%A1ng%20m%E1%BA%A1i%2C%20x%26acirc%3By%20d%E1%BB%B1ng%2C%20nu%26ocirc%3Bi%20gia%20s%26uacute%3Bc%2C%20%C4%91%E1%BB%99ng%20%C4%91%E1%BA%A5t%2C%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20l%26agrave%3Bm%20hay%20s%E1%BB%ADa%20ph%26ograve%3Bng%20b%E1%BA%BFp%2C%20%C4%91%E1%BA%B7t%20y%26ecirc%3Bn%20ch%E1%BB%97%20m%26aacute%3By%20d%E1%BB%87t%20hay%20c%26aacute%3Bc%20lo%E1%BA%A1i%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20m%26aacute%3By%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20n%E1%BA%A1p%20l%E1%BB%85%20c%E1%BA%A7u%20th%26acirc%3Bn%2C%20n%E1%BA%A1p%20%26nbsp%3B%C4%91%C6%A1n%20d%26acirc%3Bng%20s%E1%BB%9B%2C%20s%E1%BB%ADa%20hay%20l%26agrave%3Bm%20%26nbsp%3Bthuy%E1%BB%81n%20%26nbsp%3Bch%26egrave%3Bo%2C%20%C4%91%E1%BA%A9y%20thuy%E1%BB%81n%20m%E1%BB%9Bi%20xu%E1%BB%91ng%20n%C6%B0%E1%BB%9Bc%2C%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%20l%26agrave%3Bm%20l%26ograve%3B%20nhu%E1%BB%99m%20l%26ograve%3B%20g%E1%BB%91m.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Giao%20thi%E1%BB%87p%2C%20t%E1%BB%91%20t%E1%BB%A5ng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ki%E1%BB%87n%20t%E1%BB%A5ng%2C%20%C4%91i%20xa%2C%20mua%20nu%26ocirc%3Bi%20th%26ecirc%3Bm%20s%26uacute%3Bc%20v%E1%BA%ADt.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"6","ten_truc":"Chấp","chi_thang1":"Mùi","chi_thang2":"Thân","chi_thang3":"Dậu","chi_thang4":"Tuất","chi_thang5":"Hợi","chi_thang6":"Tý","chi_thang7":"Sửu","chi_thang8":"Dần","chi_thang9":"Mão","chi_thang10":"Thìn","chi_thang11":"Tỵ","chi_thang12":"Ngọ","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A48px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ch%E1%BA%A5p%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ET%E1%BB%91t%20v%E1%BB%9Bi%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%20x%26acirc%3By%20d%E1%BB%B1ng%2C%20x%E1%BA%A5u%20v%E1%BB%9Bi%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20di%20chuy%E1%BB%83n%2C%20khai%20tr%C6%B0%C6%A1ng%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Ch%E1%BA%A5p%20kh%E1%BA%A3%20b%E1%BB%99%20tr%26oacute%3Bc%2C%20%C4%91%E1%BA%A1o%20t%E1%BA%B7c%20nan%20t%26agrave%3Bng%26nbsp%3B%20-%26nbsp%3B%20Ch%E1%BA%A5p%20n%26ecirc%3Bn%20s%C4%83n%20b%E1%BA%AFt%2C%20tr%E1%BB%99m%20c%E1%BA%AFp%20kh%26oacute%3B%20tr%E1%BB%91n%20tho%26aacute%3Bt.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ch%E1%BA%A5p%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ph%26aacute%3B%20nh%E1%BA%ADt%20chi%20t%26ograve%3Bng%20th%E1%BA%A7n%2C%20vi%E1%BA%BFt%20ti%E1%BB%83u%20hao%2C%20l%26agrave%3B%20ng%26agrave%3By%20thi%26ecirc%3Bn%20%C4%91%E1%BA%BF%20ch%E1%BA%A5p%20h%26agrave%3Bnh%20v%E1%BA%A1n%20v%E1%BA%ADt%20t%E1%BB%A9%20thi%26ecirc%3Bn%20ph%26uacute%3Bc.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20H%E1%BB%8Fa%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Gi%26aacute%3B%20th%26uacute%3B%2C%20th%26uacute%3B%20c%E1%BA%A5u%2C%20trang%20tu%2C%20t%E1%BA%A1o%20%E1%BB%91c%2C%20t%E1%BA%BF%20t%E1%BB%B1.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20S%C4%83n%20b%E1%BA%AFt%2C%20thu%20nh%E1%BA%ADn%20ng%C6%B0%E1%BB%9Di%2C%20l%E1%BA%ADp%20kh%E1%BA%BF%20%C6%B0%E1%BB%9Bc%2C%20giao%20d%E1%BB%8Bch%2C%20%C4%91%E1%BB%99ng%20%C4%91%E1%BA%A5t%20ban%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20n%E1%BB%81n%2C%20c%E1%BA%A7u%20%26nbsp%3Bth%E1%BA%A7y%20%26nbsp%3Bch%E1%BB%AFa%20%26nbsp%3Bb%E1%BB%87nh%2C%20%C4%91i%20%26nbsp%3Bs%C4%83n%20%26nbsp%3Bth%26uacute%3B%20c%26aacute%3B%2C%20t%26igrave%3Bm%20b%E1%BA%AFt%20tr%E1%BB%99m%20c%C6%B0%E1%BB%9Bp.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%26agrave%3Bn%20thi%26ecirc%3Bn%2C%20giao%20d%E1%BB%8Bch%2C%20khai%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20khai%20th%E1%BB%8B%2C%20kinh%20doanh%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20l%E1%BA%ADp%20kho%26aacute%3Bn%2C%20n%E1%BA%A1p%20t%26agrave%3Bi%2C%20tu%20th%C6%B0%C6%A1ng%20%26nbsp%3Bkh%E1%BB%91%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20xu%E1%BA%A5t%20%26nbsp%3Bh%26oacute%3Ba%20t%26agrave%3Bi.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%E1%BB%8F%20v%E1%BB%91n%20l%26agrave%3Bm%20%C4%83n%2C%20cho%20vay%20m%C6%B0%E1%BB%A3n%20ti%E1%BB%81n%2C%20m%E1%BB%9F%20kho%2C%20x%26acirc%3By%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%20t%C6%B0%E1%BB%9Dng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"7","ten_truc":"Phá","chi_thang1":"Thân","chi_thang2":"Dậu","chi_thang3":"Tuất","chi_thang4":"Hợi","chi_thang5":"Tý","chi_thang6":"Sửu","chi_thang7":"Dần","chi_thang8":"Mão","chi_thang9":"Thìn","chi_thang10":"Tỵ","chi_thang11":"Ngọ","chi_thang12":"Mùi","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A65px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ph%26aacute%3B%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%3C%2Fstrong%3E%3Cstrong%3E%20Nguy%E1%BB%87t%20Ph%26aacute%3B%20%28x%E1%BA%A5u%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EX%E1%BA%A5u%20v%E1%BB%9Bi%20m%E1%BB%8Di%20vi%E1%BB%87c%2C%20ri%26ecirc%3Bng%20ch%E1%BB%AFa%20b%E1%BB%87nh%2C%20d%E1%BB%A1%20nh%26agrave%3B%20c%C5%A9%2C%20ph%26aacute%3B%20b%E1%BB%8F%20%C4%91%E1%BB%93%20c%C5%A9%20l%26agrave%3B%20t%E1%BB%91t%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A40px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Ph%26aacute%3B%20nghi%20tr%E1%BB%8B%20b%E1%BB%87nh%2C%20t%E1%BA%A5t%20ch%E1%BB%A7%20an%20kh%C6%B0%C6%A1ng%26nbsp%3B%20-%26nbsp%3B%20Ph%26aacute%3B%20h%E1%BB%A3p%20tr%E1%BB%8B%20b%E1%BB%87nh%2C%20ng%C6%B0%E1%BB%9Di%20b%E1%BB%87nh%20%E1%BA%AFt%20m%E1%BA%A1nh.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Ph%26aacute%3B%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Nh%E1%BA%ADt%20nguy%E1%BB%87t%20t%C6%B0%C6%A1ng%20xung%2C%20vi%E1%BA%BFt%20%C4%91%E1%BA%A1i%20hao%2C%20%C4%91%E1%BA%A5u%20b%26iacute%3Bnh%20t%C6%B0%C6%A1ng%20xung%20t%C6%B0%C6%A1ng%20h%C6%B0%E1%BB%9Bng%20t%E1%BA%A5t%20ph%26aacute%3B%20ho%E1%BA%A1i%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20L%26agrave%3B%20ng%26agrave%3By%20%C4%91%E1%BA%A1i%20s%E1%BB%B1%20b%E1%BA%A5t%20nghi.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20H%E1%BB%8Fa%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20C%E1%BA%A7u%20y%2C%20ho%E1%BA%A1i%20vi%26ecirc%3Bn%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20ph%26aacute%3B%20%E1%BB%91c%2C%20s%26aacute%3Bch%20t%26aacute%3B.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A39px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A39px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ph%26aacute%3B%20kho%20%C4%91%E1%BB%A5n%2C%20%C4%91%E1%BA%ADp%20t%C6%B0%E1%BB%9Dng%2C%20d%E1%BB%A1%20nh%26agrave%3B%20%C4%91%E1%BB%83%20s%E1%BB%ADa%20ch%E1%BB%AFa%20c%E1%BA%A7u%20y%20tr%E1%BB%8B%20b%E1%BB%87nh%2C%20h%E1%BB%91t%20thu%E1%BB%91c%2C%20u%E1%BB%91ng%20thu%E1%BB%91c.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20bi%26ecirc%3Bn%20c%E1%BA%A3nh%2C%20an%20s%26agrave%3Bng%2C%20an%26nbsp%3Bt%26aacute%3Bng%2C%20an%20%26nbsp%3B%C4%91%E1%BB%91i%20%26nbsp%3Bngo%E1%BA%A1i%2C%20ban%20chi%E1%BA%BFu%2C%20b%26agrave%3Bn%26nbsp%3Bdi%2C%20b%E1%BB%95%20vi%26ecirc%3Bn%2C%20chi%26ecirc%3Bu%26nbsp%3Bhi%E1%BB%81n%2C%20ch%E1%BB%89nh%20dung%20%26nbsp%3Bth%E1%BA%BF%20%C4%91%E1%BA%A7u%2C%20ch%E1%BB%89nh%26nbsp%3Bth%E1%BB%A7%26nbsp%3Bt%26uacute%3Bc%26nbsp%3Bgi%26aacute%3Bp%2C%20y%E1%BA%BFn%26nbsp%3Bh%E1%BB%99i%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20c%E1%BA%A7u%26nbsp%3Bt%E1%BB%B1%2C%20c%E1%BB%95%20ch%26uacute%3B%2C%20c%E1%BB%AD%20%26nbsp%3Bch%26aacute%3Bnh%20%26nbsp%3Btr%E1%BB%B1c%2C%20doanh%20ki%E1%BA%BFn%20cung%26nbsp%3Bth%E1%BA%A5t%2C%20giao%20d%E1%BB%8Bch%2C%20gi%26aacute%3B%20th%26uacute%3B%2C%20hu%E1%BA%A5n%20binh%2C%20h%26agrave%3Bnh%20h%E1%BA%A1nh%2C%20h%C6%B0ng%20%26nbsp%3Bt%E1%BA%A1o%2C%20khai%20c%E1%BB%AB%2C%20khai%26nbsp%3Bth%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20khai%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%E1%BB%8B%2C%20khi%E1%BB%83n%20%26nbsp%3Bs%E1%BB%AD%2C%20kh%26aacute%3Bnh%20%26nbsp%3Bt%E1%BB%A9%2C%20kh%E1%BA%A3i%20%26nbsp%3Bto%E1%BA%A3n%2C%20kinh%20%26nbsp%3Bl%E1%BA%A1c%2C%20k%26igrave%3B%20%26nbsp%3Bph%26uacute%3Bc%2C%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%20%26nbsp%3Bnh%26acirc%3Bn%2C%20l%26acirc%3Bm%20%26nbsp%3Bch%26aacute%3Bnh%20th%26acirc%3Bn%20d%26acirc%3Bn%2C%20l%E1%BA%ADp%20kho%26aacute%3Bn%2C%20m%E1%BB%A5c%20d%C6%B0%E1%BB%A1ng%2C%20n%E1%BA%A1p%20s%26uacute%3Bc%2C%20xu%E1%BA%A5t%20s%C6%B0%2C%26nbsp%3Bn%E1%BA%A1p%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%26aacute%3Bi%2C%20n%E1%BA%A1p%20t%26agrave%3Bi%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20ph%26oacute%3B%20nh%E1%BA%ADm%2C%20ph%E1%BA%A1t%20m%E1%BB%99c%2C%20quan%20%C4%91%E1%BB%9Bi%2C%20thi%20%26acirc%3Bn%20phong%20b%26aacute%3Bi%2C%20thi%E1%BB%87n%20th%26agrave%3Bnh%20qu%26aacute%3Bch%2C%20th%C6%B0%E1%BB%9Fng%20h%E1%BA%A1%2C%20th%C6%B0%E1%BB%A3ng%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%20xu%E1%BA%A5t%20h%26oacute%3Ba%20t%26agrave%3Bi%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%C6%B0%E1%BB%A3ng%26nbsp%3Bl%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bquan%2C%20th%C6%B0%E1%BB%A3ng%20s%26aacute%3Bch%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20ti%E1%BA%BFn%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%20ti%E1%BA%BFn%20%26nbsp%3Bnh%26acirc%3Bn%20kh%E1%BA%A9u%2C%20tr%26uacute%3Bc%20%C4%91%26ecirc%3B%20ph%26ograve%3Bng%2C%20tu%20cung%20th%E1%BA%A5t%2C%20tu%20s%E1%BB%A9c%26nbsp%3Bvi%26ecirc%3Bn%26nbsp%3Bt%C6%B0%E1%BB%9Dng%2C%26nbsp%3Btu%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20tu%20tr%26iacute%3B%20s%E1%BA%A3n%20th%E1%BA%A5t%2C%20tuy%26ecirc%3Bn%20b%E1%BB%91%20ch%26aacute%3Bnh%20s%E1%BB%B1%2C%20tuy%E1%BB%83n%20%26nbsp%3Bt%C6%B0%E1%BB%9Bng%2C%20t%26agrave%3Bi%20ch%E1%BA%BF%2C%20t%26agrave%3Bi%20ch%E1%BB%A7ng%2C%20t%E1%BA%AFc%20huy%E1%BB%87t%2C%20u%E1%BA%A5n%20nh%C6%B0%E1%BB%A1ng%2C%20v%E1%BA%A5n%20danh%2C%20xuy%26ecirc%3Bn%20t%E1%BB%89nh%2C%26nbsp%3B%C4%91%E1%BB%99ng%20th%E1%BB%95.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A63px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A63px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20M%E1%BB%9F%20c%E1%BB%ADa%20h%26agrave%3Bng%2C%20c%C6%B0%E1%BB%9Bi%20h%E1%BB%8Fi%2C%20khai%20tr%C6%B0%C6%A1ng%2C%20l%26oacute%3Bt%20gi%C6%B0%E1%BB%9Dng%2C%20%C4%91%26oacute%3Bng%20gi%C6%B0%E1%BB%9Dng%2C%20cho%20vay%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95%2C%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20v%E1%BA%BD%20h%E1%BB%8Da%20ch%E1%BB%A5p%20%E1%BA%A3nh%2C%20l%26ecirc%3Bn%20quan%20nh%E1%BA%ADm%20ch%E1%BB%A9c%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%E1%BB%AB%20k%E1%BA%BF%20%26nbsp%3Bch%E1%BB%A9c%20%26nbsp%3Bt%C6%B0%E1%BB%9Bc%20%26nbsp%3Bhay%20s%E1%BB%B1%20nghi%E1%BB%87p%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20h%E1%BB%8Dc%20%26nbsp%3Bk%E1%BB%B9%20ngh%E1%BB%87%2C%20n%E1%BA%A1p%20l%E1%BB%85%20c%E1%BA%A7u%20th%26acirc%3Bn%2C%20v%26agrave%3Bo%20l%26agrave%3Bm%20h%26agrave%3Bnh%20ch%26aacute%3Bnh%2C%20n%E1%BA%A1p%20%C4%91%C6%A1n%20d%26acirc%3Bng%20s%E1%BB%9B%2C%20%C4%91%26oacute%3Bng%20th%E1%BB%8D%20d%C6%B0%E1%BB%A1ng%20sanh.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"8","ten_truc":"Nguy","chi_thang1":"Dậu","chi_thang2":"Tuất","chi_thang3":"Hợi","chi_thang4":"Tý","chi_thang5":"Sửu","chi_thang6":"Dần","chi_thang7":"Mão","chi_thang8":"Thìn","chi_thang9":"Tỵ","chi_thang10":"Ngọ","chi_thang11":"Mùi","chi_thang12":"Thân","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A50px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Nguy%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ET%E1%BB%91t%20X%E1%BA%A5u%20T%26ugrave%3By%20Vi%E1%BB%87c%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Nguy%20kh%E1%BA%A3%20b%E1%BB%99%20ng%C6%B0%2C%20b%E1%BA%A5t%20l%E1%BB%A3i%20h%26agrave%3Bnh%20thuy%E1%BB%81n%26nbsp%3B%20-%26nbsp%3B%20Nguy%20n%26ecirc%3Bn%20b%E1%BA%AFt%20c%26aacute%3B%20g%E1%BA%A7n%2C%20%C4%91i%20thuy%E1%BB%81n%20xa%20ch%E1%BA%B3ng%20l%E1%BB%A3i.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Nguy%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Nguy%20c%C6%A1%2C%20nguy%20hi%E1%BB%83m%2C%20l%26agrave%3B%20ng%26agrave%3By%20ch%C6%B0%20s%E1%BB%B1%20b%E1%BA%A5t%20nghi%20%28Hung%29.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%A7y%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20bi%26ecirc%3Bn%20c%E1%BA%A3nh%2C%20an%20s%26agrave%3Bng%2C%20hu%E1%BA%A5n%20binh%2C%20hu%E1%BA%A5n%20luy%E1%BB%87n%2C%20k%26igrave%3B%20ph%26uacute%3Bc%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20s%26aacute%3Bch%20t%26aacute%3B%2C%20tuy%E1%BB%83n%20t%C6%B0%E1%BB%9Bng%2C%20t%E1%BA%BF%20t%E1%BB%B1.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A28px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20s%26agrave%3Bng%2C%20%C4%91%26aacute%3Bnh%20c%26aacute%3B%2C%20l%26oacute%3Bt%20gi%C6%B0%E1%BB%9Dng%2C%20%C4%91%26oacute%3Bng%20gi%C6%B0%E1%BB%9Dng%2C%20%C4%91i%20s%C4%83n%20th%26uacute%3B%20c%26aacute%3B%2C%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%20l%26agrave%3Bm%20l%26ograve%3B%20nhu%E1%BB%99m%2C%20l%26ograve%3B%20g%E1%BB%91m.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A30px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A30px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Gi%26aacute%3B%20th%26uacute%3B%2C%20ph%E1%BA%A1t%20m%E1%BB%99c%2C%20thi%26ecirc%3Bn%20t%E1%BB%89%2C%20th%E1%BB%A7%20ng%C6%B0%2C%20th%E1%BB%ABa%20thuy%E1%BB%81n%2C%20t%E1%BA%A1o%20t%26aacute%3Bng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20%C4%91i%E1%BB%81n%20li%E1%BB%87p%2C%20%C4%91%C4%83ng%20s%C6%A1n.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A47px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3A%20center%3B%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A47px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Khai%20tr%C6%B0%C6%A1ng%2C%20h%26ugrave%3Bn%20h%E1%BB%8Dp%2C%20c%C6%B0%E1%BB%9Bi%20h%E1%BB%8Fi%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%20%C4%91%C6%B0%E1%BB%9Dng%20th%E1%BB%A7y%2C%20nguy%20c%C6%A1%2C%20nguy%20hi%E1%BB%83m%2C%20l%26agrave%3B%20ng%26agrave%3By%20ch%C6%B0%20s%E1%BB%B1%20b%E1%BA%A5t%20nghi%20%28hung%29%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"9","ten_truc":"Thành","chi_thang1":"Tuất","chi_thang2":"Hợi","chi_thang3":"Tý","chi_thang4":"Sửu","chi_thang5":"Dần","chi_thang6":"Mão","chi_thang7":"Thìn","chi_thang8":"Tỵ","chi_thang9":"Ngọ","chi_thang10":"Mùi","chi_thang11":"Thân","chi_thang12":"Dậu","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A84px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Th%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%3C%2Fstrong%3E%3Cstrong%3E%20Thi%26ecirc%3Bn%20H%E1%BB%B7%2C%20Tam%20H%E1%BB%A3p%20%28t%E1%BB%91t%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EC%26ocirc%3B%20Th%E1%BA%A7n%20%28x%E1%BA%A5u%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20v%E1%BB%9Bi%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20gi%26aacute%3B%20th%26uacute%3B%2C%20khai%20tr%C6%B0%C6%A1ng.%20X%E1%BA%A5u%20v%E1%BB%9Bi%20ki%E1%BB%87n%20c%26aacute%3Bo%2C%20tranh%20ch%E1%BA%A5p%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Th%26agrave%3Bnh%20kh%E1%BA%A3%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20tranh%20t%E1%BB%A5ng%20b%E1%BA%A5t%20c%C6%B0%E1%BB%9Dng%20-%20Th%26agrave%3Bnh%20n%26ecirc%3Bn%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20ki%E1%BB%87n%20c%26aacute%3Bo%20ch%E1%BA%B3ng%20h%C6%A1n%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Th%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%26agrave%3Bnh%20c%26ocirc%3Bng%2C%20thi%26ecirc%3Bn%20%C4%91%E1%BA%BF%20k%E1%BB%89%20v%E1%BA%A1n%20v%E1%BA%ADt%20th%26agrave%3Bnh%20t%E1%BB%B1u%20l%26agrave%3B%20ng%26agrave%3By%20%C4%91%E1%BA%A1i%20c%26aacute%3Bt.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Kim%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20bi%26ecirc%3Bn%20c%E1%BA%A3nh%2C%20b%26agrave%3Bn%20di%2C%20c%E1%BA%A7u%20t%26agrave%3Bi%2C%20khai%20th%E1%BB%8B%2C%20l%E1%BA%ADp%20kh%E1%BA%BF%2C%20m%E1%BB%A5c%20d%C6%B0%E1%BB%A1ng%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20tr%26uacute%3Bc%20%C4%91%26ecirc%3B%20ph%26ograve%3Bng%2C%20t%26agrave%3Bi%20ch%E1%BB%A7ng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A156px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A156px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Khai%20%26nbsp%3Btr%C6%B0%C6%A1ng%2C%20nh%E1%BA%ADp%20%26nbsp%3Bh%E1%BB%8Dc%2C%20gi%26aacute%3B%20%26nbsp%3Bth%26uacute%3B%2C%20d%E1%BB%B1ng%20%26nbsp%3Bnh%26agrave%3B%2C%20c%26uacute%3Bng%20t%E1%BA%BF%2C%20di%20d%E1%BB%9Di%2C%20l%E1%BA%ADp%20kh%E1%BA%BF%20%C6%B0%E1%BB%9Bc%2C%20giao%20d%E1%BB%8Bch%26nbsp%3Bcho%20vay%2C%20th%26acirc%3Bu%20n%E1%BB%A3%2C%20mua%20h%26agrave%3Bng%2C%26nbsp%3Bxu%E1%BA%A5t%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20h%26agrave%3Bnh%2C%20%C4%91i%20%26nbsp%3Bthuy%E1%BB%81n%2C%20%C4%91em%20%26nbsp%3Bng%C5%A9%20%26nbsp%3Bc%E1%BB%91c%20%26nbsp%3Bv%26agrave%3Bo%26nbsp%3Bkho%2C%20kh%E1%BB%9Fi%20t%E1%BA%A1o%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95%2C%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20g%E1%BA%AFn%20c%E1%BB%ADa%2C%20%C4%91%E1%BA%B7t%20t%26aacute%3Bng%2C%20k%26ecirc%3B%20g%26aacute%3Bc%2C%26nbsp%3Bd%E1%BB%B1ng%20x%26acirc%3By%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20kho%20v%E1%BB%B1a%2C%20l%26agrave%3Bm%20hay%20s%E1%BB%ADa%20ch%E1%BB%AFa%20ph%26ograve%3Bng%20b%E1%BA%BFp%2C%20th%E1%BB%9D%20ph%E1%BB%A5ng%20T%26aacute%3Bo%20Th%E1%BA%A7n%2C%20%C4%91%E1%BA%B7t%20y%26ecirc%3Bn%20ch%E1%BB%97%26nbsp%3Bm%26aacute%3By%20d%E1%BB%87t%20hay%20c%26aacute%3Bc%20lo%E1%BA%A1i%20m%26aacute%3By%2C%20g%E1%BA%B7t%20l%26uacute%3Ba%2C%20%C4%91%26agrave%3Bo%26nbsp%3Bao%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20gi%E1%BA%BFng%2C%20th%26aacute%3Bo%20%26nbsp%3Bn%C6%B0%E1%BB%9Bc%2C%20c%E1%BA%A7u%20%26nbsp%3Bth%E1%BA%A7y%20ch%E1%BB%AFa%20b%E1%BB%87nh%2C%20mua%26nbsp%3Btr%26acirc%3Bu%20ng%E1%BB%B1a%2C%20c%26aacute%3Bc%20vi%E1%BB%87c%20trong%20v%E1%BB%A5%20nu%26ocirc%3Bi%20t%E1%BA%B1m%2C%20l%26agrave%3Bm%20chu%E1%BB%93ng%20g%26agrave%3B%20ng%E1%BB%97ng%20v%E1%BB%8Bt%2C%20nh%E1%BA%ADp%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20h%E1%BB%8Dc%2C%20n%E1%BA%A1p%20%26nbsp%3Bl%E1%BB%85%20%26nbsp%3Bc%E1%BA%A7u%20%26nbsp%3Bth%26acirc%3Bn%2C%20c%C6%B0%E1%BB%9Bi%20%26nbsp%3Bg%26atilde%3B%2C%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%2C%20n%E1%BA%A1p%20n%26ocirc%3B%20t%E1%BB%B3%2C%20n%E1%BA%A1p%20%C4%91%C6%A1n%20d%26acirc%3Bng%20s%E1%BB%9B%2C%20h%E1%BB%8Dc%20k%E1%BB%B9%20ngh%E1%BB%87%2C%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%20l%26agrave%3Bm%20l%26ograve%3B%20nhu%E1%BB%99m%26nbsp%3B%26nbsp%3Bl%26ograve%3B%20g%E1%BB%91m%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20l%26agrave%3Bm%20ho%E1%BA%B7c%20s%E1%BB%ADa%20thuy%E1%BB%81n%20ch%26egrave%3Bo%2C%20%C4%91%E1%BA%A9y%20thuy%E1%BB%81n%20m%E1%BB%9Bi%20xu%E1%BB%91ng%20n%C6%B0%E1%BB%9Bc%2C%20v%E1%BA%BD%20tranh%2C%20b%26oacute%3B%20c%26acirc%3By%20%C4%91%E1%BB%83%20chi%E1%BA%BFt%20nh%26aacute%3Bnh%2C%20%26nbsp%3Bb%26aacute%3Bn%20h%26agrave%3Bng%2C%26nbsp%3Bg%26aacute%3Bc%20%C4%91%26ograve%3Bn%20%C4%91%26ocirc%3Bng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20T%E1%BB%91%20t%E1%BB%A5ng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ki%E1%BB%87n%20t%E1%BB%A5ng%2C%20an%20t%26aacute%3Bng%2C%20ki%E1%BB%87n%20t%E1%BB%A5ng%2C%20ph%26acirc%3Bn%20tranh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"10","ten_truc":"Thu","chi_thang1":"Hợi","chi_thang2":"Tý","chi_thang3":"Sửu","chi_thang4":"Dần","chi_thang5":"Mão","chi_thang6":"Thìn","chi_thang7":"Tỵ","chi_thang8":"Ngọ","chi_thang9":"Mùi","chi_thang10":"Thân","chi_thang11":"Dậu","chi_thang12":"Tuất","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A65px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Th%26acirc%3Bu%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%3C%2Fstrong%3E%3Cstrong%3E%20%C4%90%E1%BB%8Ba%20Ph%26aacute%3B%20%28x%E1%BA%A5u%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EThu%20ho%E1%BA%A1ch%20t%E1%BB%91t%2C%20k%E1%BB%8B%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20an%20t%26aacute%3Bng.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Th%26acirc%3Bu%20nghi%20t%26aacute%3Bc%20ki%E1%BB%87t%2C%20ki%E1%BA%BFp%20k%E1%BB%8B%20h%26agrave%3Bnh%20t%26agrave%3Bng%26nbsp%3B%20-%26nbsp%3B%20Th%26acirc%3Bu%20n%26ecirc%3Bn%20l%26agrave%3Bm%20vi%E1%BB%87c%20l%26agrave%3Bnh%2C%20tr%E1%BB%99m%20c%E1%BA%AFp%20kh%26oacute%3B%20tr%26aacute%3Bnh.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Th%26acirc%3Bu%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Thu%20th%26agrave%3Bnh%2C%20thu%20ho%E1%BA%A1ch%2C%20l%26agrave%3B%20ng%26agrave%3By%20thi%26ecirc%3Bn%20%C4%91%E1%BA%BF%20b%E1%BA%A3o%20kh%E1%BB%91%20thu%20n%E1%BA%A1p.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%A7y%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A82px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A82px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20%C4%91%E1%BB%91i%20%26nbsp%3Bng%E1%BA%A1i%2C%20b%26igrave%3Bnh%20tr%26igrave%3B%20%C4%91%E1%BA%A1o%20%C4%91%E1%BB%93%2C%20b%E1%BB%95%20%26nbsp%3Bvi%26ecirc%3Bn%2C%20b%E1%BB%99%20tr%26oacute%3Bc%2C%20ch%E1%BB%89nh%20dung%20th%E1%BA%BF%20%C4%91%E1%BA%A7u%2C%26nbsp%3Bch%E1%BB%89nh%20th%E1%BB%A7%20t%26uacute%3Bc%20gi%26aacute%3Bp%2C%20ho%26atilde%3Bn%20h%26igrave%3Bnh%20ng%E1%BB%A5c%2C%20h%26agrave%3Bnh%20hu%E1%BB%87%20%26aacute%3Bi%2C%26nbsp%3Bnh%E1%BA%ADp%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20h%E1%BB%8Dc%2C%20n%E1%BA%A1p%20s%26uacute%3Bc%2C%20n%E1%BA%A1p%20t%26agrave%3Bi%2C%20ph%26aacute%3B%20%E1%BB%91c%20ho%E1%BA%A1i%20vi%26ecirc%3Bn%2C%20ph%E1%BA%A1t%20m%E1%BB%99c%2C%20thi%20%26acirc%3Bn%20hu%E1%BB%87%26nbsp%3Bth%E1%BB%A7%20ng%C6%B0%2C%20ti%E1%BA%BFn%20nh%26acirc%3Bn%20kh%E1%BA%A9u%2C%20tu%20s%E1%BB%A9c%20vi%26ecirc%3Bn%20t%C6%B0%E1%BB%9Dng%2C%20tu%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20tu%E1%BA%A5t%20c%26ocirc%3B%20%26nbsp%3Bqu%E1%BB%B3nh%2C%20t%26agrave%3Bi%20%26nbsp%3Bch%E1%BB%A7ng%2C%20t%E1%BA%A3o%20x%26aacute%3B%20v%C5%A9%2C%20t%E1%BA%AFc%20huy%E1%BB%87t%2C%20t%E1%BA%BF%20t%E1%BB%B1%2C%20t%E1%BB%A9%20%26nbsp%3Bx%26aacute%3B%2C%20%C4%91i%E1%BB%81n%20%26nbsp%3Bli%E1%BB%87p%2C%20%C4%91%26agrave%3Bm%20%26acirc%3Bn%2C%20m%E1%BB%99c%20%26nbsp%3Bd%E1%BB%A5c%2C%20m%E1%BB%A5c%20d%C6%B0%E1%BB%A1ng%2C%26nbsp%3Btuy%E1%BA%BFt%20%26nbsp%3Boan%20%26nbsp%3Bu%E1%BB%95ng.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A80px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A80px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20X%26acirc%3By%20%26nbsp%3Bkho%2C%20nh%E1%BA%ADp%20%26nbsp%3Bt%26agrave%3Bi%2C%20mua%20%26nbsp%3Bl%E1%BB%A5c%20%26nbsp%3Bs%26uacute%3Bc%2C%20%C4%91%26aacute%3Bnh%20%26nbsp%3Bb%E1%BA%AFt%20khai%20%26nbsp%3Btr%C6%B0%C6%A1ng%2C%20%C4%91em%20ng%C5%A9%20c%E1%BB%91c%20v%26agrave%3Bo%20kho%26nbsp%3Bc%E1%BA%A5y%20l%26uacute%3Ba%20g%E1%BA%B7t%20l%26uacute%3Ba%2C%20mua%20tr%26acirc%3Bu%2C%20nu%26ocirc%3Bi%20t%E1%BA%B1m%2C%20%C4%91i%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20s%C4%83n%20th%26uacute%3B%20c%26aacute%3B%2C%20b%26oacute%3B%20c%26acirc%3By%20%C4%91%E1%BB%83%20%26nbsp%3Bchi%E1%BA%BFt%20%26nbsp%3Bnh%26aacute%3Bnh%26nbsp%3Bl%26oacute%3Bt%26nbsp%3Bgi%C6%B0%E1%BB%9Dng%20%C4%91%26oacute%3Bng%20gi%C6%B0%E1%BB%9Dng%2C%20%C4%91%E1%BB%99ng%20%C4%91%E1%BA%A5t%2C%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20n%E1%BB%AF%20nh%26acirc%3Bn%20kh%E1%BB%9Fi%20ng%26agrave%3By%20u%E1%BB%91ng%20thu%E1%BB%91c%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20l%26ecirc%3Bn%20%26nbsp%3Bquan%20%26nbsp%3Bl%26atilde%3Bnh%20%26nbsp%3Bch%E1%BB%A9c%2C%20th%E1%BB%ABa%20%26nbsp%3Bk%E1%BA%BF%20%26nbsp%3Bch%E1%BB%A9c%20%26nbsp%3Bt%C6%B0%E1%BB%9Bc%20%26nbsp%3Bhay%20%26nbsp%3Bs%E1%BB%B1%20nghi%E1%BB%87p%20%26nbsp%3Bv%26agrave%3Bo%20%26nbsp%3Bl%26agrave%3Bm%20h%26agrave%3Bnh%20ch%26aacute%3Bnh%2C%20n%E1%BA%A1p%20%C4%91%C6%A1n%20d%26acirc%3Bng%20s%E1%BB%9B%2C%20m%C6%B0u%20s%E1%BB%B1%20%26nbsp%3Bkhu%E1%BA%A5t%20%26nbsp%3Bl%E1%BA%A5p.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A114px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A114px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20ph%E1%BB%A7%20bi%26ecirc%3Bn%20c%E1%BA%A3nh%2C%20an%20s%26agrave%3Bng%2C%20an%20t%26aacute%3Bng%2C%20ban%20chi%E1%BA%BFu%2C%20b%26agrave%3Bn%20di%2C%20chi%26ecirc%3Bu%20hi%E1%BB%81n%26nbsp%3Bc%E1%BA%A7u%20t%E1%BB%B1%2C%20c%E1%BA%A7u%20y%2C%20c%E1%BB%95%20ch%26uacute%3B%2C%20c%E1%BB%AD%20ch%26aacute%3Bnh%20tr%E1%BB%B1c%2C%20doanh%20ki%E1%BA%BFn%20cung%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%E1%BA%A5t%2C%20giao%20%26nbsp%3Bd%E1%BB%8Bch%20%26nbsp%3Bgi%26aacute%3B%20%26nbsp%3Bth%26uacute%3B%2C%20gi%E1%BA%A3i%20%26nbsp%3Btr%E1%BB%AB%2C%20hu%E1%BA%A5n%20binh%2C%20h%26agrave%3Bnh%20%26nbsp%3Bh%E1%BA%A1nh%2C%20h%C6%B0ng%20%26nbsp%3Bt%E1%BA%A1o%2C%20khai%20c%E1%BB%AB%2C%20khai%20th%C6%B0%C6%A1ng%26nbsp%3Bkh%E1%BB%91%2C%20khai%20th%E1%BB%8B%2C%20khi%E1%BB%83n%20s%E1%BB%AD%2C%20kh%26aacute%3Bnh%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20t%E1%BB%A9%2C%20kh%E1%BA%A3i%20%26nbsp%3Bto%E1%BA%A3n%2C%20kinh%20%26nbsp%3Bl%E1%BA%A1c%2C%20k%26igrave%3B%20%26nbsp%3Bph%26uacute%3Bc%2C%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%20%26nbsp%3Bnh%26acirc%3Bn%26nbsp%3Bli%E1%BB%87u%20b%E1%BB%87nh%2C%20l%26acirc%3Bm%20ch%26aacute%3Bnh%20th%26acirc%3Bn%20d%26acirc%3Bn%2C%20l%E1%BA%ADp%20kho%26aacute%3Bn%2C%20n%E1%BA%A1p%20th%26aacute%3Bi%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20ph%26oacute%3B%20nh%E1%BA%ADm%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20quan%20%26nbsp%3B%C4%91%E1%BB%9Bi%2C%20thi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bphong%20b%26aacute%3Bi%2C%20thi%E1%BB%87n%20th%26agrave%3Bnh%20qu%26aacute%3Bch%2C%20th%C6%B0%E1%BB%9Fng%20h%E1%BA%A1%2C%20th%C6%B0%E1%BB%A3ng%20l%C6%B0%C6%A1ng%26nbsp%3Bth%C6%B0%E1%BB%A3ng%20quan%2C%20th%C6%B0%E1%BB%A3ng%20s%26aacute%3Bch%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20ti%E1%BA%BFn%20bi%E1%BB%83u.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Tang%20l%E1%BB%85%2C%20an%20t%26aacute%3Bng%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20xu%E1%BA%A5t%20ti%E1%BB%81n.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"11","ten_truc":"Khai","chi_thang1":"Tý","chi_thang2":"Sửu","chi_thang3":"Dần","chi_thang4":"Mão","chi_thang5":"Thìn","chi_thang6":"Tỵ","chi_thang7":"Ngọ","chi_thang8":"Mùi","chi_thang9":"Thân","chi_thang10":"Dậu","chi_thang11":"Tuất","chi_thang12":"Hợi","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A65px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Khai%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%3C%2Fstrong%3E%3Cstrong%3E%20Sinh%20Kh%26iacute%3B%20%28t%E1%BB%91t%29%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20m%E1%BB%8Di%20vi%E1%BB%87c%2C%20tr%E1%BB%AB%20%C4%91%E1%BB%99ng%20th%E1%BB%95%2C%20an%20t%26aacute%3Bng.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20Khai%20kh%E1%BA%A3%20c%E1%BA%A7u%20nh%E1%BA%ADm%20an%20t%26aacute%3Bng%20b%E1%BA%A5t%20t%C6%B0%E1%BB%9Dng%26nbsp%3B%20-%26nbsp%3B%20Khai%20n%26ecirc%3Bn%20nh%E1%BA%ADm%20ch%E1%BB%A9c%2C%20an%20t%26aacute%3Bng%20ch%E1%BA%B3ng%20hay.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Khai%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Khai%20th%E1%BB%A7y%2C%20l%26agrave%3B%20ng%26agrave%3By%20khai%20tri%E1%BB%83n.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Kim%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A134px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A134px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20s%26agrave%3Bng%2C%20an%20%C4%91%E1%BB%91i%20ng%E1%BA%A1i%2C%20ban%20chi%E1%BA%BFu%2C%20b%26agrave%3Bn%20di%2C%20chi%26ecirc%3Bu%20hi%E1%BB%81n%2C%20c%E1%BA%A7u%20t%E1%BB%B1%2C%20c%E1%BA%A7u%20y%2C%20c%E1%BB%AD%20ch%26aacute%3Bnh%20tr%E1%BB%B1c%2C%20gi%E1%BA%A3i%20tr%E1%BB%AB%26nbsp%3Bho%26atilde%3Bn%20h%26igrave%3Bnh%20ng%E1%BB%A5c%2C%20h%26agrave%3Bnh%20hu%E1%BB%87%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20%26aacute%3Bi%2C%20h%26agrave%3Bnh%20%26nbsp%3Bh%E1%BA%A1nh%2C%20h%C6%B0ng%20%26nbsp%3Bt%E1%BA%A1o%2C%20khai%20c%E1%BB%AB%2C%20khai%20th%E1%BB%8B%2C%20khi%E1%BB%83n%20s%E1%BB%AD%2C%20kh%26aacute%3Bnh%20t%E1%BB%A9%26nbsp%3Bk%26igrave%3B%20ph%26uacute%3Bc%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%20l%26acirc%3Bm%20ch%26aacute%3Bnh%20th%26acirc%3Bn%20d%26acirc%3Bn%2C%20m%E1%BB%A5c%20d%C6%B0%E1%BB%A1ng%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20nh%E1%BA%ADp%20%26nbsp%3Bh%E1%BB%8Dc%2C%20ph%26oacute%3B%20%26nbsp%3Bnh%E1%BA%ADm%2C%20thi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bhu%E1%BB%87%20%26nbsp%3Bthi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bphong%20%26nbsp%3Bb%26aacute%3Bi%2C%20thi%E1%BB%87n%20%26nbsp%3Bth%26agrave%3Bnh%20qu%26aacute%3Bch%2C%20th%C6%B0%E1%BB%9Fng%20h%E1%BA%A1%2C%20th%C6%B0%E1%BB%A3ng%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%26nbsp%3Bth%C6%B0%E1%BB%A3ng%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20l%C6%B0%C6%A1ng%2C%26nbsp%3Bth%C6%B0%E1%BB%A3ng%20%26nbsp%3Bquan%2C%20th%C6%B0%E1%BB%A3ng%20s%26aacute%3Bch%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20ti%E1%BA%BFn%20bi%E1%BB%83u%20%26nbsp%3Bch%C6%B0%C6%A1ng%2C%20tu%20cung%20%26nbsp%3Bth%E1%BA%A5t%2C%20tu%20tr%26iacute%3B%20s%E1%BA%A3n%20th%E1%BA%A5t%2C%20tuy%26ecirc%3Bn%26nbsp%3Bch%26aacute%3Bnh%26nbsp%3B%20s%E1%BB%B1%2C%20tuy%E1%BA%BFt%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20oan%20%26nbsp%3Bu%E1%BB%95ng%2C%20tu%E1%BA%A5t%20%26nbsp%3Bc%26ocirc%3B%20%26nbsp%3Bqu%E1%BB%B3nh%2C%20t%26agrave%3Bi%20%26nbsp%3Bch%E1%BA%BF%2C%20t%26agrave%3Bi%20%26nbsp%3Bch%E1%BB%A7ng%2C%26nbsp%3Bt%E1%BA%BF%20%26nbsp%3Bt%E1%BB%B1%2C%20t%E1%BB%A9%20%26nbsp%3Bx%26aacute%3B%2C%20xuy%26ecirc%3Bn%20%26nbsp%3Bt%E1%BB%89nh%2C%20xu%E1%BA%A5t%20%26nbsp%3Bh%26agrave%3Bnh%2C%20y%E1%BA%BFn%20%26nbsp%3Bh%E1%BB%99i%2C%20%C4%91%26agrave%3Bm%20%26nbsp%3B%26acirc%3Bn%2C%20%C4%91%E1%BB%99ng%20%26nbsp%3Bth%E1%BB%95.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A115px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A115px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20khai%20tr%C6%B0%C6%A1ng%2C%20%C4%91%E1%BB%99ng%20%26nbsp%3Bth%E1%BB%95%2C%20tu%20t%E1%BA%A1o%2C%20nh%E1%BA%ADm%20ch%E1%BB%A9c%2C%20nu%26ocirc%3Bi%20%26nbsp%3Bgia%20s%26uacute%3Bc%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20%C4%91i%20thuy%E1%BB%81n%26nbsp%3Bkh%E1%BB%9Fi%20t%E1%BA%A1o%2C%20%C4%91%E1%BB%99ng%26nbsp%3Bth%E1%BB%95%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ban%20n%E1%BB%81n%20%C4%91%E1%BA%AFp%20n%E1%BB%81n%2C%20d%E1%BB%B1ng%20x%26acirc%3By%20kho%20v%E1%BB%B1a%2C%20l%26agrave%3Bm%20hay%20s%E1%BB%ADa%20ph%26ograve%3Bng%20b%E1%BA%BFp%2C%20th%E1%BB%9D%26nbsp%3Bc%26uacute%3Bng%20T%26aacute%3Bo%20Th%E1%BA%A7n%2C%20%C4%91%26oacute%3Bng%20gi%C6%B0%E1%BB%9Dng%20l%26oacute%3Bt%20%26nbsp%3B%20gi%C6%B0%E1%BB%9Dng%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20may%20%26aacute%3Bo%2C%20%C4%91%E1%BA%B7t%20%26nbsp%3By%26ecirc%3Bn%20%26nbsp%3Bch%E1%BB%97%20%26nbsp%3Bm%26aacute%3By%20%26nbsp%3Bd%E1%BB%87t%20%26nbsp%3Bhay%20%26nbsp%3Bc%26aacute%3Bc%20%26nbsp%3Blo%E1%BA%A1i%20%26nbsp%3Bm%26aacute%3By%26nbsp%3Bc%E1%BA%A5y%20l%26uacute%3Ba%20g%E1%BA%B7t%20l%26uacute%3Ba%2C%20%C4%91%26agrave%3Bo%20ao%20gi%E1%BA%BFng%2C%20th%26aacute%3Bo%20n%C6%B0%E1%BB%9Bc%2C%20c%26aacute%3Bc%20vi%E1%BB%87c%20trong%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20v%E1%BB%A5%20nu%26ocirc%3Bi%20t%E1%BA%B1m%2C%20m%E1%BB%9F%26nbsp%3Bth%26ocirc%3Bng%20h%26agrave%3Bo%20r%26atilde%3Bnh%26nbsp%3Bc%E1%BA%A7u%20th%E1%BA%A7y%20ch%E1%BB%AFa%20b%E1%BB%87nh%2C%20h%E1%BB%91t%20thu%E1%BB%91c%2C%20u%E1%BB%91ng%20thu%E1%BB%91c%2C%20mua%20tr%26acirc%3Bu%2C%20l%26agrave%3Bm%20r%C6%B0%E1%BB%A3u%2C%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20h%E1%BB%8Dc%20%26nbsp%3Bk%E1%BB%B9%20%26nbsp%3Bngh%E1%BB%87%20%26nbsp%3Bv%E1%BA%BD%20%26nbsp%3Btranh%2Ckh%E1%BB%9Fi%20%26nbsp%3Bc%26ocirc%3Bng%20%26nbsp%3Bl%26agrave%3Bm%20%26nbsp%3Bl%26ograve%3B%20%26nbsp%3Bnhu%E1%BB%99m%20l%26ograve%3B%20g%E1%BB%91m%2C%20l%26agrave%3Bm%20chu%E1%BB%93ng%20g%26agrave%3B%20ng%E1%BB%97ng%20v%E1%BB%8Bt%2C%20b%26oacute%3B%20c%26acirc%3By%20%C4%91%E1%BB%83%20chi%E1%BA%BFt%20nh%26aacute%3Bnh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20t%26aacute%3Bng%2C%20kh%E1%BA%A3i%20to%26agrave%3Bn%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20ph%26oacute%3Bng%20tr%26aacute%3Bi%2C%20ph%E1%BA%A1t%20m%E1%BB%99c%2C%20th%E1%BB%A7%20ng%C6%B0%2C%20t%E1%BB%91%20t%E1%BB%A5ng%2C%20%C4%91i%E1%BB%81n%20li%E1%BB%87p.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A29px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Tang%20l%E1%BB%85%2C%20tr%E1%BB%93ng%20c%26acirc%3By%2C%20giao%20d%E1%BB%8Bch%2C%20an%20t%26aacute%3Bng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"},{"stt":"12","ten_truc":"Bế","chi_thang1":"Sửu","chi_thang2":"Dần","chi_thang3":"Mão","chi_thang4":"Thìn","chi_thang5":"Tỵ","chi_thang6":"Ngọ","chi_thang7":"Mùi","chi_thang8":"Thân","chi_thang9":"Dậu","chi_thang10":"Tuất","chi_thang11":"Hợi","chi_thang12":"Tý","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A24px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20B%E1%BA%BF%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20X%E1%BA%A5u%20T%26ugrave%3By%20Vi%E1%BB%87c%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20B%E1%BA%BF%20b%E1%BA%A5t%20tr%E1%BB%8B%20m%E1%BB%A5c%2C%20ch%E1%BB%89%20h%E1%BB%A9a%20an%20s%26agrave%3Bng%26nbsp%3B%20-%26nbsp%3B%20B%E1%BA%BF%20ch%E1%BA%B3ng%20n%26ecirc%3Bn%20tr%E1%BB%8B%20m%E1%BA%AFt%2C%20ch%E1%BB%89%20n%26ecirc%3Bn%20cho%20vi%E1%BB%87c%20an%20s%26agrave%3Bng.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20B%E1%BA%BF%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BA%ADp%20nh%E1%BB%8B%20ki%E1%BA%BFn%20trung%20t%E1%BB%91i%20h%E1%BA%ADu%20nh%E1%BA%A5t%20nh%E1%BA%ADt%3B%20quan%20b%E1%BA%BF%2C%20thu%20t%26agrave%3Bng%3B%20l%26agrave%3B%20ng%26agrave%3By%20thi%26ecirc%3Bn%20%C4%91%E1%BB%8Ba%20%26acirc%3Bm%20d%C6%B0%C6%A1ng%20b%E1%BA%BF%20h%26agrave%3Bn.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A42px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Kim%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%E1%BB%95%20vi%26ecirc%3Bn%2C%20k%26igrave%3B%20ph%26uacute%3Bc%2C%20mai%20huy%E1%BB%87t%2C%20mai%20tr%26igrave%3B%2C%20tr%26uacute%3Bc%20%C4%91%26ecirc%3B%20ph%26ograve%3Bng%2C%20tu%20%E1%BB%91c%2C%20t%E1%BA%A1o%20t%26aacute%3Bng%2C%20t%E1%BA%AFc%20huy%E1%BB%87t%2C%20t%E1%BA%BF%20t%E1%BB%B1%2C%20%C4%91i%E1%BB%81n%20b%E1%BB%95.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A45px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20C%E1%BA%A7u%20%26nbsp%3By%20%26nbsp%3Bh%E1%BB%A3p%20%26nbsp%3Bthu%E1%BB%91c%2C%20x%26acirc%3By%20%26nbsp%3B%C4%91%E1%BA%AFp%20%26nbsp%3Bt%C6%B0%E1%BB%9Dng%2C%20%C4%91%E1%BA%B7t%20t%26aacute%3Bng%2C%20g%E1%BA%AFn%20c%E1%BB%ADa%2C%20k%26ecirc%3B%20g%26aacute%3Bc%2C%20g%26aacute%3Bc%20%C4%91%26ograve%3Bn%20%C4%91%26ocirc%3Bng%2C%20l%26agrave%3Bm%20c%E1%BA%A7u%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ti%26ecirc%3Bu%2C%20kh%E1%BB%9Fi%20c%26ocirc%3Bng%2C%20u%E1%BB%91ng%20thu%E1%BB%91c%2C%20tr%E1%BB%8B%20b%E1%BB%87nh%20%28nh%C6%B0ng%20ch%E1%BB%9B%20tr%E1%BB%8B%20b%E1%BB%87nh%20m%E1%BA%AFt%29%20b%26oacute%3B%20c%26acirc%3By%20%C4%91%E1%BB%83%20chi%E1%BA%BFt%20nh%26aacute%3Bnh.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20%26nbsp%3Bs%26agrave%3Bng%2C%20ban%20%26nbsp%3Bchi%E1%BA%BFu%2C%20b%26agrave%3Bn%20%26nbsp%3Bdi%2C%20chi%26ecirc%3Bu%20%26nbsp%3Bhi%E1%BB%81n%2C%20c%E1%BA%A7u%20%26nbsp%3By%2C%20c%E1%BB%AD%20%26nbsp%3Bch%26aacute%3Bnh%20%26nbsp%3Btr%E1%BB%B1c%2C%20doanh%20%26nbsp%3Bki%E1%BA%BFn%20%26nbsp%3Bcung%20%26nbsp%3Bth%E1%BA%A5t%26nbsp%3Bgi%26aacute%3B%20th%26uacute%3B%2C%20h%26agrave%3Bnh%20h%E1%BA%A1nh%2C%20h%C6%B0ng%20t%E1%BA%A1o%2C%20y%E1%BA%BFn%20h%E1%BB%99i%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20khai%20%26nbsp%3Bc%E1%BB%AB%2C%20khai%20%26nbsp%3Bth%C6%B0%C6%A1ng%20%26nbsp%3Bkh%E1%BB%91%2C%20khai%20%26nbsp%3Bth%E1%BB%8B%2C%20khi%E1%BB%83n%20%26nbsp%3Bs%E1%BB%AD%2C%20kh%26aacute%3Bnh%20%26nbsp%3Bt%E1%BB%A9%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%20nh%26acirc%3Bn%2C%20li%E1%BB%87u%20b%E1%BB%87nh%2C%20l%26acirc%3Bm%20ch%26aacute%3Bnh%20th%26acirc%3Bn%20d%26acirc%3Bn%2C%20n%E1%BA%A1p%20th%26aacute%3Bi%2C%20xu%E1%BA%A5t%20s%C6%B0%2C%26nbsp%3Bph%26oacute%3B%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20nh%E1%BA%ADm%2C%20thi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bphong%20%26nbsp%3Bb%26aacute%3Bi%2C%26nbsp%3Bth%C6%B0%E1%BB%9Fng%20%26nbsp%3Bh%E1%BA%A1%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bbi%E1%BB%83u%20%26nbsp%3Bch%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bl%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bquan%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bs%26aacute%3Bch%2C%20xu%E1%BA%A5t%20%26nbsp%3Bh%26oacute%3Ba%20t%26agrave%3Bi%2C%20th%E1%BB%A5%20tr%E1%BB%A5%2C%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ti%E1%BA%BFn%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%20ti%E1%BA%BFn%20nh%26acirc%3Bn%20kh%E1%BA%A9u%2C%20tu%20cung%20th%E1%BA%A5t%2C%20tu%20tr%26iacute%3B%20s%E1%BA%A3n%20th%E1%BA%A5t%2C%20tuy%26ecirc%3Bn%20b%E1%BB%91%20ch%26aacute%3Bnh%20s%E1%BB%B1%2C%26nbsp%3Bv%E1%BA%A5n%20danh%2C%20xuy%26ecirc%3Bn%20t%E1%BB%89nh%2C%20xu%E1%BA%A5t%20h%26agrave%3Bnh%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A47px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A47px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ki%E1%BB%87n%20%26nbsp%3Bth%C6%B0a%2C%20%C4%91%26agrave%3Bo%20%26nbsp%3Bao%20%26nbsp%3Bgi%E1%BA%BFng%2C%20nh%E1%BA%ADm%20%26nbsp%3Bch%E1%BB%A9c%2C%20khai%20%26nbsp%3Bhuy%E1%BB%87t%2C%20l%26ecirc%3Bn%20%26nbsp%3Bquan%20%26nbsp%3Bl%26atilde%3Bnh%20ch%E1%BB%A9c%2C%20th%E1%BB%ABa%20k%E1%BA%BF%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ch%E1%BB%A9c%26nbsp%3Bt%C6%B0%E1%BB%9Bc%20hay%20s%E1%BB%B1%20nghi%E1%BB%87p%2C%20%26nbsp%3B%20nh%E1%BA%ADp%20h%E1%BB%8Dc%2C%20ch%E1%BB%AFa%20b%E1%BB%87nh%20m%E1%BA%AFt%2C%20c%26aacute%3Bc%20vi%E1%BB%87c%20trong%20v%E1%BB%A5%20nu%26ocirc%3Bi%20t%E1%BA%B1m.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A%0A%3Cp%3E%26nbsp%3B%3C%2Fp%3E%0A"},{"stt":"4","ten_truc":"Bình","chi_thang1":"Tỵ","chi_thang2":"Ngọ","chi_thang3":"Mùi","chi_thang4":"Thân","chi_thang5":"Dậu","chi_thang6":"Tuất","chi_thang7":"Hợi","chi_thang8":"Tý","chi_thang9":"Sửu","chi_thang10":"Dần","chi_thang11":"Mão","chi_thang12":"Thìn","y_nghia":"%3Ctable%20border%3D%221%22%20cellpadding%3D%220%22%20cellspacing%3D%220%22%3E%0A%09%3Ctbody%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20colspan%3D%222%22%20style%3D%22height%3A24px%3B%20width%3A727px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20B%26igrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%26ugrave%3Bng%20V%E1%BB%9Bi%20Ti%E1%BB%83u%20Hao%20%28x%E1%BA%A5u%29%26nbsp%3B%26nbsp%3B%26nbsp%3B%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ET%E1%BB%91t%20X%E1%BA%A5u%20T%26ugrave%3By%20Vi%E1%BB%87c%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EB%26agrave%3Bnh%20T%E1%BB%95%20%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%20Nh%E1%BB%B1t%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A43px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%3Cstrong%3E%26nbsp%3B%20B%26igrave%3Bnh%20kh%E1%BA%A3%20%C4%91%E1%BB%93%20n%26ecirc%3B%2C%20an%20s%26agrave%3Bng%20thi%E1%BA%BFt%20k%E1%BB%8B%26nbsp%3B%26nbsp%3B%20-%26nbsp%3B%20B%26igrave%3Bnh%20n%26ecirc%3Bn%20n%E1%BA%A1o%20v%26eacute%3Bt%2C%20an%20s%26agrave%3Bng%20n%26ecirc%3Bn%20k%E1%BB%8B.%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3E%26Yacute%3B%20Ngh%C4%A9a%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20B%26igrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A41px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%26igrave%3Bnh%20th%C6%B0%E1%BB%9Dng%2C%20l%26agrave%3B%20ng%26agrave%3By%20quan%20nh%26acirc%3Bn%20t%E1%BA%ADp%20h%E1%BB%A3p%20b%26igrave%3Bnh%20ph%26acirc%3Bn.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ETr%E1%BB%B1c%20Thu%E1%BB%99c%3C%2Fstrong%3E%3C%2Fp%3E%0A%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENg%C5%A9%20H%26agrave%3Bnh%3C%2Fstrong%3E%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A44px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Th%E1%BB%A7y%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3ENghi%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A24px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20B%26igrave%3Bnh%20tr%26igrave%3B%20%C4%91%E1%BA%A1o%20%C4%91%E1%BB%93%2C%20ph%26aacute%3B%20th%E1%BB%95%2C%20tu%20s%E1%BB%A9c%20vi%26ecirc%3Bn%20t%C6%B0%E1%BB%9Dng.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A72px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EN%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A72px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Ch%E1%BB%89nh%20trang%20t%C6%B0%E1%BB%9Dng%20r%26agrave%3Bo%2C%20t%E1%BA%A1o%20c%E1%BA%A7u%20s%E1%BB%ADa%20l%E1%BB%99%2C%20di%20chuy%E1%BB%83n%2C%20n%E1%BA%A1o%20v%26eacute%3Bt%2C%20%C4%91em%20ng%C5%A9%20c%E1%BB%91c%20v%26agrave%3Bo%20kho%2C%20%C4%91%E1%BA%B7t%20t%26aacute%3Bng%2C%20g%E1%BA%AFn%20c%E1%BB%ADa%2C%20k%26ecirc%3B%20g%26aacute%3Bc%2C%20g%26aacute%3Bc%20%26nbsp%3B%C4%91%26ograve%3Bn%26nbsp%3B%26nbsp%3B%C4%91%26ocirc%3Bng%2C%20%C4%91%E1%BA%B7t%20%26nbsp%3By%26ecirc%3Bn%20%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20ch%E1%BB%97%20m%26aacute%3By%20d%E1%BB%87t%2C%20s%E1%BB%ADa%20hay%20l%26agrave%3Bm%20thuy%E1%BB%81n%20ch%26egrave%3Bo%2C%20%C4%91%E1%BA%A9y%20thuy%E1%BB%81n%20m%E1%BB%9Bi%20xu%E1%BB%91ng%20n%C6%B0%E1%BB%9Bc%2C%20c%26aacute%3Bc%20v%E1%BB%A5%20b%E1%BB%93i%20%C4%91%E1%BA%AFp%20th%26ecirc%3Bm%20nh%C6%B0%26hellip%3B%20b%E1%BB%93i%20b%26ugrave%3Bn%2C%20%C4%91%E1%BA%AFp%20%C4%91%E1%BA%A5t%2C%20l%26oacute%3Bt%20%C4%91%26aacute%3B%2C%20x%26acirc%3By%20b%E1%BB%9D%20k%26egrave%3B.%20%26nbsp%3B%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EK%E1%BB%8B%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A96px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20An%20%26nbsp%3Bph%E1%BB%A7%20%26nbsp%3Bbi%26ecirc%3Bn%20%26nbsp%3Bc%E1%BA%A3nh%2C%20an%20%26nbsp%3Bs%26agrave%3Bng%2C%20an%20%26nbsp%3Bt%26aacute%3Bng%2C%20ban%20%26nbsp%3Bchi%E1%BA%BFu%2C%20b%26agrave%3Bn%20%26nbsp%3Bdi%2C%20chi%26ecirc%3Bu%20%26nbsp%3Bhi%E1%BB%81n%2C%20c%E1%BA%A7u%20%26nbsp%3Bt%E1%BB%B1%2C%20c%E1%BA%A7u%20%26nbsp%3By%2C%26nbsp%3Bc%E1%BB%95%20%26nbsp%3Bch%26uacute%3B%2C%20c%E1%BB%AD%20ch%26aacute%3Bnh%20%26nbsp%3Btr%E1%BB%B1c%2C%20doanh%20%26nbsp%3Bki%E1%BA%BFn%20%26nbsp%3Bcung%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%E1%BA%A5t%2C%20giao%20%26nbsp%3Bd%E1%BB%8Bch%2C%20gi%26aacute%3B%20%26nbsp%3Bth%26uacute%3B%2C%20gi%E1%BA%A3i%20%26nbsp%3Btr%E1%BB%AB%2C%20hu%E1%BA%A5n%20%26nbsp%3Bbinh%2C%20h%26agrave%3Bnh%20%26nbsp%3Bh%E1%BA%A1nh%2C%20h%C6%B0ng%20%26nbsp%3Bt%E1%BA%A1o%2C%20khai%26nbsp%3B%26nbsp%3Bc%E1%BB%AB%20%26nbsp%3Bxuy%26ecirc%3Bn%20%26nbsp%3Bt%E1%BB%89nh%2C%20khai%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20khai%20%26nbsp%3Bth%E1%BB%8B%2C%20khi%E1%BB%83n%20%26nbsp%3Bs%E1%BB%AD%2C%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20kh%26aacute%3Bnh%20%26nbsp%3Bt%E1%BB%A9%2C%26nbsp%3Bh%E1%BA%A3i%20%26nbsp%3Bto%E1%BA%A3n%2C%20kinh%20%26nbsp%3Bl%E1%BA%A1c%2C%20k%26igrave%3B%20%26nbsp%3Bph%26uacute%3Bc%2C%20k%E1%BA%BFt%20%26nbsp%3Bh%26ocirc%3Bn%20%26nbsp%3Bnh%26acirc%3Bn%2C%20li%E1%BB%87u%20%26nbsp%3Bb%E1%BB%87nh%2C%20l%26acirc%3Bm%20%26nbsp%3Bch%26aacute%3Bnh%20%26nbsp%3Bth%26acirc%3Bn%20%26nbsp%3Bd%26acirc%3Bn%2C%20l%E1%BA%ADp%20%26nbsp%3Bkho%26aacute%3Bn%2C%20%26nbsp%3Bm%E1%BB%A5c%20%26nbsp%3Bd%C6%B0%E1%BB%A1ng%2C%20n%E1%BA%A1p%20%26nbsp%3Bs%26uacute%3Bc%2C%20n%E1%BA%A1p%26nbsp%3B%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20th%26aacute%3Bi%2C%20n%E1%BA%A1p%20%26nbsp%3Bt%26agrave%3Bi%2C%26nbsp%3Bph%26aacute%3B%20%26nbsp%3Bth%E1%BB%95%2C%20ph%26oacute%3B%20%26nbsp%3Bnh%E1%BA%ADm%2C%26nbsp%3Bquan%20%26nbsp%3B%C4%91%E1%BB%9Bi%2C%20thi%20%26nbsp%3B%26acirc%3Bn%20%26nbsp%3Bphong%20%26nbsp%3Bb%26aacute%3Bi%2C%20thi%E1%BB%87n%20%26nbsp%3Bth%26agrave%3Bnh%20%26nbsp%3Bqu%26aacute%3Bch%2C%20th%C6%B0%E1%BB%9Fng%20%26nbsp%3Bh%E1%BA%A1%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bbi%E1%BB%83u%20%26nbsp%3Bch%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20l%C6%B0%C6%A1ng%2C%20th%C6%B0%E1%BB%A3ng%20%26nbsp%3Bquan%2C%26nbsp%3Bth%C6%B0%E1%BB%A3ng%20%26nbsp%3Bs%26aacute%3Bch%2C%20th%E1%BB%A5%20%26nbsp%3Btr%E1%BB%A5%2C%20ti%E1%BA%BFn%20bi%E1%BB%83u%20ch%C6%B0%C6%A1ng%2C%20ti%E1%BA%BFn%20%26nbsp%3Bnh%26acirc%3Bn%20%26nbsp%3Bkh%E1%BA%A9u%2C%20tr%26uacute%3Bc%20%26nbsp%3B%C4%91%26ecirc%3B%20%26nbsp%3Bph%26ograve%3Bng%2C%20tu%20%26nbsp%3Bcung%20th%E1%BA%A5t%2C%20tu%20th%C6%B0%C6%A1ng%20kh%E1%BB%91%2C%20tu%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20tr%26iacute%3B%20s%E1%BA%A3n%20th%E1%BA%A5t%2C%20tuy%26ecirc%3Bn%20b%E1%BB%91%20ch%26aacute%3Bnh%20s%E1%BB%B1%2C%20tuy%E1%BB%83n%26nbsp%3Bt%C6%B0%E1%BB%9Bng%2C%20t%26agrave%3Bi%26nbsp%3Bch%E1%BA%BF%2C%26nbsp%3Bt%26agrave%3Bi%20ch%E1%BB%A7ng%2C%20u%E1%BA%A5n%20nh%C6%B0%E1%BB%A1ng%2C%20v%E1%BA%A5n%20danh%2C%20xu%E1%BA%A5t%20h%26oacute%3Ba%20t%26agrave%3Bi%2C%20xu%E1%BA%A5t%20s%C6%B0%2C%20y%E1%BA%BFn%20h%E1%BB%99i%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%09%3Ctr%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A46px%3B%20width%3A120px%22%3E%0A%09%09%09%3Cp%20style%3D%22text-align%3Acenter%22%3E%3Cstrong%3EKh%26ocirc%3Bng%20N%26ecirc%3Bn%3C%2Fstrong%3E%3A%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%09%3Ctd%20style%3D%22height%3A46px%3B%20width%3A607px%22%3E%0A%09%09%09%3Cp%3E%26nbsp%3B%20Khai%20tr%C6%B0%C6%A1ng%2C%20%C4%91%E1%BB%99ng%20th%E1%BB%95%2C%20an%20s%26agrave%3Bng%2C%20l%26oacute%3Bt%20gi%C6%B0%E1%BB%9Dng%20%C4%91%26oacute%3Bng%20gi%C6%B0%E1%BB%9Dng%2C%20th%E1%BB%ABa%20k%E1%BA%BF%20t%C6%B0%E1%BB%9Bc%20phong%20hay%20th%E1%BB%ABa%3C%2Fp%3E%0A%0A%09%09%09%3Cp%3E%26nbsp%3B%20k%E1%BA%BF%20%26nbsp%3Bs%E1%BB%B1%20%26nbsp%3Bnghi%E1%BB%87p%2C%20c%26aacute%3Bc%20%26nbsp%3Bv%E1%BB%A5%20%26nbsp%3Bl%26agrave%3Bm%20%26nbsp%3Bcho%20%26nbsp%3Bkhuy%E1%BA%BFt%20%26nbsp%3Bth%E1%BB%A7ng%20%26nbsp%3Bnh%C6%B0%20%C4%91%26agrave%3Bo%20m%C6%B0%C6%A1ng%2C%20m%26oacute%3Bc%20%26nbsp%3Bgi%E1%BA%BFng%2C%20x%E1%BA%A3%20%26nbsp%3Bn%C6%B0%E1%BB%9Bc.%3C%2Fp%3E%0A%09%09%09%3C%2Ftd%3E%0A%09%09%3C%2Ftr%3E%0A%09%3C%2Ftbody%3E%0A%3C%2Ftable%3E%0A"}],
        NHI_THAP_BAT_TU:[],
        CAN_NGU_HANH:[{"stt":"1","can":"Giáp","ngu_hanh":"Mộc"},{"stt":"2","can":"Ất","ngu_hanh":"Mộc"},{"stt":"3","can":"Bính","ngu_hanh":"Hỏa"},{"stt":"4","can":"Đinh","ngu_hanh":"Hỏa"},{"stt":"5","can":"Mậu","ngu_hanh":"Thổ"},{"stt":"6","can":"Kỷ","ngu_hanh":"Thổ"},{"stt":"7","can":"Canh","ngu_hanh":"Kim"},{"stt":"8","can":"Tân","ngu_hanh":"Kim"},{"stt":"9","can":"Nhâm","ngu_hanh":"Thủy"},{"stt":"10","can":"Quý","ngu_hanh":"Thủy"}],
        CHI_NGU_HANH:[{"stt":"11","chi":"Tý","ngu_hanh":"Thủy"},{"stt":"12","chi":"Sửu","ngu_hanh":"Thổ"},{"stt":"1","chi":"Dần","ngu_hanh":"Mộc"},{"stt":"2","chi":"Mão","ngu_hanh":"Mộc"},{"stt":"3","chi":"Thìn","ngu_hanh":"Thổ"},{"stt":"4","chi":"Tỵ","ngu_hanh":"Hỏa"},{"stt":"5","chi":"Ngọ","ngu_hanh":"Hỏa"},{"stt":"6","chi":"Mùi","ngu_hanh":"Thổ"},{"stt":"7","chi":"Thân","ngu_hanh":"Kim"},{"stt":"8","chi":"Dậu","ngu_hanh":"Kim"},{"stt":"9","chi":"Tuất","ngu_hanh":"Thổ"},{"stt":"10","chi":"Hợi","ngu_hanh":"Thủy"}],
        TUONG_QUAN_AM_DUONG:[{"can_chi1":"Can","tuong_quan":"Sinh","can_chi2":"Chi","noi_dung":"Bảo Nhật Đại Kiết"},{"can_chi1":"Chi","tuong_quan":"Sinh","can_chi2":"Can","noi_dung":"Thoa Nhật Tiểu Kiết"},{"can_chi1":"Can","tuong_quan":"Đồng Hành","can_chi2":"Chi","noi_dung":"Bát Chuyên Đồng Khí"},{"can_chi1":"Can","tuong_quan":"Khắc","can_chi2":"Chi","noi_dung":"Chế Nhật Tiểu Hung"},{"can_chi1":"Chi","tuong_quan":"Khắc","can_chi2":"Can","noi_dung":"Phạt Nhật Đại Hung"}],
        NGU_HANH_SINH_KHAC:[{"ngu_hanh":"KIM","tuong_sinh":"THỦY","tuong_khac":"MỘC"},{"ngu_hanh":"THỦY","tuong_sinh":"MỘC","tuong_khac":"HỎA"},{"ngu_hanh":"MỘC","tuong_sinh":"HỎA","tuong_khac":"THỔ"},{"ngu_hanh":"HỎA","tuong_sinh":"THỔ","tuong_khac":"KIM"},{"ngu_hanh":"THỔ","tuong_sinh":"KIM","tuong_khac":"THỦY"}],
        CUU_TINH:[],
        DONG_CONG_SOAN_TRACH:[],
        NGUYEN_BINH_KHIEM:[],
        TIET_KHI_24:[],
        KHONG_MINH:[],
        TAM_SAT_VI:[],
        NUOC_LON_NUOC_RONG:[],
        NGAY_DAN_GIAN:[{"ngay_am_lich":"1,15","quan_niem":"Sóc Vọng"},{"ngay_am_lich":"2,16","quan_niem":"Vong Linh"},{"ngay_am_lich":"3,7,13,18,22,27","quan_niem":"Tam Nương"}],
        LUC_NHAM:[],
        isNhuan:false,
        theoamlich:false,
        ngay_al:false,
        thang_al:false,
        nam_al:false,
        bang_van_hanh:'',
        gio_al:{},
        gio_ht:dateFormat(new Date(),"HH:MM"),
        nhuan:false,
        dayOfWeek:false,
        cham_ngon:{},
        nap_am_ngay:{},
        thap_nhi_truc:{},
        kiet_hung_nhat:{},
        dai_tieu_nguyet:false,
        sao_theo_ngay:{},
        ngay_am_duong:false,
        tiet_khi:[],
        nam_cuu_tinh:{},
        thang_cuu_tinh:{},
        ngay_cuu_tinh:{},
        gio_cuu_tinh:{},
        ngay_luc_nham:{},
        ngay_xuat_hanh:{},
        ngay_dau_thang:false,
        dan_gian:{},
        cac_sao_tot:[],
        cac_sao_tot_tk:[],
        cac_sao_xau:[],
        cac_sao_xau_tk:[],
        sao_theo_gio:[],
        gio_luc_nham:[],
        gio_nuoc:[],
        gio_hoang_dao:[],
        gio_khong_vong:[],
        gio_kv:{},
        tuoi_xung_khac_ngay:[],
        tuoi_xung_khac_thang:[],
        huong_kiet_hung:{},
        dong_cong_ly_giai:{},
        trang_trinh_ly_giai:[],
        tam_sat_nhut:false,
        tam_sat_nien:false,
        tam_sat_nguyet:false,
        tam_sat_thoi:false,
        TK19:new Array(
          0x30baa3, 0x56ab50, 0x422ba0, 0x2cab61, 0x52a370, 0x3c51e8, 0x60d160, 0x4ae4b0, 0x376926, 0x58daa0,
          0x445b50, 0x3116d2, 0x562ae0, 0x3ea2e0, 0x28e2d2, 0x4ec950, 0x38d556, 0x5cb520, 0x46b690, 0x325da4,
          0x5855d0, 0x4225d0, 0x2ca5b3, 0x52a2b0, 0x3da8b7, 0x60a950, 0x4ab4a0, 0x35b2a5, 0x5aad50, 0x4455b0,
          0x302b74, 0x562570, 0x4052f9, 0x6452b0, 0x4e6950, 0x386d56, 0x5e5aa0, 0x46ab50, 0x3256d4, 0x584ae0,
          0x42a570, 0x2d4553, 0x50d2a0, 0x3be8a7, 0x60d550, 0x4a5aa0, 0x34ada5, 0x5a95d0, 0x464ae0, 0x2eaab4,
          0x54a4d0, 0x3ed2b8, 0x64b290, 0x4cb550, 0x385757, 0x5e2da0, 0x4895d0, 0x324d75, 0x5849b0, 0x42a4b0,
          0x2da4b3, 0x506a90, 0x3aad98, 0x606b50, 0x4c2b60, 0x359365, 0x5a9370, 0x464970, 0x306964, 0x52e4a0,
          0x3cea6a, 0x62da90, 0x4e5ad0, 0x392ad6, 0x5e2ae0, 0x4892e0, 0x32cad5, 0x56c950, 0x40d4a0, 0x2bd4a3,
          0x50b690, 0x3a57a7, 0x6055b0, 0x4c25d0, 0x3695b5, 0x5a92b0, 0x44a950, 0x2ed954, 0x54b4a0, 0x3cb550,
          0x286b52, 0x4e55b0, 0x3a2776, 0x5e2570, 0x4852b0, 0x32aaa5, 0x56e950, 0x406aa0, 0x2abaa3, 0x50ab50
        ),
        TK20:new Array(
          0x3c4bd8, 0x624ae0, 0x4ca570, 0x3854d5, 0x5cd260, 0x44d950, 0x315554, 0x5656a0, 0x409ad0, 0x2a55d2,
          0x504ae0, 0x3aa5b6, 0x60a4d0, 0x48d250, 0x33d255, 0x58b540, 0x42d6a0, 0x2cada2, 0x5295b0, 0x3f4977,
          0x644970, 0x4ca4b0, 0x36b4b5, 0x5c6a50, 0x466d50, 0x312b54, 0x562b60, 0x409570, 0x2c52f2, 0x504970,
          0x3a6566, 0x5ed4a0, 0x48ea50, 0x336a95, 0x585ad0, 0x442b60, 0x2f86e3, 0x5292e0, 0x3dc8d7, 0x62c950,
          0x4cd4a0, 0x35d8a6, 0x5ab550, 0x4656a0, 0x31a5b4, 0x5625d0, 0x4092d0, 0x2ad2b2, 0x50a950, 0x38b557,
          0x5e6ca0, 0x48b550, 0x355355, 0x584da0, 0x42a5b0, 0x2f4573, 0x5452b0, 0x3ca9a8, 0x60e950, 0x4c6aa0,
          0x36aea6, 0x5aab50, 0x464b60, 0x30aae4, 0x56a570, 0x405260, 0x28f263, 0x4ed940, 0x38db47, 0x5cd6a0,
          0x4896d0, 0x344dd5, 0x5a4ad0, 0x42a4d0, 0x2cd4b4, 0x52b250, 0x3cd558, 0x60b540, 0x4ab5a0, 0x3755a6,
          0x5c95b0, 0x4649b0, 0x30a974, 0x56a4b0, 0x40aa50, 0x29aa52, 0x4e6d20, 0x39ad47, 0x5eab60, 0x489370,
          0x344af5, 0x5a4970, 0x4464b0, 0x2c74a3, 0x50ea50, 0x3d6a58, 0x6256a0, 0x4aaad0, 0x3696d5, 0x5c92e0
        ),
        TK21:new Array(
          0x46c960, 0x2ed954, 0x54d4a0, 0x3eda50, 0x2a7552, 0x4e56a0, 0x38a7a7, 0x5ea5d0, 0x4a92b0, 0x32aab5,
          0x58a950, 0x42b4a0, 0x2cbaa4, 0x50ad50, 0x3c55d9, 0x624ba0, 0x4ca5b0, 0x375176, 0x5c5270, 0x466930,
          0x307934, 0x546aa0, 0x3ead50, 0x2a5b52, 0x504b60, 0x38a6e6, 0x5ea4e0, 0x48d260, 0x32ea65, 0x56d520,
          0x40daa0, 0x2d56a3, 0x5256d0, 0x3c4afb, 0x6249d0, 0x4ca4d0, 0x37d0b6, 0x5ab250, 0x44b520, 0x2edd25,
          0x54b5a0, 0x3e55d0, 0x2a55b2, 0x5049b0, 0x3aa577, 0x5ea4b0, 0x48aa50, 0x33b255, 0x586d20, 0x40ad60,
          0x2d4b63, 0x525370, 0x3e49e8, 0x60c970, 0x4c54b0, 0x3768a6, 0x5ada50, 0x445aa0, 0x2fa6a4, 0x54aad0,
          0x4052e0, 0x28d2e3, 0x4ec950, 0x38d557, 0x5ed4a0, 0x46d950, 0x325d55, 0x5856a0, 0x42a6d0, 0x2c55d4,
          0x5252b0, 0x3ca9b8, 0x62a930, 0x4ab490, 0x34b6a6, 0x5aad50, 0x4655a0, 0x2eab64, 0x54a570, 0x4052b0,
          0x2ab173, 0x4e6930, 0x386b37, 0x5e6aa0, 0x48ad50, 0x332ad5, 0x582b60, 0x42a570, 0x2e52e4, 0x50d160,
          0x3ae958, 0x60d520, 0x4ada90, 0x355aa6, 0x5a56d0, 0x462ae0, 0x30a9d4, 0x54a2d0, 0x3ed150, 0x28e952
        ),
        TK22:new Array(
            0x4eb520, 0x38d727, 0x5eada0, 0x4a55b0, 0x362db5, 0x5a45b0, 0x44a2b0, 0x2eb2b4, 0x54a950, 0x3cb559,
            0x626b20, 0x4cad50, 0x385766, 0x5c5370, 0x484570, 0x326574, 0x5852b0, 0x406950, 0x2a7953, 0x505aa0,
            0x3baaa7, 0x5ea6d0, 0x4a4ae0, 0x35a2e5, 0x5aa550, 0x42d2a0, 0x2de2a4, 0x52d550, 0x3e5abb, 0x6256a0,
            0x4c96d0, 0x3949b6, 0x5e4ab0, 0x46a8d0, 0x30d4b5, 0x56b290, 0x40b550, 0x2a6d52, 0x504da0, 0x3b9567,
            0x609570, 0x4a49b0, 0x34a975, 0x5a64b0, 0x446a90, 0x2cba94, 0x526b50, 0x3e2b60, 0x28ab61, 0x4c9570,
            0x384ae6, 0x5cd160, 0x46e4a0, 0x2eed25, 0x54da90, 0x405b50, 0x2c36d3, 0x502ae0, 0x3a93d7, 0x6092d0,
            0x4ac950, 0x32d556, 0x58b4a0, 0x42b690, 0x2e5d94, 0x5255b0, 0x3e25fa, 0x6425b0, 0x4e92b0, 0x36aab6,
            0x5c6950, 0x4674a0, 0x31b2a5, 0x54ad50, 0x4055a0, 0x2aab73, 0x522570, 0x3a5377, 0x6052b0, 0x4a6950,
            0x346d56, 0x585aa0, 0x42ab50, 0x2e56d4, 0x544ae0, 0x3ca570, 0x2864d2, 0x4cd260, 0x36eaa6, 0x5ad550,
            0x465aa0, 0x30ada5, 0x5695d0, 0x404ad0, 0x2aa9b3, 0x50a4d0, 0x3ad2b7, 0x5eb250, 0x48b540, 0x33d556
        ),
        CAN : new Array("Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"),
        CHI : new Array("Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi" ),
        // Năm Mậu Quý khởi tháng, ngày Giáp Kỷ khởi giờ
        can12 : new Array( "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất" ),
        // Năm Giáp Kỷ khởi tháng, ngày Ất Canh khởi giờ
        can24 : new Array( "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh" ),
        // Năm Ất Canh khởi tháng, ngày Bính Tân khởi giờ
        can36 : new Array( "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ" ),
        // Năm Bính Tân khởi tháng, ngày Đinh Nhâm khởi giờ
        can48 : new Array( "Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân" ),
        // Năm Đinh Nhâm khởi tháng, ngày Mậu Quý khởi giờ
        can64 : new Array( "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý" ),
        TIETKHI:["Lập xuân", "Vũ thủy", "Kinh trập", "Xuân phân", "Thanh minh", "Cốc vũ", "Lập hạ", "Tiểu mãn", "Mang chủng", "Hạ chí", "Tiểu thử", "Đại thử", "Lập thu", "Xử thử", "Bạch lộ", "Thu phân", "Hàn lộ", "Sương giáng", "Lập đông", "Tiểu tuyết", "Đại tuyết", "Đông chí", "Tiểu hàn", "Đại hàn"],
        TRUC:[],
        DANH_NGON:[],
        TUAN:new Array("Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"),
        THANG:new Array("Giêng", "Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy", "Tám", "Chín", "Mười", "Mười Một", "Chạp"),
        GIO_HD:new Array("110100101100", "001101001011", "110011010010", "101100110100", "001011001101", "010010110011"),
        NGAY_HOANG_HAC:[],
        CAT_HUNG_THAN:[],
        PI:Math.PI,
        isLoading:true
      };
    },
    created:function(){
      var seft=this;
      // window.start_time = Date.now();
      seft.Data_Max=20;
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_danhngon",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.DANH_NGON=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_dongcong",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.DONG_CONG_SOAN_TRACH=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_tamsat",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.TAM_SAT_VI=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_khongminh",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.KHONG_MINH=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_thapnhitruc",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.TRUC=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_nguyenbinhkhiem",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.NGUYEN_BINH_KHIEM=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_cuutinh",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.CUU_TINH=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_gionuoclon",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.NUOC_LON_NUOC_RONG=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_kiethungtinhthoi",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.KIET_HUNG_THOI=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_cathungthan",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.CAT_HUNG_THAN=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_giokhongvong",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.GIO_KHONG_VONG=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_saotot",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.SAO_TOT=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_saoxau",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.SAO_XAU=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_lucnham",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.LUC_NHAM=msg.rows;
        seft.Data_Count++;
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_nhithapbattu",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.NHI_THAP_BAT_TU=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_tuluulinhban",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.TU_LUU_LINH_BAN=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_tietkhi",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.TIET_KHI_24=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_lucthapgiapty",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.LucThapGiapTy=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_hoanghac",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.NGAY_HOANG_HAC=msg.rows;
        seft.checkDataDone();
      });
      seft.csm_obj_tables({app_id:seft.app_id,obj_name:"vpts_lucthaphoagiap",e_where:{"field": "id","type": "like","value": ""}},function(msg){
        seft.lucthaphoagiap=msg.rows;
        seft.checkDataDone();
      });
    },
    methods:{
      /* Create lunar date object, stores (lunar) date, month, year, leap month indicator, and Julian date number */
      LunarDate:function(dd, mm, yy, leap, jd) {
        return {day:dd,month:mm,year:yy,leap:leap,jd:jd};
      },
      findLunarDate:function(jd, ly) {
        var seft=this;
        var FIRST_DAY = seft.jdFromDate(25, 1, 1800); // Tet am lich 1800
        var LAST_DAY = seft.jdFromDate(31, 12, 2199);
        if (jd > LAST_DAY || jd < FIRST_DAY || ly[0].jd > jd) {
          return seft.LunarDate(0, 0, 0, 0, jd);
        }
        var i = ly.length-1;
        while (jd < ly[i].jd) {
          i--;
        }
        var off = jd - ly[i].jd;
        ret = seft.LunarDate(ly[i].day+off, ly[i].month, ly[i].year, ly[i].leap, jd);
        return ret;
      },
      decodeLunarYear:function(yy, k) {
        var seft=this;
        var monthLengths, regularMonths, offsetOfTet, leapMonth, leapMonthLength, solarNY, currentJD, j, mm;
        var ly = new Array();
        monthLengths = new Array(29, 30);
        regularMonths = new Array(12);
        offsetOfTet = k >> 17;
        leapMonth = k & 0xf;
        leapMonthLength = monthLengths[k >> 16 & 0x1];
        solarNY = seft.jdFromDate(1, 1, yy);
        currentJD = solarNY+offsetOfTet;
        j = k >> 4;
        for(i = 0; i < 12; i++) {
          regularMonths[12 - i - 1] = monthLengths[j & 0x1];
          j >>= 1;
        }
        if (leapMonth == 0) {
          for(mm = 1; mm <= 12; mm++) {
            ly.push(seft.LunarDate(1, mm, yy, 0, currentJD));
            currentJD += regularMonths[mm-1];
          }
        } else {
          for(mm = 1; mm <= leapMonth; mm++) {
            ly.push(seft.LunarDate(1, mm, yy, 0, currentJD));
            currentJD += regularMonths[mm-1];
          }
          ly.push(seft.LunarDate(1, leapMonth, yy, 1, currentJD));
          currentJD += leapMonthLength;
          for(mm = leapMonth+1; mm <= 12; mm++) {
            ly.push(seft.LunarDate(1, mm, yy, 0, currentJD));
            currentJD += regularMonths[mm-1];
          }
        }
        return ly;
      },
      getYearInfo:function(yyyy) {
        var seft=this;
        var yearCode;
        if (yyyy < 1900) {
          yearCode = seft.TK19[yyyy - 1800];
        } else if (yyyy < 2000) {
          yearCode = seft.TK20[yyyy - 1900];
        } else if (yyyy < 2100) {
          yearCode = seft.TK21[yyyy - 2000];
        } else {
          yearCode = seft.TK22[yyyy - 2100];
        }
        return seft.decodeLunarYear(yyyy, yearCode);
      },
      getMonth:function(mm, yy) {
        var seft=this;
        var ly1, ly2, tet1, jd1, jd2, mm1, yy1, result, i;
        if (mm < 12) {
          mm1 = mm + 1;
          yy1 = yy;
        } else {
          mm1 = 1;
          yy1 = yy + 1;
        }
        jd1 = seft.jdFromDate(1, mm, yy);
        jd2 = seft.jdFromDate(1, mm1, yy1);
        ly1 = seft.getYearInfo(yy);
        //alert('1/'+mm+'/'+yy+' = '+jd1+'; 1/'+mm1+'/'+yy1+' = '+jd2);
        tet1 = ly1[0].jd;
        result = new Array();
        if (tet1 <= jd1) { /* tet(yy) = tet1 < jd1 < jd2 <= 1.1.(yy+1) < tet(yy+1) */
          for (i = jd1; i < jd2; i++) {
            result.push(seft.findLunarDate(i, ly1));
          }
        } else if (jd1 < tet1 && jd2 < tet1) { /* tet(yy-1) < jd1 < jd2 < tet1 = tet(yy) */
          ly1 = seft.getYearInfo(yy - 1);
          for (i = jd1; i < jd2; i++) {
            result.push(seft.findLunarDate(i, ly1));
          }
        } else if (jd1 < tet1 && tet1 <= jd2) { /* tet(yy-1) < jd1 < tet1 <= jd2 < tet(yy+1) */
          ly2 = seft.getYearInfo(yy - 1);
          for (i = jd1; i < tet1; i++) {
            result.push(seft.findLunarDate(i, ly2));
          }
          for (i = tet1; i < jd2; i++) {
            result.push(seft.findLunarDate(i, ly1));
          }
        }
        return result;
      },
      printMonth:function(mm, yy) {
        var seft=this;
        var res = "";
        res += seft.printTable(mm, yy);
        seft.SDTemplate=res;
        setTimeout(function(){
          seft.cai_ngay(seft.today);
        },100);
      },
      printTable:function(mm, yy) {
        var seft=this;
        var i, j, k, solar, lunar, cellClass, solarClass, lunarClass;
        var currentMonth = seft.getMonth(mm, yy);
        if (currentMonth.length == 0) return;
        var ld1 = currentMonth[0];
        var emptyCells = (ld1.jd + 1) % 7;
        var MonthHead = mm + "/" + yy;
        var LunarHead = seft.getYearCanChi(ld1.year);
        var res = "<div class='lichamduong text-center'>";
        var TemplateChonNgay=`<table class="text-center" width="100%" style="margin:0 auto;border: none;">
          <tbody>
          <tr>
            <td>
              <b>Dương Lịch</b>
            </td>
            <td style="width:4%;"></td>
            <td>
              <b>Âm Lịch</b>
            </td>
          </tr>
          <tr>
            <td style="width:48%;">
              <div>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="28" id="chondd" name="dd">
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="09" id="chonmm" name="mm">
                <input type="number" style="width:45%;text-align:center;border: 1px solid black;" value="2023" id="chonyy" name="yy">
              </div>
              <div style="margin-bottom: 5px;margin-top: 5px;display: flex;justify-content: space-between;">
                <label>Giờ</label>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="10" id="chonhh" min="0" max="23" name="hh">
                <label>Phút</label>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="56" id="chonphut" min="0" max="59" name="mm">
              </div>
              <div style="margin-top:1px;">
                <input type="button" id="btnxemngayduong" style="padding:0px;width:100%;" value="Xem">
              </div>
            </td>
            <td style="width:4%;"></td>
            <td style="width:48%;">
              <div>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="14" id="chondda" name="dda">
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="08" id="chonmma" name="mma">
                <input type="number" style="width:45%;text-align:center;border: 1px solid black;" value="2023" id="chonyya" name="yya">
              </div>
              <div style="margin-bottom: 5px;margin-top: 5px;display: flex;justify-content: space-between;">
                <label>Giờ</label>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="10" id="chonhha" min="0" max="23" name="hh">
                <label>Phút</label>
                <input type="number" style="width:25%;text-align:center;border: 1px solid black;" value="56" id="chonphuta" min="0" max="59" name="mm">
              </div>
              <div style="margin-top:1px;">
                <input type="button" id="btnxemngayam" style="padding:0px;width:100%;" value="Xem">
              </div>
            </td>
          </tr>
          </tbody>
        </table>`;
        res += TemplateChonNgay;
        res += ('<table class="thang mt-2" border="2" cellpadding="1" cellspacing="1" width="100%">\n');
        res += seft.printHead(mm, yy);
        for (i = 0; i < 6; i++) {
          res += ("<tr>\n");
          for (j = 0; j < 7; j++) {
            k = 7 * i + j;
            if (k < emptyCells || k >= emptyCells + currentMonth.length) {
              res += seft.printEmptyCell();
            } else {
              solar = k - emptyCells + 1;
              ld1 = currentMonth[k - emptyCells];
              res += seft.printCell(ld1, solar, mm, yy);
            }
          }
          res += ("</tr>\n");
        }
        res += ('</table>\n');
        res += ('<div><button id="donglich" class="btn text-red">- Đóng Lại -</button></div></div>\n');
        return res;
      },
      getPrevMonthLink:function(mm, yy) {
        var mm1 = mm > 1 ? mm-1 : 12;
        var yy1 = mm > 1 ? yy : yy-1;
        //return '<a href="'+window.location.pathname+'?yy='+yy1+'&mm='+mm1+'"><img src="left1.gif" width=8 height=12 alt="PrevMonth" border=0></a>';
        return '<button id="PrevMonth" mm="'+mm1+'" yy="'+yy1+'" class="btn p-0">&lt;</button>';//'<a href="'+window.location.pathname+'?yy='+yy1+'&mm='+mm1+'">&lt;</a>';
      },
      getNextMonthLink:function(mm, yy) {
        var mm1 = mm < 12 ? mm+1 : 1;
        var yy1 = mm < 12 ? yy : yy+1;
        //return '<a href="'+window.location.pathname+'?yy='+yy1+'&mm='+mm1+'"><img src="right1.gif" width=8 height=12 alt="NextMonth" border=0></a>';
        return  '<button id="NextMonth" mm="'+mm1+'" yy="'+yy1+'" class="btn p-0">&gt;</button>';//'<a href="'+window.location.pathname+'?yy='+yy1+'&mm='+mm1+'">&gt;</a>';
      },
      getPrevYearLink:function(mm, yy) {
        //return '<a href="'+window.location.pathname+'?yy='+(yy-1)+'&mm='+mm+'"><img src="left2.gif" width=16 height=12 alt="PrevYear" border=0></a>';
        return  '<button id="PrevYear" mm="'+mm+'" yy="'+(yy-1)+'" class="btn p-0">&lt;&lt;</button>';//'<a href="'+window.location.pathname+'?yy='+(yy-1)+'&mm='+mm+'">&lt;&lt;</a>';
      },
      getNextYearLink:function(mm, yy) {
        //return '<a href="'+window.location.pathname+'?yy='+(yy+1)+'&mm='+mm+'"><img src="right2.gif" width=16 height=12 alt="NextYear" border=0></a>';
        return  '<button id="NextYear" mm="'+mm+'" yy="'+(yy+1)+'" class="btn p-0">&gt;&gt;</button>';//'<a href="'+window.location.pathname+'?yy='+(yy+1)+'&mm='+mm+'">&gt;&gt;</a>';
      },
      printHead:function(mm, yy) {
        var seft=this;
        var res = "";
        var monthName = mm+"/"+yy;
        res += ('<tr><td colspan="2" class="navi-l">'+seft.getPrevYearLink(mm, yy)+' &nbsp;'+seft.getPrevMonthLink(mm, yy)+'</td>\n');
        //res += ('<td colspan="1" class="navig"><a href="'+getPrevMonthLink(mm, yy)+'"><img src="left1.gif" alt="Prev"></a></td>\n');
        res += ('<td colspan="3" class="tenthang">'+monthName+'</td>\n');
        //res += ('<td colspan="1" class="navi-r"><a href="'+getNextMonthLink(mm, yy)+'"><img src="right1.gif" alt="Next"></a></td>\n');
        res += ('<td colspan="2" class="navi-r">'+seft.getNextMonthLink(mm, yy)+' &nbsp;'+seft.getNextYearLink(mm, yy)+'</td></tr>\n');
        //res += ('<tr><td colspan="7" class="tenthang"><a href="'+getNextMonthLink(mm, yy)+'"><img src="right.gif" alt="Next"></a></td></tr>\n');
        res += ('<tr>\n');
        for(var i=0;i<=6;i++) {
          res += ('<td class=ngaytuan>'+seft.DAYNAMES[i]+'</td>\n');
        }
        res += ('<\/tr>\n');
        return res;
      },
      printEmptyCell:function() {
          return '<td class=ngaythang><div class=cn>&nbsp;</div> <div class=am>&nbsp;</div></td>\n';
      },
      printCell:function(lunarDate, solarDate, solarMonth, solarYear) {
        var seft=this;
        var link='/xem-ngay-'+solarDate.toString().padStart(2,'0')+'-'+solarMonth.toString().padStart(2,'0')+'-'+solarYear+'.shtml'
        var today=chuyenNgay(seft.today,"dd/mm/yyyy");
        var cellClass, solarClass, lunarClass, solarColor;
        cellClass = "ngaythang";
        solarClass = "t2t6";
        lunarClass = "am";
        solarColor = "black";
        var dow = (lunarDate.jd + 1) % 7;
        if (dow == 0) {
          solarClass = "cn";
          solarColor = "red";
        } else if (dow == 6) {
          solarClass = "t7";
          solarColor = "green";
        }
        if (solarDate == today.getDate() && solarMonth == today.getMonth()+1 && solarYear == today.getFullYear()) {
          cellClass = "homnay";
        }
        if (lunarDate.day == 1 && lunarDate.month == 1) {
          cellClass = "tet";
        }
        if (lunarDate.leap == 1) {
          lunarClass = "am2";
        }
        var lunar = lunarDate.day;
        if (solarDate == 1 || lunar == 1) {
          lunar = lunarDate.day + "/" + lunarDate.month;
        }
        var res = "";
        var args = lunarDate.day + "," + lunarDate.month + "," + lunarDate.year + "," + lunarDate.leap;
        args += ("," + lunarDate.jd + "," + solarDate + "," + solarMonth + "," + solarYear);
        res += ('<td class="'+cellClass+'"');
        if (lunarDate != null) res += (' data-al="'+lunarDate.day+'/'+lunarDate.month+'/'+lunarDate.year+'" title="'+seft.getDayName(lunarDate)+'"');
        res += ('> <a href="'+link+'"><div style="color:'+solarColor+';text-align: center;" class="'+solarClass+'">'+solarDate+'</div><div class="'+lunarClass+'">'+lunar+'</div></a></td>\n');
        return res;
      },
      getDayName:function(lunarDate) {
        var seft=this;
        if (lunarDate.day == 0) {
          return "";
        }
        var cc = seft.getCanChi(lunarDate);
        var s = "Ng\u00E0y " + cc[0] +", th\341ng "+cc[1] + ", n\u0103m " + cc[2];
        return s;
      },
      checkDataDone:function(){
        var seft=this;
        seft.Data_Count++;
        if(seft.Data_Count===seft.Data_Max)
        {
          seft.isLoading=false;
          var KT_Ngay=location.href.match(/\d{2}([\/.-])\d{2}\1\d{4}/g);
          if(KT_Ngay)
            if(KT_Ngay.length===1)
            {
              if(location.href.indexOf('/al/')!==-1 || location.href.indexOf('/nl/')!==-1)
              {
                seft.today_am=KT_Ngay[0].replace(new RegExp('-','g'),'/');
                var ngayxem=chuyenNgay(seft.today_am,"dd/mm/yyyy");
                var nhuan=false;
                if(location.href.indexOf('/nl/')!==-1)
                  nhuan=true;
                var ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), nhuan?1:0, 7);
                seft.today=ngayDL[0]+"/"+ngayDL[1]+"/"+ngayDL[2];
              }
              else
                seft.today=KT_Ngay[0].replace(new RegExp('-','g'),'/');
            }
          // var end_time = Date.now();
          // console.log(`Execution time: ${end_time - start_time} ms`);
          // start_time = Date.now();
          setTimeout(seft.TinhNgayDangChon,200);
          // var end_time = Date.now();
          // console.log(`Execution time Xem Ngay: ${end_time - start_time} ms`);
        }
      },
      BoDauTiengViet:function(str,spaceR,specRPL) {
        str=str.toLowerCase().replace(/ /g,spaceR);
        // remove accents
        var from = "àáãảạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđùúủũụưừứửữựòóỏõọôồốổỗộơờớởỡợìíỉĩịäëïîöüûñçýỳỹỵỷ",
            to   = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeduuuuuuuuuuuoooooooooooooooooiiiiiaeiiouuncyyyyy";
        for (var i=0, l=from.length ; i < l ; i++) {
          str = str.replace(RegExp(from[i], "gi"), to[i]);
        }
        str = str.toLowerCase()
              .trim()
              .replace(/[^a-z0-9\-]/g, specRPL)
              .replace(/-+/g,specRPL);
        return str;
      },
      htmlDecode:function(input) {
        // return decodeURIComponent(unescape(input));
        var doc = new DOMParser().parseFromString(decodeURIComponent(input), "text/html");
        return doc.documentElement.textContent;
      },
      print_xemngay:function(){
        seft=this;
        document.querySelector('#ngay_duong_lich').setAttribute("value",seft.today);
        document.querySelector('#ngay_am_lich').setAttribute("value",seft.today_am);
        const { jsPDF } = window.jspdf;
        var margin=[0.15,0.2,0.05,0.05];//top, left, buttom, right,
        var px2pt=0.75,pt2in=0.015;
        var w = document.querySelector('#dvxemngaytotxau').clientWidth+document.querySelector('#dvxemngaytotxau').clientWidth*0.3;
        var h = document.querySelector('#dvxemngaytotxau').clientHeight+document.querySelector('#dvxemngaytotxau').clientHeight*0.5;
        var opt = {
          margin:margin,//top, left, buttom, right,
          // 8.3 x 11.7
          html2canvas: {dpi: 192, scale: 2, letterRendering: true, width: w*px2pt, height: h*px2pt},
          pageBreak: { mode: 'css', before:'#nextpage1'},
          jsPDF:{ unit: 'in', format:'a4', orientation: 'landscape',compress: true}
        };
        html2pdf().set(opt).from(document.querySelector('#dvxemngaytotxau').innerHTML).outputPdf('dataurlnewwindow').then(function(onFulfilled, onRejected){
          console.log(onFulfilled)
        });
      },
      changeView:function(name){
        seft=this;
        if(name==='print_template' && seft.print_name!=='In Ấn')
          seft.print_name='In Ấn';
        else if(name!=='print_template')
          seft.print_name='Bản In';
        else
          seft.print_xemngay();
        document.body.setAttribute("class","")
        $(document.body).addClass(name);
      },
      xemngay:function(bien){
        var seft=this;
        var ngayxem="";
        if(bien===0)
          seft.today=dateFormat(new Date(),"dd/mm/yyyy");
        if(seft.theoamlich)
        {
          var AL=chuyenNgay(CongNgay(seft.today,bien,"dd/mm/yyyy"),"dd/mm/yyyy");
          var ngayALn=seft.am_qua_duong(AL.getDate(), AL.getMonth()+1, AL.getFullYear(), 1, 7);
          var ngayAL=seft.am_qua_duong(AL.getDate(), AL.getMonth()+1, AL.getFullYear(), 0, 7);
          if(ngayAL.length===3)
          {
            if(ngayALn.length===3)
            {
              if(seft.nhuan&&ngayALn[0]!==0 && ngayALn[1]!==0 && ngayALn[2]!==0)
                ngayAL=ngayALn;
              else
                 seft.nhuan=false; 
            }
            else 
              seft.nhuan=false;  
            if(ngayAL[0]!==0 && ngayAL[1]!==0 && ngayAL[2]!==0)
              ngayxem=ngayAL[0]+"/"+ngayAL[1]+"/"+ngayAL[2];
          }
        }
        else
          ngayxem=CongNgay(seft.today,bien,"dd/mm/yyyy");
        seft.today=ngayxem;
        ngayxem=chuyenNgay(ngayxem,"dd/mm/yyyy");
        // console.log(seft.theoamlich,seft.today,ngayxem)
        //Lay ngay am lich
        var currentLunarDate = seft.duong_qua_am(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear(),7);
        // console.log(currentLunarDate);
        var currentDate =ngayxem.getDate();
        var currentMonth=ngayxem.getMonth()+1;
        var currentYear =ngayxem.getFullYear();
        var nhuan=currentLunarDate.leap;
        var jd=seft.jdFromDate(currentYear,currentMonth,currentYear);
        seft.theoamlich=false;
        seft.xem_ngay(seft.today);
        
        // seft.dlich.option("value",chuyenNgay(seft.today,"dd/mm/yyyy"));
        // seft.alertDayInfo(currentLunarDate.day, currentLunarDate.month, currentLunarDate.year,nhuan,jd,currentDate,currentMonth,currentYear);
        
      },
      getWidgetLichNgay:function(bien) {
        this.today= CongGio(this.today,bien*24,"dd/mm/yyyy HH:MM");
        var ngayxem=chuyenNgay(this.today,"dd/mm/yyyy HH:MM");
        //Lay ngay am lich
        var currentLunarDate = this.duong_qua_am(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear(),7);
        // console.log(currentLunarDate.leap);
        var currentDate =ngayxem.getDate();
        var currentMonth=ngayxem.getMonth()+1;
        var currentYear =ngayxem.getFullYear();
        var nhuan=currentLunarDate.leap;
        var jd=this.jdFromDate(currentYear,currentMonth,currentYear);
        this.alertDayInfo(currentLunarDate.day, currentLunarDate.month, currentLunarDate.year,nhuan,jd,currentDate,currentMonth,currentYear);
      },
        //== Trở về can Giáp nếu CanVi là 0
      ThienCan:function(num)
      {
        return (this.CAN[num%10]);
      },
      // Lấy can giờ, nhập vào can ngày và giờ (0-11)
      ThoiCan:function(NhatCan, gio)
      {
        if (gio >= 12) gio -= 12;
        if ((NhatCan.charAt(0) == 'G') || (NhatCan.charAt(0) == 'K'))
          return this.can12[gio];
        else if ((NhatCan.charAt(0) == 'Ấ') || (NhatCan.charAt(0) == 'C'))
          return this.can24[gio];
        else if ((NhatCan.charAt(0) == 'B') || (NhatCan.charAt(0) == 'T'))
          return this.can36[gio];
        else if ((NhatCan.charAt(0) == 'Đ') || (NhatCan.charAt(0) == 'N'))
          return this.can48[gio];
        else if ((NhatCan.charAt(0) == 'M') || (NhatCan.charAt(0) == 'Q'))
          return this.can64[gio];
      },
      /* Discard the fractional part of a number, e.g., INT(3.2) = 3 */
      INT:function(d) {
        return Math.floor(d);
      },
      /* Compute the (integral) Julian day number of day dd/mm/yyyy, i.e., the number 
       * of days between 1/1/4713 BC (Julian calendar) and dd/mm/yyyy. 
       * Formula from http://www.tondering.dk/claus/calendar.html
       */
      jdFromDate:function(dd, mm, yy) {
        var a, y, m, jd;
        a = this.INT((14 - mm) / 12);
        y = yy+4800-a;
        m = mm+12*a-3;
        jd = dd + this.INT((153*m+2)/5) + 365*y + this.INT(y/4) - this.INT(y/100) + this.INT(y/400) - 32045;
        if (jd < 2299161) {
          jd = dd + this.INT((153*m+2)/5) + 365*y + this.INT(y/4) - 32083;
        }
        return jd;
      },
      /* Convert a Julian day number to day/month/year. Parameter jd is an integer */
      jdToDate:function(jd) {
        var a, b, c, d, e, m, day, month, year;
        if (jd > 2299160) { // After 5/10/1582, Gregorian calendar
          a = jd + 32044;
          b = this.INT((4*a+3)/146097);
          c = a - this.INT((b*146097)/4);
        } else {
          b = 0;
          c = jd + 32082;
        }
        d = this.INT((4*c+3)/1461);
        e = c - this.INT((1461*d)/4);
        m = this.INT((5*e+2)/153);
        day = e - this.INT((153*m+2)/5) + 1;
        month = m + 3 - 12*this.INT(m/10);
        year = b*100 + d - 4800 + this.INT(m/10);
        return new Array(day, month, year);
      },
      /* Compute the time of the k-th new moon after the new moon of 1/1/1900 13:52 UCT 
       * (measured as the number of days since 1/1/4713 BC noon UCT, e.g., 2451545.125 is 1/1/2000 15:00 UTC).
       * Returns a floating number, e.g., 2415079.9758617813 for k=2 or 2414961.935157746 for k=-2
       * Algorithm from: "Astronomical Algorithms" by Jean Meeus, 1998
       */
      NewMoon:function(k) {
        var T, T2, T3, dr, Jd1, M, Mpr, F, C1, deltat, JdNew;
        T = k/1236.85; // Time in Julian centuries from 1900 January 0.5
        T2 = T * T;
        T3 = T2 * T;
        dr = this.PI/180;
        Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
        Jd1 = Jd1 + 0.00033*Math.sin((166.56 + 132.87*T - 0.009173*T2)*dr); // Mean new moon
        M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3; // Sun's mean anomaly
        Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3; // Moon's mean anomaly
        F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3; // Moon's argument of latitude
        C1=(0.1734 - 0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
        C1 = C1 - 0.4068*Math.sin(Mpr*dr) + 0.0161*Math.sin(dr*2*Mpr);
        C1 = C1 - 0.0004*Math.sin(dr*3*Mpr);
        C1 = C1 + 0.0104*Math.sin(dr*2*F) - 0.0051*Math.sin(dr*(M+Mpr));
        C1 = C1 - 0.0074*Math.sin(dr*(M-Mpr)) + 0.0004*Math.sin(dr*(2*F+M));
        C1 = C1 - 0.0004*Math.sin(dr*(2*F-M)) - 0.0006*Math.sin(dr*(2*F+Mpr));
        C1 = C1 + 0.0010*Math.sin(dr*(2*F-Mpr)) + 0.0005*Math.sin(dr*(2*Mpr+M));
        if (T < -11) {
          deltat= 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3;
        } else {
          deltat= -0.000278 + 0.000265*T + 0.000262*T2;
        };
        JdNew = Jd1 + C1 - deltat;
        return JdNew;
      },
      KinhDoMatTroi:function(jdn) 
      {
        var T, T2, dr, M, L0, DL, L;
        T = (jdn - 2451544.5 ) / 36525; // Time in Julian centuries from 2000-01-01 12:00:00 GMT
        T2 = T*T;
        dr = this.PI/180; // degree to radian
        M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2; // mean anomaly, degree
        L0 = 280.46645 + 36000.76983*T + 0.0003032*T2; // mean longitude, degree
        DL = (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M);
        DL = DL + (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
        L = L0 + DL; // true longitude, degree
        L = L - 0.00569 - 0.00478 * Math.sin(125.04 - 1934.136*T);
        var ts=this.INT(L/360);
        L = L - 360*ts; // Normalize to (0, 2*PI)
        return this.INT(L)-1;
      },
      /* Compute the longitude of the sun at any time. 
       * Parameter: floating number jdn, the number of days since 1/1/4713 BC noon
       * Algorithm from: "Astronomical Algorithms" by Jean Meeus, 1998
       */
      SunLongitude:function(jdn) {
        var T, T2, dr, M, L0, DL, L;
        T = (jdn - 2451545.0 ) / 36525; // Time in Julian centuries from 2000-01-01 12:00:00 GMT
        T2 = T*T;
        dr = this.PI/180; // degree to radian
        M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2; // mean anomaly, degree
        L0 = 280.46645 + 36000.76983*T + 0.0003032*T2; // mean longitude, degree
        DL = (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M);
        DL = DL + (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
        L = L0 + DL; // true longitude, degree
        L = L*dr;
        L = L - this.PI*2*(this.INT(L/(this.PI*2))); // Normalize to (0, 2*PI)
        return L;
      },
      /* Compute sun position at midnight of the day with the given Julian day number. 
       * The time zone if the time difference between local time and UTC: 7.0 for UTC+7:00.
       * The function returns a number between 0 and 11. 
       * From the day after March equinox and the 1st major term after March equinox, 0 is returned. 
       * After that, return 1, 2, 3 ... 
       */
      getSunLongitude:function(dayNumber, timeZone) {
        return this.INT(this.SunLongitude(dayNumber - 0.5 - timeZone/24)/this.PI*6);
      },
      /* Compute the day of the k-th new moon in the given time zone.
       * The time zone if the time difference between local time and UTC: 7.0 for UTC+7:00
       */
      getNewMoonDay:function(k, timeZone) {
        return this.INT(this.NewMoon(k) + 0.5 + timeZone/24);
      },
      /* Find the day that starts the luner month 11 of the given year for the given time zone */
      getLunarMonth11:function(yy, timeZone) {
        var k, off, nm, sunLong;
        //off = jdFromDate(31, 12, yy) - 2415021.076998695;
        off = this.jdFromDate(31, 12, yy) - 2415021;
        k = this.INT(off / 29.530588853);
        nm = this.getNewMoonDay(k, timeZone);
        sunLong = this.getSunLongitude(nm, timeZone); // sun longitude at local midnight
        if (sunLong >= 9) {
          nm = this.getNewMoonDay(k-1, timeZone);
        }
        return nm;
      },
      /* Find the index of the leap month after the month starting on the day a11. */
      getLeapMonthOffset:function(a11, timeZone) {
        var k, last, arc, i;
        k = this.INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
        last = 0;
        i = 1; // We start with the month following lunar month 11
        arc = this.getSunLongitude(this.getNewMoonDay(k+i, timeZone), timeZone);
        do {
          last = arc;
          i++;
          arc = this.getSunLongitude(this.getNewMoonDay(k+i, timeZone), timeZone);
        } while (arc != last && i < 14);
        return i-1;
      },
      /* Convert solar date dd/mm/yyyy to the corresponding lunar date */
      duong_qua_am:function(dd, mm, yy, timeZone) {
        var k, dayNumber, monthStart, a11, b11, lunarDay, lunarMonth;
        var lunarYear, lunarLeap, diff, leapMonthDiff;
        dayNumber = this.jdFromDate(dd, mm, yy);
        k = this.INT((dayNumber - 2415021.076998695) / 29.530588853);
        monthStart = this.getNewMoonDay(k+1, timeZone);
        if (monthStart > dayNumber) {
          monthStart = this.getNewMoonDay(k, timeZone);
        }
        //alert(dayNumber+" -> "+monthStart);
        a11 = this.getLunarMonth11(yy, timeZone);
        b11 = a11;
        if (a11 >= monthStart) {
          lunarYear = yy;
          a11 = this.getLunarMonth11(yy-1, timeZone);
        } else {
          lunarYear = yy+1;
          b11 = this.getLunarMonth11(yy+1, timeZone);
        }
        lunarDay = dayNumber-monthStart+1;
        diff = this.INT((monthStart - a11)/29);
        lunarLeap = 0;
        lunarMonth = diff+11;
        if (b11 - a11 > 365) {
          leapMonthDiff = this.getLeapMonthOffset(a11, timeZone);
          if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff == leapMonthDiff) {
              lunarLeap = 1;
            }
          }
        }
        if (lunarMonth > 12) {
          lunarMonth = lunarMonth - 12;
        }
        if (lunarMonth >= 11 && diff < 4) {
          lunarYear -= 1;
        }
        return {day:lunarDay, month:lunarMonth,year:lunarYear,leap:lunarLeap};
      },
      /* Convert a lunar date to the corresponding solar date */
      am_qua_duong:function(lunarDay, lunarMonth, lunarYear, lunarLeap, timeZone) {
        var k, a11, b11, off, leapOff, leapMonth, monthStart;
        if (lunarMonth < 11) {
          a11 = this.getLunarMonth11(lunarYear-1, timeZone);
          b11 = this.getLunarMonth11(lunarYear, timeZone);
        } else {
          a11 = this.getLunarMonth11(lunarYear, timeZone);
          b11 = this.getLunarMonth11(lunarYear+1, timeZone);
        }
        k = this.INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
        off = lunarMonth - 11;
        if (off < 0) {
          off += 12;
        }
        if (b11 - a11 > 365) {
          leapOff = this.getLeapMonthOffset(a11, timeZone);
          leapMonth = leapOff - 2;
          if (leapMonth < 0) {
            leapMonth += 12;
          }
          if (lunarLeap != 0 && lunarMonth != leapMonth) {
            return new Array(0, 0, 0);
          } else if (lunarLeap != 0 || off >= leapOff) {
            off += 1;
          }
        }
        monthStart = this.getNewMoonDay(k+off, timeZone);
        return this.jdToDate(monthStart+lunarDay-1);
      },
      getYearCanChi:function(year) {
        return this.CAN[(year+6) % 10] + " " + this.CHI[(year+8) % 12];
      },
      /*
       * Can cua gio Chinh Ty (00:00) cua ngay voi JDN nay
       */
      getCanHour0:function(jdn) {
        return this.CAN[(jdn-1)*2 % 10];
      },
      getCanChi:function(lunar) {
        var dayName, monthName, yearName;
        dayName = this.CAN[(lunar.jd + 9) % 10] + " " + this.CHI[(lunar.jd+1)%12];
        monthName = this.CAN[(lunar.year*12+lunar.month+3) % 10] + " " + this.CHI[(lunar.month+1)%12];
        if (lunar.leap == 1) {
          monthName += " (nhu\u1EADn)";
        }
        yearName = this.getYearCanChi(lunar.year);
        return new Array(dayName, monthName, yearName);
      },
      getGioHoangDao:function(jd) {
        var chiOfDay = (jd+1) % 12;
        var gioHD = this.GIO_HD[chiOfDay % 6]; // same values for Ty' (1) and Ngo. (6), for Suu and Mui etc.
        var ret = "";
        var count = 0;
        for (var i = 0; i < 12; i++) {
          if (gioHD.charAt(i) == '1') {
            ret += this.CHI[i];
            ret += ' ('+(i*2+23)%24+'-'+(i*2+1)%24+')';
            if (count++ < 5) ret += ', ';
            if (count == 3) ret += '\n';
          }
        }
        return ret;
      },
      getSunLongitude2:function(n) {
        var h, t, i, g, a;
        return t = (h = (n - 2451545.5 - 7 / 24) / 36525) * h, i = this.PI / 180, g = 357.5291 + 35999.0503 * h - 1559e-7 * t - 48e-8 * h * t, a = 280.46645 + 36000.76983 * h + 3032e-7 * t + ((1.9146 - .004817 * h - 14e-6 * t) * Math.sin(i * g) + (.019993 - 101e-6 * h) * Math.sin(2 * i * g) + 29e-5 * Math.sin(3 * i * g)), Math.floor(a) % 360
      },
      TinhTietKhi:function(n) {
        var h = new Date(n),
            t = h.getDate(),
            i = h.getMonth() + 1,
            g = h.getFullYear();
        if (2 == i && 5 <= t && t < 19) Index = 0;
        else if (2 == i && 19 <= t || 3 == i && t < 6) Index = 1;
        else if (3 == i && 7 <= t && t < 21) Index = 2;
        else if (3 == i && 22 <= t || 4 == i && t < 5) Index = 3;
        else if (4 == i && 6 <= t && t < 20) Index = 4;
        else if (4 == i && 21 <= t || 5 == i && t < 6) Index = 5;
        else if (5 == i && 7 <= t && t < 21) Index = 6;
        else if (5 == i && 22 <= t || 6 == i && t < 5) Index = 7;
        else if (6 == i && 7 <= t && t < 21) Index = 8;
        else if (6 == i && 22 <= t || 7 == i && t < 7) Index = 9;
        else if (7 == i && 8 <= t && t < 23) Index = 10;
        else if (7 == i && 24 <= t || 8 == i && t < 8) Index = 11;
        else if (8 == i && 9 <= t && t < 23) Index = 12;
        else if (8 == i && 24 <= t || 9 == i && t < 8) Index = 13;
        else if (9 == i && 9 <= t && t < 23) Index = 14;
        else if (9 == i && 24 <= t || 10 == i && t < 8) Index = 15;
        else if (10 == i && 9 <= t && t < 23) Index = 16;
        else if (10 == i && 24 <= t || 11 == i && t < 8) Index = 17;
        else if (11 == i && 9 <= t && t < 22) Index = 18;
        else if (11 == i && 23 <= t || 12 == i && t < 7) Index = 19;
        else if (12 == i && 8 <= t && t < 22) Index = 20;
        else if (12 == i && 23 <= t || 1 == i && t < 6) Index = 21;
        else if (1 == i && 7 <= t && t < 20) Index = 22;
        else if (1 == i && 21 <= t || 2 == i && t < 4) Index = 23;
        else {
            var a = this.getSunLongitude2(this.jdFromDate(t + 1, i, g));
            Index = Math.floor(a / 15), Index = (Index + 3) % 24
        }
        return new Array(this.TIETKHI[Index], Index)
      },
      substring_index:function( input, delimiter, index ) {
        var arr = input.split( delimiter );
        if( index < 0 ){
           index = arr.length + index;
           arr.splice( 0, index );
        }else{
           arr.splice( index, arr.length - index );
        }
        return arr.join( delimiter );
      },
      templateRPL:function(tpl, data) {
        var re = /\$\(([^\)]+)?\)/g, match;
        while(match = re.exec(tpl)) {
          tpl = tpl.replace(match[0], data[match[1]])
          re.lastIndex = 0;
        }
        return tpl;
      },
      loadToolTip:function(){
        document.querySelectorAll(".note").forEach(function(el){
          $(document).mouseup(function (e) {
            var container = $('.note');
            if (!container.is(e.target) // if the target of the click isn't the container...
                && container.has(e.target).length === 0) // ... nor a descendant of the container
            {
                document.querySelectorAll('[o-click="true"]').forEach(function(elR){
                  elR.setAttribute("o-click", false);
                });
                document.querySelectorAll('.hidden > .dx-overlay-wrapper').forEach(function(elR) {
                  elR.remove();
                });
            }
          });
          var tmpl=decodeURIComponent(el.querySelector(".hidden").getAttribute("tooltip"));
          if(el.querySelector(".hidden") && tmpl!=="")
          {
            el.addEventListener('click', function(e) {
              el.setAttribute("o-click", true)
            });
            $(el.querySelector(".hidden")).dxTooltip({
              target: el,
              position: "bottom", // or "top"
              showEvent: 'mouseenter dxclick',
              hideOnParentScroll:false,
              // animation: false,
              wrapperAttr:{class:!tmpl.startsWith('<table')?"change-bg":""},
              hideEvent: 'mouseleave',
              onShowing:function(e){
                
              },
              onHiding: function (e) {
                // Handler of the "hiding" event
                // console.log(e);
                if(el.getAttribute("o-click")==="true")
                  e.cancel=true;
              },
              maxWidth:"inherit",
              // hideOnOutsideClick: true,
              contentTemplate(data) {
                if(!tmpl.startsWith('<table') && el.getAttribute("class").indexOf('o_table')===-1)
                  if(el.getAttribute("t_header"))
                    tmpl='<table style="background: #FCFFCA;"><tr><td style="text-transform:uppercase;background:#FFC000;"><b>'+el.getAttribute("t_header")+'</b></td></tr><tr><td style="border: none !important;">'+tmpl+'</td></tr></table>';
                  else 
                    tmpl='<table style="background: #FCFFCA;"><tr><td style="border: none !important;">'+tmpl+'</td></tr></table>';
                data.html(tmpl);
              },
            });
          }
        });
      },
      cai_ngay:function(ngay_chon){
        var seft=this;
        var ngayxem=chuyenNgay(ngay_chon,"dd/mm/yyyy");
        var NgayAL = seft.duong_qua_am(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear(),7);
        if(document.querySelector("#chondda"))
        {
          document.querySelector("#chondda").value=NgayAL.day.toString().padStart(2, '0');
          document.querySelector("#chonmma").value=NgayAL.month.toString().padStart(2, '0');
          document.querySelector("#chonyya").value=NgayAL.year;
          document.querySelector("#chondd").value=ngayxem.getDate().toString().padStart(2, '0');
          document.querySelector("#chonmm").value=(ngayxem.getMonth()+1).toString().padStart(2, '0');
          document.querySelector("#chonyy").value=ngayxem.getFullYear();
          if(seft.gio_ht)
          {
            var gioHT=seft.gio_ht.split(":");
            if(gioHT.length>0)
            {
              document.querySelector("#chonhh").value=gioHT[0].padStart(2,'0');
              document.querySelector("#chonphut").value=gioHT[1].padStart(2,'0');
              document.querySelector("#chonhha").value=gioHT[0].padStart(2,'0');
              document.querySelector("#chonphuta").value=gioHT[1].padStart(2,'0');
            }
          }
        }
      },
      xem_ngay:function(ngay_chon){
        var seft=this;
        seft.theoamlich=false;
        var ngayxem=chuyenNgay(ngay_chon,"dd/mm/yyyy");
        seft.today=dateFormat(ngayxem,"dd/mm/yyyy");
        var NgayAL = seft.duong_qua_am(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear(),7);
        seft.today_am=dateFormat(chuyenNgay(NgayAL.day+"/"+NgayAL.month+"/"+NgayAL.year,"dd/mm/yyyy"),"dd/mm/yyyy");
        var jd=seft.jdFromDate(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear());
        var cc = seft.getCanChi(Object.assign(NgayAL,{jd:jd}));
        var lgNgay=seft.LucThapGiapTy.find(c=>cc[0].toLowerCase().indexOf(c.can_chi.toLowerCase())!==-1);
        var lgThang=seft.LucThapGiapTy.find(c=>cc[1].toLowerCase().indexOf(c.can_chi.toLowerCase())!==-1);
        var lgNam=seft.LucThapGiapTy.find(c=>cc[2].toLowerCase().indexOf(c.can_chi.toLowerCase())!==-1);
        var iHour=(new Date).getHours();
        seft.printMonth(ngayxem.getMonth()+1,ngayxem.getFullYear());
        if(seft.gio_ht)
        {
          var gioHT=seft.gio_ht.split(":");
          if(gioHT.length>0)
            iHour=1*gioHT[0];
        }
        var gio = 0;
        switch(iHour)
        {
          case 0: case 23:
            gio = 1;
            break;
          default:
            iHour += 1;
            gio = parseInt(iHour / 2) + 1;
            break;
        }
        var gio_can_chi=seft.ThoiCan(seft.ThienCan(jd + 9) , gio-1) + " " + seft.CHI[gio-1];
        var strdlGio="";
        var arrGioNgay=[];
        for (var g = 0; g < 12; g++) {
          var tGio=false;
          if(gio_can_chi.toLowerCase()===(seft.ThoiCan(seft.ThienCan(jd + 9) ,g) + " " + seft.CHI[g]).toLowerCase())
            tGio=true;
          strdlGio += '<tr '+(tGio?'style="background:#F9FB80;"':'')+'><td>'+((g*2+23)%24).toString().padStart(2, '0')+':00:00 - '+(((g*2+1)%24)-1).toString().padStart(2, '0')+':59:59</td>';
          strdlGio += '<td class="text-bold">'+seft.ThoiCan(seft.ThienCan(jd + 9) ,g) + " " + seft.CHI[g]+"</td></tr>";
          arrGioNgay.push({can_chi_gio:seft.ThoiCan(seft.ThienCan(jd + 9) ,g) + " " + seft.CHI[g],chi_gio:seft.CHI[g],khung_gio:((g*2+23)%24).toString().padStart(2, '0')+':00:00 - '+(((g*2+1)%24)-1).toString().padStart(2, '0')+':59:59',gio_hoang_dao:'',gio_hac_dao:''});
        }
        var lgGio=seft.LucThapGiapTy.find(c=>c.can_chi.toLowerCase()===gio_can_chi.toLowerCase());
        var dayOfWeek = seft.TUAN[(jd + 1) % 7];
        seft.dayOfWeek=dayOfWeek;
        seft.cham_ngon=seft.DANH_NGON[Math.floor(Math.random()*seft.DANH_NGON.length)];
        var tplGio=`<table border="1" style="width:300px !important;min-width:300px !important;text-align:center;" id="banggiohientai">
            <tbody><tr><td colspan="2" style="text-transform:uppercase;background:#FFC000;"><b>CAN CHI GIỜ THEO NGÀY</b></td></tr>$(dlGio)</tbody>
        </table>`;
        var tplLucThapHG=`<table border="1" style="width:350px !important;min-width:350px !important;text-align:center;" id="banggiohientai">
            <tbody>
              <tr><td colspan="2" style="text-transform:uppercase;background:#FFC000;"><b>Biểu Đồ Lục Thập Giáp Tý Phối Quẻ</b></td></tr>
              <tr><td colspan="2" style="text-transform:capitalize;"><b>$(ngu_hanh)</b></td></tr>
              <tr><td colspan="2" style="text-transform:capitalize;"><b>$(nap_am) - $(can_chi) - $(que_dich64)</b></td></tr>
              <tr><td colspan="2" style="text-transform:capitalize;"><b>$(que_van)</b></td></tr>
            </tbody>
        </table>`;
        seft.bang_van_hanh=`<div class="annodithoi" style="display: block;"><p><b>HÀNH VÀ VẬN CỦA GIỜ THEO NGÀY</b></p><img style="max-width: 600px;" src="app_images/web/bangvanhanh.png"></div>`;
        // qv_note
        // console.log(lgGio);
        var tq_napam=seft.lucthaphoagiap.find(c=>cc[0].toLowerCase().indexOf(c.can_chi.toLowerCase())!==-1);
        if(tq_napam)
          seft.nap_am_ngay=tq_napam;
        seft.gio_al=Object.assign(lgGio,{qv_note:seft.templateRPL(tplLucThapHG,Object.assign(lgGio,{nap_am:seft.nap_am_ngay.ngu_hanh})),note:seft.templateRPL(tplGio,{dlGio:strdlGio}),can:lgGio.can_chi.split(" ")[0],chi:lgGio.can_chi.split(" ")[1]});
        var ngay_al=Object.assign(lgNgay,{qv_note:seft.templateRPL(tplLucThapHG,Object.assign(lgNgay,{nap_am:seft.nap_am_ngay.ngu_hanh})),can:lgNgay.can_chi.split(" ")[0],chi:lgNgay.can_chi.split(" ")[1],note:""});
        var timCanNH=seft.CAN_NGU_HANH.find(c=>c.can.toLowerCase()===ngay_al.can.toLowerCase());
        if(timCanNH)
          ngay_al=Object.assign(ngay_al,{ngu_hanh_can:timCanNH.ngu_hanh});
        var timChiNH=seft.CHI_NGU_HANH.find(c=>c.chi.toLowerCase()===ngay_al.chi.toLowerCase());
        if(timChiNH)
          ngay_al=Object.assign(ngay_al,{ngu_hanh_chi:timChiNH.ngu_hanh});
        seft.ngay_al=ngay_al;
        seft.thang_al=Object.assign(lgThang,{qv_note:seft.templateRPL(tplLucThapHG,Object.assign(lgThang,{nap_am:seft.nap_am_ngay.ngu_hanh})),can:lgThang.can_chi.split(" ")[0],chi:lgThang.can_chi.split(" ")[1]});
        seft.nam_al=Object.assign(lgNam,{qv_note:seft.templateRPL(tplLucThapHG,Object.assign(lgNam,{nap_am:seft.nap_am_ngay.ngu_hanh})),can:lgNam.can_chi.split(" ")[0],chi:lgNam.can_chi.split(" ")[1]});
        
        // console.log(seft.lucthaphoagiap,tq_napam);
        /************ Tính Kiết Hung Nhật ******************/
        // var dkThang="";
        // if(seft.NGAY_HOANG_HAC.length>0)
        // {
        //   var kNHD=Object.keys(seft.NGAY_HOANG_HAC[0]);
        //   dkThang=kNHD.find(k=>(k+"_").indexOf("_t"+NgayAL.month+"_")!==-1);
        // }
        // console.log(seft.ngay_al.chi,dkThang);
        /************ Tính Nhị Thập Tứ Khí ******************/
        // seft.tiet_khi=seft.TIETKHI[tinh_truc[2]];
        /************ Lấy tiết khí ******************/
        seft.tiet_khi=[];
        var kinh_do_mat_troi=seft.KinhDoMatTroi(jd);
        var Tim_TietK=seft.TIET_KHI_24.find(c=>1*c.kinh_do_mat_troi.substring(0,c.kinh_do_mat_troi.length-1)===kinh_do_mat_troi);
        var thang_tk=false,thang_khi="",thang_tiet="",tiet_chinh="";
        if(Tim_TietK)
        {
          tiet_chinh=Tim_TietK.tiet;
          thang_tk=Tim_TietK.thang_al;
          Tim_TietK.y_nghia=decodeURIComponent(Tim_TietK.y_nghia).replace(new RegExp('<p style="text-align: center;font-weight:bold;">','g'),'<div style="text-align:center;font-weight:bold;">').replace(new RegExp('<p style="text-align: center;">','g'),'<div style="text-align:center">').replace(new RegExp('<p style="text-align:center">','g'),'<div style="text-align:center">').replace(new RegExp('</p>','g'),'</div>');
          // thang_khi=Tim_TietK.tiet;
          seft.tiet_khi.push(Tim_TietK);
        }
        else
        {
          var TIET_KHI_24_tang=JSON.parse(JSON.stringify(seft.TIET_KHI_24)).sort((a, b) => 1*a.kinh_do_mat_troi.substring(0,a.kinh_do_mat_troi.length-1) - 1*b.kinh_do_mat_troi.substring(0,b.kinh_do_mat_troi.length-1));
          var TIET_KHI_24_giam=JSON.parse(JSON.stringify(seft.TIET_KHI_24)).sort((a, b) => 1*b.kinh_do_mat_troi.substring(0,b.kinh_do_mat_troi.length-1) - 1*a.kinh_do_mat_troi.substring(0,a.kinh_do_mat_troi.length-1));
          var Tim_TietT=TIET_KHI_24_giam.find(c=>1*c.kinh_do_mat_troi.substring(0,c.kinh_do_mat_troi.length-1)<kinh_do_mat_troi);
          var Tim_TietG=TIET_KHI_24_tang.find(c=>1*c.kinh_do_mat_troi.substring(0,c.kinh_do_mat_troi.length-1)>kinh_do_mat_troi);
          if(Tim_TietT)
          {
            if(kinh_do_mat_troi-1*Tim_TietT.kinh_do_mat_troi.substring(0,Tim_TietT.kinh_do_mat_troi.length-1)<=15)
              tiet_chinh=Tim_TietT.tiet;
            thang_tk=Tim_TietT.thang_al;
            Tim_TietT.y_nghia=decodeURIComponent(Tim_TietT.y_nghia).replace(new RegExp('<p style="text-align: center;font-weight:bold;">','g'),'<div style="text-align:center;font-weight:bold;">').replace(new RegExp('<p style="text-align: center;">','g'),'<div style="text-align:center">').replace(new RegExp('<p style="text-align:center">','g'),'<div style="text-align:center">').replace(new RegExp('</p>','g'),'</div>');
            // thang_khi=Tim_TietT.tiet;
            seft.tiet_khi.push(Tim_TietT);
          }
          if(Tim_TietG && !thang_tk)
            thang_tk=Tim_TietG.thang_al;
          if(Tim_TietG)
          {
            if(1*Tim_TietG.kinh_do_mat_troi.substring(0,Tim_TietG.kinh_do_mat_troi.length-1)-kinh_do_mat_troi<=15 && !thang_tk)
              tiet_chinh=Tim_TietG.tiet;
            Tim_TietG.y_nghia=decodeURIComponent(Tim_TietG.y_nghia).replace(new RegExp('<p style="text-align: center;font-weight:bold;">','g'),'<div style="text-align:center;font-weight:bold;">').replace(new RegExp('<p style="text-align: center;">','g'),'<div style="text-align:center">').replace(new RegExp('<p style="text-align:center">','g'),'<div style="text-align:center">').replace(new RegExp('</p>','g'),'</div>');
            // thang_tiet=Tim_TietG.tiet;
            seft.tiet_khi.push(Tim_TietG);
          }
          // console.log(tiet_chinh,kinh_do_mat_troi-1*Tim_TietT.kinhdomattroi.substring(0,Tim_TietT.kinhdomattroi.length-1),1*Tim_TietG.kinhdomattroi.substring(0,Tim_TietG.kinhdomattroi.length-1)-kinh_do_mat_troi)
        }
        /************ Tính Ngày Đầu Tháng ******************/
        var ngaylapk=seft.am_qua_duong(1, NgayAL.month, NgayAL.year, seft.nhuan?1:0, 7); 
        var jdDT=seft.jdFromDate(ngaylapk[0],ngaylapk[1],ngaylapk[2]);
        seft.ngay_dau_thang=seft.CAN[(jdDT+9)%10]+" "+seft.CHI[(jdDT+1)%12];
        /************ Tính KIẾT TINH ******************/
        var cac_sao_tot=seft.SAO_TOT.filter(s=>s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.can_chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()!==seft.substring_index(s["ta"+NgayAL.month].toLowerCase(),seft.ngay_al.can.toLowerCase(),-1)||s["ta"+NgayAL.month].toLowerCase()!==seft.substring_index(s["ta"+NgayAL.month].toLowerCase(),seft.ngay_al.chi.toLowerCase(),-1));
        cac_sao_tot.forEach(function(sao){
          var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(sao.ten_sao.toLowerCase(),"","_"))!==-1);
          if(tDG)
          {
            sao["tinh_chat"]=tDG.dien_giai;
            if(tDG.tinh_chat>=2)
              sao["to_dam"]=tDG.tinh_chat;
          }
        });
        seft.cac_sao_tot=cac_sao_tot;
        var cac_sao_tot_tk=seft.SAO_TOT.filter(s=>s["ta"+thang_tk].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()===seft.ngay_al.can_chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()!==seft.substring_index(s["ta"+thang_tk].toLowerCase(),seft.ngay_al.can.toLowerCase(),-1)||s["ta"+thang_tk].toLowerCase()!==seft.substring_index(s["ta"+thang_tk].toLowerCase(),seft.ngay_al.chi.toLowerCase(),-1));
        cac_sao_tot_tk.forEach(function(sao){
          var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(sao.ten_sao.toLowerCase(),"","_"))!==-1);
          if(tDG)
          {
            sao["tinh_chat"]=tDG.dien_giai;
            if(tDG.tinh_chat>=2)
              sao["to_dam"]=tDG.tinh_chat;
          }
        });
        seft.cac_sao_tot_tk=cac_sao_tot_tk;
        /**** Tính Xong KIẾT TINH ****/	
        /************ Tính HUNG TINH ******************/
        var cac_sao_xau=seft.SAO_XAU.filter(s=>s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.can_chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+NgayAL.month].toLowerCase()!==seft.substring_index(s["ta"+NgayAL.month].toLowerCase(),seft.ngay_al.can.toLowerCase(),-1)||s["ta"+NgayAL.month].toLowerCase()!==seft.substring_index(s["ta"+NgayAL.month].toLowerCase(),seft.ngay_al.chi.toLowerCase(),-1));
        cac_sao_xau.forEach(function(sao){
          var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(sao.ten_sao.toLowerCase(),"","_"))!==-1);
          if(tDG)
          {
            sao["tinh_chat"]=tDG.dien_giai;
            if(tDG.tinh_chat>=2)
              sao["to_dam"]=tDG.tinh_chat;
          }
        });
        seft.cac_sao_xau=cac_sao_xau;
        var cac_sao_xau_tk=seft.SAO_XAU.filter(s=>s["ta"+thang_tk].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()===seft.ngay_al.can_chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()===seft.ngay_al.chi.toLowerCase()||s["ta"+thang_tk].toLowerCase()!==seft.substring_index(s["ta"+thang_tk].toLowerCase(),seft.ngay_al.can.toLowerCase(),-1)||s["ta"+thang_tk].toLowerCase()!==seft.substring_index(s["ta"+thang_tk].toLowerCase(),seft.ngay_al.chi.toLowerCase(),-1));
        cac_sao_xau_tk.forEach(function(sao){
          var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(sao.ten_sao.toLowerCase(),"","_"))!==-1);
          if(tDG)
          {
            sao["tinh_chat"]=tDG.dien_giai;
            if(tDG.tinh_chat>=2)
              sao["to_dam"]=tDG.tinh_chat;
          }
        });
        seft.cac_sao_xau_tk=cac_sao_xau_tk;
        /**** Tính Xong HUNG TINH ****/	
        var vtHH=seft.CHI.findIndex(g=>g.toLowerCase()===seft.thang_al.chi.toLowerCase());
        if(vtHH!==-1)
        {
          vtHH=(vtHH+11)%12;
          if(vtHH===0)
            vtHH=12;
          vtHH="t"+vtHH.toString();
          var timNgayHoangHac=seft.NGAY_HOANG_HAC.find(n=>n[vtHH].toLowerCase()===seft.ngay_al.chi.toLowerCase())
          if(timNgayHoangHac)
          {
            var tplGio_kiet_hung_nhat=`<table border="1" style="width:600px !important;min-width:600px !important;text-align:center;">
              <tbody><tr><td colspan="4" style="text-transform:uppercase;background:#FFC000;"><b>$(kiet_hung)</b></td></tr>$(dlGioKH)</tbody>
            </table>`;
            var dlGioKH='<tr style="font-weight: bold;background: darkgrey;"><td>Khung Giờ</td><td>Tên Giờ</td><td class="text-bold">Hoàng Đạo</td><td class="text-bold">Hắc Đạo</td></tr>';
            var vtgHH=seft.CHI.findIndex(g=>g.toLowerCase()===seft.ngay_al.chi.toLowerCase());
            if(vtgHH!==-1)
            {
              vtgHH=(vtgHH+11)%12;
              if(vtgHH===0)
                vtgHH=12;
              vtgHH="t"+vtgHH.toString();
              arrGioNgay.forEach(function(oHH){
                //Tính Giờ Hoàng Hắc Của Ngày
                var timGHoangHac=seft.NGAY_HOANG_HAC.find(n=>n[vtgHH].toLowerCase()===oHH["chi_gio"].toLowerCase())
                if(timGHoangHac)
                {
                  //Trùng ngày với sao thì tốt
                  var tSaoTNg=seft.cac_sao_tot.findIndex(g=>timGHoangHac.trung_sao_tot?g.ten_sao.toLowerCase()===timGHoangHac.trung_sao_tot.toLowerCase():false);
                  if(timGHoangHac.hoang_hac.toLowerCase().indexOf("Hoàng Đạo".toLowerCase())!==-1||tSaoTNg!==-1)
                    dlGioKH+='<tr class="text-red text-bold"><td>'+oHH["khung_gio"]+'</td><td>'+oHH["can_chi_gio"]+'</td><td>'+timGHoangHac.ten+'</td><td></td></tr>';
                  else
                    dlGioKH+='<tr class="text-dark text-bold"><td>'+oHH["khung_gio"]+'</td><td>'+oHH["can_chi_gio"]+'</td><td></td><td>'+timGHoangHac.ten+'</td></tr>';
                }
                else
                  dlGioKH+='<tr><td>'+oHH["khung_gio"]+'</td><td>'+oHH["can_chi_gio"]+'</td><td>'+oHH["gio_hoang_dao"]+'</td><td>'+oHH["gio_hac_dao"]+'</td></tr>';
              });
            }
            //Trùng ngày với sao thì tốt
            var tSaoTN=seft.cac_sao_tot.findIndex(g=>timNgayHoangHac.trung_sao_tot?g.ten_sao.toLowerCase()===timNgayHoangHac.trung_sao_tot.toLowerCase():false);
            if(timNgayHoangHac.hoang_hac.toLowerCase().indexOf("Hoàng Đạo".toLowerCase())!==-1)
              seft.kiet_hung_nhat={text:'<span class="text-red text-bold">'+timNgayHoangHac.ten+'</span>',note:seft.templateRPL(tplGio_kiet_hung_nhat,{kiet_hung:'<span class="text-red text-bold">'+timNgayHoangHac.ten+" "+timNgayHoangHac.hoang_hac.replace(" A","").replace(" B","")+'</span>',dlGioKH:dlGioKH})};
            else if(tSaoTN!==-1)
              seft.kiet_hung_nhat={text:'<span class="text-red text-bold">'+timNgayHoangHac.ten+'</span>',note:seft.templateRPL(tplGio_kiet_hung_nhat,{kiet_hung:'<span class="text-red text-bold">'+timNgayHoangHac.ten+" "+timNgayHoangHac.hoang_hac.replace(" A","").replace(" B","")+' (Tốt do có sao '+timNgayHoangHac.trung_sao_tot+')</span>',dlGioKH:dlGioKH})};
            else
              seft.kiet_hung_nhat={text:timNgayHoangHac.ten.toLowerCase(),note:seft.templateRPL(tplGio_kiet_hung_nhat,{kiet_hung:timNgayHoangHac.ten+" "+timNgayHoangHac.hoang_hac.replace(" A","").replace(" B",""),dlGioKH:dlGioKH})};
          }
        }
        /************ Tính Đại Tiểu Nguyệt ******************/
        var thang_29n=seft.am_qua_duong(29, NgayAL.month, NgayAL.year, seft.nhuan?1:0, 7); 
        var ngay_ke_tiep=chuyenNgay(CongNgay(thang_29n[0]+"/"+thang_29n[1]+"/"+thang_29n[2],1,"dd/mm/yyyy"),"dd/mm/yyyy");
        var kiem_tra_ngay=seft.duong_qua_am(ngay_ke_tiep.getDate(),ngay_ke_tiep.getMonth()+1,ngay_ke_tiep.getFullYear(),7);
        if(kiem_tra_ngay.day===1)
          seft.dai_tieu_nguyet="Tháng Thiếu";
        else if(kiem_tra_ngay.day===30)
          seft.dai_tieu_nguyet="Tháng Đủ";
        /************ Tính Nhị Thập Bát Tú ******************/
        var laysao=seft.NHI_THAP_BAT_TU.find(s=>1*s.stt===((jd%28)+1));
        if(laysao)
          seft.sao_theo_ngay=laysao;
        /************ Tính Ngày Âm Dương ******************/
        var nguhanhcan=seft.CAN_NGU_HANH.find(c=>c.can.toLowerCase()===seft.ngay_al.can.toLowerCase());
        if(nguhanhcan)
          nguhanhcan=nguhanhcan.ngu_hanh;
        var nguhanhchi=seft.CHI_NGU_HANH.find(c=>c.chi.toLowerCase()===seft.ngay_al.chi.toLowerCase());
        if(nguhanhchi)
          nguhanhchi=nguhanhchi.ngu_hanh;
        var tuong_quan=false;
        if(nguhanhchi.trim()===nguhanhcan.trim())
          tuong_quan=seft.TUONG_QUAN_AM_DUONG.find(t=>t.can_chi1.toLowerCase()==='Can'.toLowerCase() && t.tuong_quan.toLowerCase()==='Đồng Hành'.toLowerCase() && t.can_chi2.toLowerCase()==='Chi'.toLowerCase());
        else
        {
          var ngu_hanh=seft.NGU_HANH_SINH_KHAC.find(sk=>sk.ngu_hanh.toLowerCase()===nguhanhcan.toLowerCase() && sk.tuong_sinh.toLowerCase()===nguhanhchi.toLowerCase());
          if(ngu_hanh)
            tuong_quan=seft.TUONG_QUAN_AM_DUONG.find(t=>t.can_chi1.toLowerCase()==='Can'.toLowerCase() && t.tuong_quan.toLowerCase()==='Sinh'.toLowerCase() && t.can_chi2.toLowerCase()==='Chi'.toLowerCase());
          else
          {
            ngu_hanh=seft.NGU_HANH_SINH_KHAC.find(sk=>sk.ngu_hanh.toLowerCase()===nguhanhcan.toLowerCase() && sk.tuong_khac.toLowerCase()===nguhanhchi.toLowerCase());
            if(ngu_hanh)
              tuong_quan=seft.TUONG_QUAN_AM_DUONG.find(t=>t.can_chi1.toLowerCase()==='Can'.toLowerCase() && t.tuong_quan.toLowerCase()==='Khắc'.toLowerCase() && t.can_chi2.toLowerCase()==='Chi'.toLowerCase());
            else
            {
              ngu_hanh=seft.NGU_HANH_SINH_KHAC.find(sk=>sk.ngu_hanh.toLowerCase()===nguhanhchi.toLowerCase() && sk.tuong_sinh.toLowerCase()===nguhanhcan.toLowerCase());
              if(ngu_hanh)
                tuong_quan=seft.TUONG_QUAN_AM_DUONG.find(t=>t.can_chi1.toLowerCase()==='Chi'.toLowerCase() && t.tuong_quan.toLowerCase()==='Sinh'.toLowerCase() && t.can_chi2.toLowerCase()==='Can'.toLowerCase());
              else
              {
                ngu_hanh=seft.NGU_HANH_SINH_KHAC.find(sk=>sk.ngu_hanh.toLowerCase()===nguhanhchi.toLowerCase() && sk.tuong_khac.toLowerCase()===nguhanhcan.toLowerCase());
                if(ngu_hanh)
                  tuong_quan=seft.TUONG_QUAN_AM_DUONG.find(t=>t.can_chi1.toLowerCase()==='Chi'.toLowerCase() && t.tuong_quan.toLowerCase()==='Khắc'.toLowerCase() && t.can_chi2.toLowerCase()==='Can'.toLowerCase());
              }
            }
          }
        }
        // console.log(tuong_quan);
        if(tuong_quan)
          seft.ngay_am_duong=tuong_quan;
        /************ Tính Thập Nhị Trực ******************/
        var tim_thang_tk_truc='t'+thang_tk,tinh_truc='';
        var tim_truc=seft.TRUC.find(ft=>ft[tim_thang_tk_truc].toLowerCase()===seft.ngay_al.chi.toLowerCase());
        if(tim_truc)
        {
          seft.thap_nhi_truc=tim_truc;
          tinh_truc=tim_truc.ten_truc;
        }
        /************ Tính ngày xuất hành Khổng Minh ******************/
        var kmThang="";
        if(seft.KHONG_MINH.length>0)
        {
          var kNHD=Object.keys(seft.KHONG_MINH[0]);
          kmThang=kNHD.find(k=>(k+"_").indexOf("_"+NgayAL.month+"_")!==-1);
        }
        var fNXH=seft.KHONG_MINH.find(km=>(","+km[kmThang]+",").toLowerCase().indexOf(","+NgayAL.day.toString().padStart(2, '0')+",")!==-1);
        if(fNXH)
          seft.ngay_xuat_hanh={text:fNXH.ngay_khong_minh,note:fNXH.y_nghia};
        /************ Tính xong ngày xuất hành Khổng Minh ******************/

        /************ Tính ngày dân gian ******************/
        var qnDG=seft.NGAY_DAN_GIAN.find(c=>(","+c.ngay_am_lich+",").toLowerCase().indexOf(","+NgayAL.day+",")!==-1);
        if(qnDG)
          seft.dan_gian={text:qnDG.quan_niem,note:qnDG.quan_niem};
        else
          seft.dan_gian={text:"Ngày Thường",note:"Ngày Thường"};
        /************ Tính xong ngày dân gian ******************/
        /************ Tính ngày Lục Nhâm ******************/
        var lnThang="";
        var sttLN=seft.LUC_NHAM.find(c=>(","+c.thang_al+",").toLowerCase().indexOf(","+NgayAL.month+",")!==-1);
        var kd=1;
        if(sttLN)
        {
          kd=(NgayAL.day-1+sttLN.stt)%6;
          if(kd==0)
          {
            kd=6;
          }
          sttLN=seft.LUC_NHAM.find(c=>c.stt===kd);
        }
        if(sttLN)
          seft.ngay_luc_nham={text:sttLN.ten_luc_nham,note:decodeURIComponent(sttLN.tho_han)};
        /************ Tính xong ngày Lục Nhâm ******************/
        /************ Tính Tam nguyên cửu vận ******************/
        var templateCuuTinhToolTip=`
          <div class="bgcuutinh">
            <div class="divcuutinh">
                <div class="socuutinh taybac">$(TB)</div>
                <div class="socuutinh bac">$(B)</div>
                <div class="socuutinh dongbac">$(DB)</div>
                <div class="clear"></div>
                <div class="socuutinh tay">$(T)</div>
                <div class="socuutinh trungcung"><b>$(TT)</b></div>
                <div class="socuutinh dong">$(D)</div>
                <div class="clear"></div>
                <div class="socuutinh taynam">$(TN)</div>
                <div class="socuutinh nam">$(N)</div>
                <div class="socuutinh dongnam">$(DN)</div>
            </div>
        </div>
        `;
        var nam=NgayAL.year,so_lan=0,CUU_TINH_VAN1_GIAP_TY=seft.CUU_TINH_VAN1_GIAP_TY,nam_giap_ty=CUU_TINH_VAN1_GIAP_TY+so_lan*180;
        while((CUU_TINH_VAN1_GIAP_TY+so_lan*180)<=nam)
        {
          nam_giap_ty=CUU_TINH_VAN1_GIAP_TY+so_lan*180;
          so_lan++;
        }
        var dem_van_nien=0,van_nien=nam_giap_ty+(dem_van_nien*20);
        while(van_nien<=nam)
        {
            van_nien=nam_giap_ty+(dem_van_nien*20);
            dem_van_nien++;
        }
        dem_van_nien=dem_van_nien-1;
        /**** Tính Năm Cửu Tinh ****/
        var timNien=false;
        if(seft.TU_LUU_LINH_BAN.length>0)
        {
          var kNHD=Object.keys(seft.TU_LUU_LINH_BAN[0]);
          timNien=kNHD.find(k=>("_"+k+"_").indexOf("_"+dem_van_nien+"_")!==-1);
          if(timNien)
          {
            var tra_CT=seft.TU_LUU_LINH_BAN.find(ct=>ct.can.toLowerCase()===seft.nam_al.can.toLowerCase() && ct.chi.toLowerCase()===seft.nam_al.chi.toLowerCase());
            if(tra_CT)
            {
              var du_lieu=tra_CT[timNien].toLowerCase().trim();
              tra_CT=seft.CUU_TINH.find(ct=>1*ct.stt===1*du_lieu);
              if(tra_CT)
                seft.nam_cuu_tinh={note:seft.templateRPL(templateCuuTinhToolTip,{ten_sao:tra_CT.ten_sao,TT:du_lieu,TB:((du_lieu+1)%9===0?9:(du_lieu+1)%9),T:((du_lieu+2)%9===0?9:(du_lieu+2)%9),DB:((du_lieu+3)%9===0?9:(du_lieu+3)%9),N:((du_lieu+4)%9===0?9:(du_lieu+4)%9),B:((du_lieu+5)%9===0?9:(du_lieu+5)%9),TN:((du_lieu+6)%9===0?9:(du_lieu+6)%9),D:((du_lieu+7)%9===0?9:(du_lieu+7)%9),DN:((du_lieu+8)%9===0?9:(du_lieu+8)%9)}),text:tra_CT.ten_sao};
            }
          }
        }
        /**** Tính Xong Năm Cửu Tinh ****/	
        /************ 
          – Thượng Nguyên: bao gồm 3 vận 1, 2, 3.
          – Trung Nguyên: bao gồm 3 vận 4, 5, 6.
          – Hạ Nguyên : bao gồm 3 vận 7, 8, 9.
        ******************/
        // console.log(thang_tk);
        // if(thang_khi!=="")
        //   seft.tiet_khi=thang_khi+(thang_tiet!==""?" - "+thang_tiet:"");
        // console.log(thang_tk);
        // seft.BoDauTiengViet();
        /**** Tính Tháng Cửu Tinh ****/
        // console.log(seft.TU_LUU_LINH_BAN);
        var tra_CT=seft.TU_LUU_LINH_BAN.find(ct=>ct.can.trim().toLowerCase()===seft.nam_al.can.toLowerCase() && ct.chi.trim().toLowerCase()===seft.nam_al.chi.toLowerCase());
        if(tra_CT)
        {
          var du_lieu=tra_CT["nguyet"].toLowerCase().trim().replace("-","").replace("+","");
          // console.log(NgayAL.month,thang_tk,du_lieu)
          var tinh_sao=(1*du_lieu-NgayAL.month)+1;
          if(tinh_sao<=0)
            tinh_sao=9+tinh_sao;
          du_lieu=1*tinh_sao;
          // else if(du_lieu.indexOf("-")!==-1)
          //   du_lieu=1*du_lieu.replace("-","")-(NgayAL.month+1);
          // else if(du_lieu.indexOf("+")!==-1)
          //   du_lieu=1*du_lieu.replace("+","")+(NgayAL.month);
          // if(du_lieu<0)
          //   du_lieu=du_lieu+9;
          // if(du_lieu>9)
          //   du_lieu=du_lieu%9;
          // if(du_lieu===0)
          //     du_lieu=9;
          tra_CT=seft.CUU_TINH.find(ct=>1*ct.stt===1*du_lieu);
          if(tra_CT)
            seft.thang_cuu_tinh={note:seft.templateRPL(templateCuuTinhToolTip,{ten_sao:tra_CT.ten_sao,TT:du_lieu,TB:((du_lieu+1)%9===0?9:(du_lieu+1)%9),T:((du_lieu+2)%9===0?9:(du_lieu+2)%9),DB:((du_lieu+3)%9===0?9:(du_lieu+3)%9),N:((du_lieu+4)%9===0?9:(du_lieu+4)%9),B:((du_lieu+5)%9===0?9:(du_lieu+5)%9),TN:((du_lieu+6)%9===0?9:(du_lieu+6)%9),D:((du_lieu+7)%9===0?9:(du_lieu+7)%9),DN:((du_lieu+8)%9===0?9:(du_lieu+8)%9)}),text:tra_CT.ten_sao};
        }
        /**** Tính Xong Tháng Cửu Tinh ****/	
        /**** Tính Ngày Cửu Tinh ****/
        var tim_truong_tiet=false;
        // console.log(tiet_chinh);
        if(seft.TU_LUU_LINH_BAN.length>0)
        {
          var kNHD=Object.keys(seft.TU_LUU_LINH_BAN[0]);
          tim_truong_tiet=kNHD.find(k=>("_"+k+"_").indexOf("_"+seft.BoDauTiengViet(tiet_chinh,"","_")+"_")!==-1);
          // console.log(tim_truong_tiet,tiet_chinh,thang_tk)
          if(tim_truong_tiet)
          {
            // console.log(tim_truong_tiet);
            // console.log(ngay_al)
            var tra_CT=seft.TU_LUU_LINH_BAN.find(ct=>ct.can.trim().toLowerCase()===seft.ngay_al.can.toLowerCase() && ct.chi.trim().toLowerCase()===seft.ngay_al.chi.toLowerCase());
            if(tra_CT)
            {
              var du_lieu=tra_CT[tim_truong_tiet].toLowerCase().trim();
              // du_lieu=(1*tra_CT.stt+du_lieu)%9;
              tra_CT=seft.CUU_TINH.find(ct=>1*ct.stt===1*du_lieu);
              if(tra_CT)
                seft.ngay_cuu_tinh={note:seft.templateRPL(templateCuuTinhToolTip,{ten_sao:tra_CT.ten_sao,TT:du_lieu,TB:((du_lieu+1)%9===0?9:(du_lieu+1)%9),T:((du_lieu+2)%9===0?9:(du_lieu+2)%9),DB:((du_lieu+3)%9===0?9:(du_lieu+3)%9),N:((du_lieu+4)%9===0?9:(du_lieu+4)%9),B:((du_lieu+5)%9===0?9:(du_lieu+5)%9),TN:((du_lieu+6)%9===0?9:(du_lieu+6)%9),D:((du_lieu+7)%9===0?9:(du_lieu+7)%9),DN:((du_lieu+8)%9===0?9:(du_lieu+8)%9)}),text:tra_CT.ten_sao};
            }
          }
        }
         /**** Tính Xong Ngày Cửu Tinh ****/	
        var dong_chi=seft.TIET_KHI_24.find(tk=>tk.tiet==="Đông Chí");
        if(dong_chi)
          dong_chi=1*dong_chi.kinh_do_mat_troi.substring(0,dong_chi.kinh_do_mat_troi.length-1);
        var ha_chi=seft.TIET_KHI_24.find(tk=>tk.tiet==="Hạ Chí");
        if(ha_chi)
          ha_chi=1*ha_chi.kinh_do_mat_troi.substring(0,ha_chi.kinh_do_mat_troi.length-1);
        var tim_thoi=false;
        if(kinh_do_mat_troi>ha_chi && kinh_do_mat_troi<dong_chi)
          tim_thoi="thoi_sau_ha_chi";
        else 
          tim_thoi="thoi_sau_dong_chi";
        if(tim_thoi)
        {
          /**** Tính Giờ Cửu Tinh ****/
          var tra_CTG=seft.TU_LUU_LINH_BAN.find(ct=>ct.can.trim().toLowerCase()===seft.ngay_al.can.toLowerCase() && ct.chi.trim().toLowerCase()===seft.ngay_al.chi.toLowerCase());
          var gioIDX=seft.CHI.findIndex(g=>g.toLowerCase()===seft.gio_al.chi.toLowerCase());
          if(tra_CTG)
          {
            var du_lieu=tra_CTG[tim_thoi].toLowerCase().trim();
            if(gioIDX===0)
              du_lieu=1*du_lieu.replace("-","").replace("+","");
            else if(du_lieu.indexOf("-")!==-1)
              du_lieu=1*du_lieu.replace("-","")-gioIDX;
            else if(du_lieu.indexOf("+")!==-1)
              du_lieu=1*du_lieu.replace("+","")+gioIDX;
            if(du_lieu<0)
              du_lieu=(du_lieu+9);
            if(du_lieu>9)
              du_lieu=du_lieu%9;
            if(du_lieu===0)
              du_lieu=9;
            tra_CTG=seft.CUU_TINH.find(ct=>1*ct.stt===1*du_lieu);
            if(tra_CTG)
              seft.gio_cuu_tinh={note:seft.templateRPL(templateCuuTinhToolTip,{ten_sao:tra_CTG.ten_sao,TT:du_lieu,TB:((du_lieu+1)%9===0?9:(du_lieu+1)%9),T:((du_lieu+2)%9===0?9:(du_lieu+2)%9),DB:((du_lieu+3)%9===0?9:(du_lieu+3)%9),N:((du_lieu+4)%9===0?9:(du_lieu+4)%9),B:((du_lieu+5)%9===0?9:(du_lieu+5)%9),TN:((du_lieu+6)%9===0?9:(du_lieu+6)%9),D:((du_lieu+7)%9===0?9:(du_lieu+7)%9),DN:((du_lieu+8)%9===0?9:(du_lieu+8)%9)}),text:tra_CTG.ten_sao};
          }
          /**** Tính Xong Giờ Cửu Tinh ****/
        }
        /************ Tính GIỜ HOÀNG ĐẠO ******************/
        var gio_hoang_dao=[],sao_theo_gio=[];
        var chiOfDay = (jd+1) % 12;
        var gioHD = seft.GIO_HD[chiOfDay % 6]; // same values for Ty' (1) and Ngo. (6), for Suu and Mui etc.
        var ret = "";
        var count = 0;
        for (var i = 0; i < 12; i++) {
          if (gioHD.charAt(i) == '1') {
            var gCanChi=seft.ThoiCan(seft.ThienCan(jd + 9) ,i) + " " +seft.CHI[i];
            var vtgHH=seft.CHI.findIndex(g=>g.toLowerCase()===seft.ngay_al.chi.toLowerCase());
            if(vtgHH!==-1)
            {
              vtgHH=(vtgHH+11)%12;
              if(vtgHH===0)
                vtgHH=12;
              vtgHH="t"+vtgHH.toString();
              var timGHoangHac=seft.NGAY_HOANG_HAC.find(n=>n[vtgHH].toLowerCase()===seft.CHI[i].toLowerCase());
              if(timGHoangHac)
              {
                //Tìm diễn giải cho sao
                var tST=seft.SAO_TOT.find(s=>seft.BoDauTiengViet(s.ten_sao.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(timGHoangHac.ten.toLowerCase(),"","_"))!==-1||seft.BoDauTiengViet(s.ten_sao.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(timGHoangHac.ten.toLowerCase(),"","_"))!==-1);
                var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(timGHoangHac.ten.toLowerCase(),"","_"))!==-1);
                var tinhchatB=(tDG?tDG.dien_giai:(tST?tST.tinh_chat:timGHoangHac.ten)),to_dam=1;
                var tinhchat=(tST?tST.tinh_chat:timGHoangHac.ten),to_dam=1;
                if(tinhchatB.toLowerCase().indexOf('đại')!==-1 && tinhchatB.toLowerCase().indexOf('cát')!==-1 && tinhchatB.toLowerCase().indexOf('hung')===-1)
                  to_dam=2;
                gio_hoang_dao.push(Object.assign(timGHoangHac,{tinh_chat:tinhchat,to_dam:to_dam,ten_gio:gCanChi,khung_gio:((i*2+23)%24).toString().padStart(2, '0')+'-'+((i*2+1)%24).toString().padStart(2, '0')}));
              }
            }
            var cacSao=seft.KIET_HUNG_THOI.filter(s=>s.ngay_can_chi.toLowerCase()===seft.ngay_al.can_chi.toLowerCase() && s.chi_gio.toLowerCase()===seft.CHI[i].toLowerCase());
            // console.log(seft.ngay_al.can_chi.toLowerCase(),seft.CHI[i].toLowerCase())
            if(cacSao.length>0)
            {
              var tinh_chat=1*cacSao[0].tinh_chat,y_nghia1='',y_nghia='';
              if(cacSao[0].ten_sao)
              {
                var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(cacSao[0].ten_sao.toLowerCase(),"","_"))!==-1);
                if(tDG)
                  y_nghia=tDG.dien_giai;
              }
              if(y_nghia.toLowerCase().indexOf('đại')!==-1 && y_nghia.toLowerCase().indexOf('cát')!==-1 && y_nghia.toLowerCase().indexOf('hung')===-1)
                tinh_chat=3;
              else if(y_nghia.toLowerCase().indexOf('đại')!==-1 && y_nghia.toLowerCase().indexOf('hung')!==-1 && y_nghia.toLowerCase().indexOf('cát')===-1)
                tinh_chat=2;
              else if(y_nghia.toLowerCase().indexOf('hung')===-1)
                tinh_chat=1;
              var ten_sao1=cacSao[cacSao.length-1].ten_sao;
              var tinh_chat1=1*cacSao[cacSao.length-1].tinh_chat;
              if(ten_sao1)
              {
                var tDG=seft.CAT_HUNG_THAN.find(s=>seft.BoDauTiengViet(s.ten.toLowerCase(),"","_").indexOf(seft.BoDauTiengViet(ten_sao1.toLowerCase(),"","_"))!==-1);
                if(tDG)
                  y_nghia1=tDG.dien_giai;
              }
              if(y_nghia1.toLowerCase().indexOf('đại')!==-1 && y_nghia1.toLowerCase().indexOf('cát')!==-1 && y_nghia1.toLowerCase().indexOf('hung')===-1)
                tinh_chat1=3;
              else if(y_nghia1.toLowerCase().indexOf('đại')!==-1 && y_nghia1.toLowerCase().indexOf('hung')!==-1 && y_nghia1.toLowerCase().indexOf('cát')===-1)
                tinh_chat1=2;
              else if(y_nghia1.toLowerCase().indexOf('hung')===-1)
                tinh_chat1=1;
              sao_theo_gio.push(Object.assign(cacSao[0],{ten_sao:cacSao[0].ten_sao,y_nghia:y_nghia,ten_sao1:ten_sao1,y_nghia1:y_nghia1,tinh_chat1:tinh_chat1,tinh_chat:tinh_chat,ten_gio:gCanChi,khung_gio:((i*2+23)%24).toString().padStart(2, '0')+'-'+((i*2+1)%24).toString().padStart(2, '0')}));
            }
          }
        }
        seft.gio_hoang_dao=gio_hoang_dao;
        /**** Tính Xong GIỜ HOÀNG ĐẠO ****/	
        /************ Tính SAO THEO GIỜ ******************/
        seft.sao_theo_gio=sao_theo_gio;
        // console.log(seft.sao_theo_gio,seft.ngay_al.can_chi.toLowerCase(),seft.gio_al.chi.toLowerCase());
        /**** Tính Xong SAO THEO GIỜ ****/	

        /**** Tính TAM SÁT NIÊN ****/	
        seft.tam_sat_nien=seft.TAM_SAT_VI.find(s=>(","+s.cac_chi.toLowerCase()+",").indexOf(","+seft.nam_al.chi.toLowerCase()+",")!==-1);
        /************ Tính Xong TAM SÁT NIÊN ******************/
        /**** Tính TAM SÁT NGUYỆT ****/	
        seft.tam_sat_nguyet=seft.TAM_SAT_VI.find(s=>(","+s.cac_chi.toLowerCase()+",").indexOf(","+seft.thang_al.chi.toLowerCase()+",")!==-1);
        /************ Tính Xong TAM SÁT NGUYỆT ******************/
        /**** Tính TAM SÁT NHỰT ****/	
        seft.tam_sat_nhut=seft.TAM_SAT_VI.find(s=>(","+s.cac_chi.toLowerCase()+",").indexOf(","+seft.ngay_al.chi.toLowerCase()+",")!==-1);
        /************ Tính Xong TAM SÁT NHỰT ******************/
        /**** Tính TAM SÁT THỜI ****/	
        seft.tam_sat_thoi=seft.TAM_SAT_VI.find(s=>(","+s.cac_chi.toLowerCase()+",").indexOf(","+seft.gio_al.chi.toLowerCase()+",")!==-1);
        /************ Tính Xong TAM SÁT THỜI ******************/
        /*** Tính Giờ Lục Nhâm ***/
        var giolucnham=[],giolucnhamHoang=[],giolucnhamHac=[];
        var kdngay=1;
        var timLN=seft.LUC_NHAM.find(s=>seft.substring_index((','+s.thang_al+','),(','+NgayAL.month+','),1)!==(','+s.thang_al+','));
        kdngay=(NgayAL.day-1+1*timLN["stt"])%6;
        if(kdngay==0)
        {
          kdngay=6;
        }
        for(var n=0;n<12;n++)
        {
          var sttmoi=(kdngay+n)%6;
          if(sttmoi==0)
            sttmoi=6;
          timLN=seft.LUC_NHAM.find(c=>c.stt===sttmoi);
          if(timLN)
          {
            if (gioHD.charAt(n) == '1')
              giolucnhamHoang.push({ten_gio:seft.CHI[n],tho_han:timLN.tho_han,ten_luc_nham:timLN.ten_luc_nham,tot:sttmoi%2!=0});
            else
              giolucnhamHac.push({ten_gio:seft.CHI[n],tho_han:timLN.tho_han,ten_luc_nham:timLN.ten_luc_nham,tot:sttmoi%2!=0});
          }
        }
        for(var l=0;l<giolucnhamHoang.length;l++)
        {
          giolucnham.push(giolucnhamHoang[l]);
          giolucnham.push(giolucnhamHac[l]);
        }
        // console.log(giolucnham);
        seft.gio_luc_nham=giolucnham;//.sort((a, b) =>a.hoang_dao.localeCompare(b.hoang_dao));
        /*** Tính Xong Giờ Lục Nhâm ***/
        /*** Tính GIỜ NƯỚC LỚN, RÒNG ***/
        seft.gio_nuoc=seft.NUOC_LON_NUOC_RONG.find(s=>(","+s.ngay_al+",").indexOf(","+NgayAL.day+",")!==-1);
        /*** Tính Xong GIỜ NƯỚC LỚN, RÒNG ***/
        /*** Tính Giờ Không Vong ***/
        var socan=seft.CAN.findIndex(c=>c.toLowerCase()===seft.ngay_al.can.toLowerCase());
        var sochi=seft.CHI.findIndex(c=>c.toLowerCase()===seft.ngay_al.chi.toLowerCase());
        var kvtai=seft.CHI[((sochi-socan+ 12)%12)];
        seft.gio_kv=seft.GIO_KHONG_VONG.find(s=>s.tuan_giap.toLowerCase()===kvtai.toLowerCase());
        /*** Tính Xong Giờ Không Vong ***/
        /*** Tính HƯỚNG KIẾT HUNG ***/
        var tai_than=seft.TAI_THAN.find(s=>("-"+s.can_ngay+"-").toLowerCase().indexOf("-"+seft.ngay_al.can.toLowerCase()+"-")!==-1);
        var hy_than=seft.HY_THAN.find(s=>("-"+s.can_ngay+"-").toLowerCase().indexOf("-"+seft.ngay_al.can.toLowerCase()+"-")!==-1);
        var hac_than=seft.HAC_THAN.find(s=>("-"+s.can_chi_ngay+"-").toLowerCase().indexOf("-"+seft.ngay_al.can_chi.toLowerCase()+"-")!==-1);
        if(hac_than && hy_than && hac_than)
          seft.huong_kiet_hung={tai_than:tai_than.huong,hy_than:hy_than.huong,hac_than:hac_than.huong};
        /*** Tính Xong HƯỚNG KIẾT HUNG ***/
        /*** Tính HƯỚNG TUỔI XUNG KHẮC VỚI NGÀY ***/
        var timXungKhacNgay=seft.lucthaphoagiap.find(s=>s.can_chi.toLowerCase()===seft.ngay_al.can_chi.toLowerCase());
        if(timXungKhacNgay)
          seft.tuoi_xung_khac_ngay=timXungKhacNgay.tuoi_xung_khac.split(/,/g);
        /*** Tính Xong TUỔI XUNG KHẮC VỚI NGÀY ***/
        /*** Tính HƯỚNG TUỔI XUNG KHẮC VỚI THÁNG ***/
        var timXungKhacThang=seft.lucthaphoagiap.find(s=>s.can_chi.toLowerCase()===seft.thang_al.can_chi.toLowerCase());
        if(timXungKhacThang)
          seft.tuoi_xung_khac_thang=timXungKhacThang.tuoi_xung_khac.split(/,/g);
        /*** Tính Xong TUỔI XUNG KHẮC VỚI THÁNG ***/
        /*** Tính Đổng Công Soạn Trạch ***/
        var strDCTempl=`<table style="width: 696px; border-collapse: collapse; border: 1px none;" cellpadding="0" cellspacing="0" class="MsoTableGrid">
          <tbody>
            <tr style="mso-yfti-irow:0;mso-yfti-firstrow:yes;height:18.0pt">
              <td style="width: 720px; border: 1pt solid windowtext; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);" colspan="5">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Ngày</span></b><b><span style="font-size: 12pt; font-family: 'Times New Roman', serif;"> $(truc) $(chi_ngay)</span></b>
                </p>
              </td>
            </tr>
            <tr style="mso-yfti-irow:1;height:18.0pt">
              <td style="width: 120px; border-style: none solid solid; border-right-color: windowtext; border-bottom-color: windowtext; border-left-color: windowtext; border-right-width: 1pt; border-bottom-width: 1pt; border-left-width: 1pt; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Ngày</span></b>
                </p>
              </td>
              <td style="width: 240px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Nghi - Kị</span></b>
                </p>
              </td>
              <td style="width: 240px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Ảnh Hưởng</span></b>
                </p>
              </td>
              <td style="width: 120px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Kiết - Hung</span></b>
                </p>
              </td>
              <td style="width: 120px; border-style: none solid solid; border-right-color: windowtext; border-bottom-color: windowtext; border-left-color: windowtext; border-right-width: 1pt; border-bottom-width: 1pt; border-left-width: 1pt; padding: 0cm 5.4pt; height: 18pt; background: rgb(255, 192, 0);">
                <p style="text-align:center" class="MsoNoSpacing">
                  <b><span style="font-size:12.0pt;font-family:
        'Times New Roman','serif';mso-fareast-font-family:'Times New Roman';
        color:#1D1B11;mso-themecolor:background2;mso-themeshade:26">Ngày</span></b>
                </p>
              </td>
            </tr>
            <tr style="mso-yfti-irow:2;mso-yfti-lastrow:yes;height:80.95pt">
              <td style="width: 120px; border-style: none solid solid; border-right-color: windowtext; border-bottom-color: windowtext; border-left-color: windowtext; border-right-width: 1pt; border-bottom-width: 1pt; border-left-width: 1pt; padding: 0cm 5.4pt; height: 80.95pt; background: rgb(255, 192, 0);">
                $(ngay_can_chi)
              </td>
              <td style="width: 240px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 80.95pt;">
                $(nghi_ki)
              </td>
              <td style="width: 240px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 80.95pt;">
                $(anh_huong)
              </td>
              <td style="width: 120px; border-style: none solid solid none; border-bottom-color: windowtext; border-bottom-width: 1pt; border-right-color: windowtext; border-right-width: 1pt; padding: 0cm 5.4pt; height: 80.95pt;">
                $(kiet_hung)
              </td>
              <td style="width: 120px; border-style: none solid solid; border-right-color: windowtext; border-bottom-color: windowtext; border-left-color: windowtext; border-right-width: 1pt; border-bottom-width: 1pt; border-left-width: 1pt; padding: 0cm 5.4pt; height: 80.95pt; background: rgb(255, 192, 0);">
                $(ngay_can_chi)
              </td>
            </tr>
          </tbody>
        </table>`;
        // console.log(thang_tk,tinh_truc,seft.ngay_al.chi.toLowerCase());
        var dong_cong=seft.DONG_CONG_SOAN_TRACH.find(s=>s.truc.toLowerCase()===tinh_truc.toLowerCase() && s.chi_ngay.toLowerCase()===seft.ngay_al.chi.toLowerCase() && ("-"+s.can_ngay+"-").toLowerCase().indexOf("-"+seft.ngay_al.can.toLowerCase()+"-")!==-1);
        // console.log(thang_tk,tinh_truc,seft.ngay_al.chi.toLowerCase(),dong_cong);
        if(!dong_cong)
          dong_cong={};
        dong_cong=Object.assign(dong_cong,{ngay_can_chi:seft.ngay_al.can_chi});
        seft.dong_cong_ly_giai=Object.assign({note:seft.templateRPL(strDCTempl,dong_cong)},dong_cong);

        // /*** Tính Xong Đổng Công Soạn Trạch ***/
        /*** Tính An Nam Trình Tuyền ***/
        seft.trang_trinh_ly_giai=seft.NGUYEN_BINH_KHIEM.filter(s=>seft.substring_index((','+s.cac_ngay.replace(new RegExp(", +","g"),",").toLowerCase()+','),(','+seft.ngay_al.can_chi.toLowerCase()+','),1)!==(','+s.cac_ngay.replace(new RegExp(", +","g"),",").toLowerCase()+',')).sort((a, b) =>a.cong_viec.localeCompare(b.cong_viec));
        // console.log(seft.trang_trinh_ly_giai);
        /*** Tính Xong An Nam Trình Tuyền ***/
        seft.today_am=dateFormat(chuyenNgay(NgayAL.day+"/"+NgayAL.month+"/"+NgayAL.year,"dd/mm/yyyy"),"dd/mm/yyyy");
        setTimeout(seft.loadToolTip,10);
      },
      dateClickSelect:function(event) {
        var seft=this;
        event.preventDefault();
        if(event.target.getAttribute("id"))
        {
          switch(event.target.getAttribute("id"))
          {
            case "btnxemngayduong":
              seft.theoamlich=false;
              seft.today=document.querySelector("#chondd").value+"/"+document.querySelector("#chonmm").value+"/"+document.querySelector("#chonyy").value;
              document.querySelector("#lich").removeAttribute("class");
              document.querySelector("#lich").setAttribute("class","hidden");
              seft.gio_ht=document.querySelector("#chonhh").value+':'+document.querySelector("#chonphut").value;
              seft.xem_ngay(seft.today);
              break;
            case "btnxemngayam":
              seft.theoamlich=true;
              document.querySelector("#lich").removeAttribute("class");
              document.querySelector("#lich").setAttribute("class","hidden");
              var ngay_am=document.querySelector("#chondda").value+"/"+document.querySelector("#chonmma").value+"/"+document.querySelector("#chonyya").value;
              seft.today_am=ngay_am;
              var ngayxem=chuyenNgay(seft.today_am,"dd/mm/yyyy");
              var ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), seft.nhuan?1:0, 7);
              if(ngayDL[0]===0)
              {
                seft.isNhuan.option("value",false);
                ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), 0, 7);
              }
              seft.today=ngayDL[0]+"/"+ngayDL[1]+"/"+ngayDL[2];
              seft.gio_ht=document.querySelector("#chonhha").value+':'+document.querySelector("#chonphuta").value;
              seft.xem_ngay(seft.today);
              break;
            case "NextMonth":
              var mm=1*event.target.getAttribute("mm");
              var yy=1*event.target.getAttribute("yy");
              seft.printMonth(mm,yy);
              break;
            case "NextYear":
              var mm=1*event.target.getAttribute("mm");
              var yy=1*event.target.getAttribute("yy");
              seft.printMonth(mm,yy);
              break;
            case "PrevMonth":
              var mm=1*event.target.getAttribute("mm");
              var yy=1*event.target.getAttribute("yy");
              seft.printMonth(mm,yy);
              break;
            case "PrevYear":
              var mm=1*event.target.getAttribute("mm");
              var yy=1*event.target.getAttribute("yy");
              seft.printMonth(mm,yy);
              break;
            case "donglich":
              document.querySelector("#lich").removeAttribute("class");
              document.querySelector("#lich").setAttribute("class","hidden");
              break;
            default:
              break;
          }
        }
        else
        {
          var elm=false;
          if(event.target.getAttribute("data-al"))
            elm=event.target;
          else if(event.target.parentNode)
          {
            if(event.target.parentNode.getAttribute("data-al"))
              elm=event.target.parentNode;
            else if(event.target.parentNode.parentNode)
            {
              if(event.target.parentNode.parentNode.getAttribute("data-al"))
                elm=event.target.parentNode.parentNode;
            }
          }
          if(elm)
          {
            seft.today_am=dateFormat(chuyenNgay(elm.getAttribute("data-al"),"dd/mm/yyyy"),"dd/mm/yyyy");
            var ngayxem=chuyenNgay(seft.today_am,"dd/mm/yyyy");
            var ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), seft.nhuan?1:0, 7);
            if(ngayDL[0]===0)
            {
              seft.isNhuan.option("value",false);
              ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), 0, 7);
            }
            seft.today=ngayDL[0]+"/"+ngayDL[1]+"/"+ngayDL[2];
            seft.cai_ngay(seft.today);
          }
        }
      },
      TinhNgayDangChon:function(){
        var seft=this;
        $('.date').dateEntry({dateFormat: "dmy/",spinnerImage: ""});
        if(document.querySelector("#ngay_am_lich") && document.querySelector("#ngay_duong_lich"))
        {
          document.querySelector("#ngay_am_lich").addEventListener("click", function(){
            setTimeout(function() {
              document.querySelector("#lich").removeAttribute("class");
            },100);
          });
          document.querySelector("#ngay_duong_lich").addEventListener("click", function(){
            setTimeout(function() {
              document.querySelector("#lich").removeAttribute("class");
            },100);
          });
        }
        // console.log("Vao",seft.LucThapGiapTy);
        seft.isNhuan=$('#nhuan').dxCheckBox({
          value:seft.nhuan,
          onValueChanged(data) {
            seft.nhuan=data.value;
            if(seft.today_am==="")
            {
              var ngayxem=chuyenNgay(seft.today,"dd/mm/yyyy");
              var currentLunarDate = seft.duong_qua_am(ngayxem.getDate(),ngayxem.getMonth()+1,ngayxem.getFullYear(),7);
              seft.today_am=currentLunarDate.day+"/"+currentLunarDate.month+"/"+currentLunarDate.year;
            }
            else
            {
              var ngayxem=chuyenNgay(seft.today_am,"dd/mm/yyyy");
              var ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), seft.nhuan?1:0, 7);
              if(ngayDL[0]===0)
              {
                seft.isNhuan.option("value",false);
                ngayDL=seft.am_qua_duong(ngayxem.getDate(), ngayxem.getMonth()+1, ngayxem.getFullYear(), 0, 7);
              }
              seft.today=ngayDL[0]+"/"+ngayDL[1]+"/"+ngayDL[2];
            }
          }
        }).dxCheckBox("instance");
        seft.xem_ngay(seft.today);
      }
    },
    template:`
      <div id="dvxemngaytotxau" v-if="isLoading" class="d-flex justify-content-center container">
        <div class="row">
          <div class="spinner-border text-danger" role="status">
            <span class="visually-hidden"></span>
          </div>
        </div>
      </div>
      <!-- end loading -->
      <div v-else id="dvxemngaytotxau" class="container">
        <div class="row">
          <!-- Bắt đầu: Form chọn ngày trên trang xem ngày -->
          <div class="col-md-4 col-sm-push-4 khung p-0">
              <div class="card">
                  <div class="card-header">
                    <h1 class="title">CÔNG CỤ XEM NGÀY TỐT, XẤU</h1>
                  </div>
                  <div class="card-body">
                    <div class="card-text">
                      <div class="d-table-cell" style="vertical-align: middle;">
                        <div class="row m-0">
                          <div class="col-12 text-center text-bold m-2 text-uppercase">ĐANG HIỂN THỊ {{dayOfWeek}}</div>
                            <div id="lich" class="hidden" v-html="SDTemplate" @click="dateClickSelect" ref="SDT"></div>
                            <div class="col-12 d-flex" style="font-size: 14px;">
                              <div class="col-1 p-0"></div>
                              <div class="col-4 p-0">
                                <!-- text input -->
                                <div class="form-group text-center m-0">
                                  <label class="m-0 mb-1">Dương Lịch</label>
                                  <input id="ngay_duong_lich" style="width: 111px;border-radius: 5px;border: 1px solid #ddd;" v-model="today" class="date text-center"/>
                                </div>
                              </div>
                              <div class="col-2 p-0">
                                <!-- text input -->
                                <div class="form-group text-center m-0">
                                  <label class="m-0 mb-1">Nhuận</label>
                                  <div id="nhuan" class="date text-center" style="border: none;display: block"></div>
                                </div>
                              </div>
                              <div class="col-4 p-0">
                                <!-- text input -->
                                <div class="form-group text-center m-0">
                                  <label class="m-0 mb-1">Âm Lịch</label>
                                  <input id="ngay_am_lich" style="width: 111px;border-radius: 5px;border: 1px solid #ddd;" v-model="today_am" class="date text-center"/>
                                </div>
                              </div>
                              <div class="col-1 p-0"></div>
                            </div>
                        </div>
                        <div class="row m-0 text-bold p-0 mt-1 text-center d-table" style="font-size: 14px;width: 100%;">
                          <div class="text-center d-table-cell"><span class="note"><div class="hidden" :tooltip="nam_al.qv_note"></div>Năm<br/>{{nam_al.ngu_hanh}}<br/> {{nam_al.can_chi}}<br/>{{nam_al.que_van}}<br/></span></div>
                          <div class="text-center d-table-cell align-middle"><span class="note"><div class="hidden" :tooltip="bang_van_hanh"></div>-</span></div>
                          <div class="text-center d-table-cell"><span class="note"><div class="hidden" :tooltip="thang_al.qv_note"></div>Tháng<br/>{{thang_al.ngu_hanh}}<br/>{{thang_al.can_chi}}<br/>{{thang_al.que_van}}<br/></span></div>
                          <div class="text-center d-table-cell align-middle"><span class="note"><div class="hidden" :tooltip="bang_van_hanh"></div>-</span></div>
                          <div class="text-center d-table-cell"><span class="note"><div class="hidden" :tooltip="ngay_al.qv_note"></div>Ngày<br/>{{ngay_al.ngu_hanh}}<br/>{{ngay_al.can_chi}}<br/>{{ngay_al.que_van}}<br/></span></div>
                          <div class="text-center d-table-cell align-middle"><span class="note"><div class="hidden" :tooltip="bang_van_hanh"></div>-</span></div>
                          <div class="text-center d-table-cell"><span class="note"><div class="hidden" :tooltip="gio_al.qv_note"></div>Giờ<br/>{{gio_al.ngu_hanh}}<br/>{{gio_al.can_chi}}<br/>{{gio_al.que_van}}<br/></span></div>
                        </div>
                        <div class="row m-0 text-bold p-0">
                          <div class="col-12 text-center">
                            <button type="button" style="border: none; background: transparent;font-size: 12px;" class="btn btn-default" @click="xemngay(-1)"><i class="fa fa-fast-backward"></i></button>
                            <button type="button" style="border: none; background: transparent;font-size: 12px;" class="btn btn-default text-bold" @click="xemngay(0)">XEM HÔM NAY</button>
                            <button type="button" style="border: none; background: transparent;font-size: 12px;" class="btn btn-default" @click="xemngay(1)"><i class="fa fa-fast-forward"></i></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
          </div>
          <!-- Kết thúc: Form chọn ngày trên trang xem ngày -->
          <div class="col-md-4 col-sm-pull-4 khung nowrap p-0">
            <div class="card">
              <div class="card-header">
                <h5 class="title">TỔNG QUAN</h5>
              </div>
              <div class="card-body">
                <div class="card-text khunginfotren">
                  <div class="d-table-cell pl-2" style="vertical-align: middle;">
                    <div class="row m-0 p-0">
                      <div class="col-6">Giờ Đang Xem:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="gio_al.note"></div>{{gio_al.can_chi}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Nạp Âm Ngày:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">
                        <span class="note">
                            <div class="hidden" :tooltip="nap_am_ngay.giai_nghia"></div>
                            {{nap_am_ngay.ngu_hanh}}
                        </span>
                      </div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Thập Nhị Trực:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note o_table"><div class="hidden" :tooltip="thap_nhi_truc.note"></div>Trực {{thap_nhi_truc.ten_truc}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Kiết Hung Nhật:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="kiet_hung_nhat.note"></div><span v-html="kiet_hung_nhat.text"></span></span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Đại Tiểu Nguyệt:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">{{dai_tieu_nguyet}}</div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Nhị Thập Bát Tú:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="sao_theo_ngay.note"></div>{{sao_theo_ngay.ten_sao}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Ngày Âm Dương:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">{{ngay_am_duong.noi_dung}}</div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Thập Thiên Can Ngày:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">{{ngay_al.can}} ({{ngay_al.ngu_hanh_can}})</div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Thập Nhị Địa Chi Ngày:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">{{ngay_al.chi}} ({{ngay_al.ngu_hanh_chi}})</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4 khung nowrap p-0">
            <div class="card">
              <div class="card-header">
                <h5 class="title">THÔNG TIN</h5>
              </div>
              <div class="card-body">
                <div class="card-text khunginfotren">
                  <div class="d-table-cell pl-2" style="vertical-align: middle;">
                    <div class="row m-0 p-0">
                      <div class="col-6">Năm Cửu Tinh:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note" :t_header="'sao '+nam_cuu_tinh.text"><div class="hidden" :tooltip="nam_cuu_tinh.note"></div>{{nam_cuu_tinh.text}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Tháng Cửu Tinh:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note" :t_header="'sao '+thang_cuu_tinh.text"><div class="hidden" :tooltip="thang_cuu_tinh.note"></div>{{thang_cuu_tinh.text}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Ngày Cửu Tinh:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note" :t_header="'sao '+ngay_cuu_tinh.text"><div class="hidden" :tooltip="ngay_cuu_tinh.note"></div>{{ngay_cuu_tinh.text}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Giờ Cửu Tinh:</div>
                      <div class="col-6 text-capitalize" style="margin-left: -15px;"><span><span class="note text-bold" :t_header="'sao '+gio_cuu_tinh.text"><div class="hidden" :tooltip="gio_cuu_tinh.note"></div>{{gio_cuu_tinh.text}}</span> ({{gio_al.can_chi}})</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Ngày Lục Nhâm:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="ngay_luc_nham.note"></div>{{ngay_luc_nham.text}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Nhị Thập Tứ Khí:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note" v-for="(tk, idx) in tiet_khi"><div class="hidden" :tooltip="tk.y_nghia"></div>{{(idx==1?"&nbsp;- ":"")+tk.tiet}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Ngày Xuất Hành:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="ngay_xuat_hanh.note"></div>{{ngay_xuat_hanh.text}}</span></div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Ngày Đầu Tháng:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;">{{ngay_dau_thang}}</div>
                    </div>
                    <div class="row m-0 p-0">
                      <div class="col-6">Quan Niệm Dân Gian:</div>
                      <div class="col-6 text-bold text-capitalize" style="margin-left: -15px;"><span class="note"><div class="hidden" :tooltip="dan_gian.note"></div>{{dan_gian.text}}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="clear h20"></div>
        <div class="row">
            <!-- Bắt đầu: Kiết tinh -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">KIẾT TINH THEO ÂM LỊCH</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          <div class="row m-0 mr-2 pl-3 pr-2">
                            <span class="note text-red pl-1" v-for="(sao, idx) in cac_sao_tot">
                              <div class="hidden" :tooltip="sao.tinh_chat"></div>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-if="idx<cac_sao_tot.length-1">{{sao.ten_sao+","}}</span>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-else>{{sao.ten_sao}}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
            </div>
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">KIẾT TINH THEO TIẾT KHÍ</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          <div class="row m-0 mr-2 pl-3 pr-2">
                            <span class="note text-red pl-1" v-for="(sao, idx) in cac_sao_tot_tk">
                              <div class="hidden" :tooltip="sao.tinh_chat"></div>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-if="idx<cac_sao_tot.length-1">{{sao.ten_sao+","}}</span>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-else>{{sao.ten_sao}}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
            </div>
						<!-- Kết thúc: Kiết tinh -->

            <!-- Bắt đầu: Hung tinh -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">HUNG TINH THEO ÂM LỊCH</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          <div class="row m-0 mr-2 pl-3 pr-2">
                            <span class="note pl-1" v-for="(sao, idx) in cac_sao_xau">
                                <div class="hidden" :tooltip="sao.tinh_chat"></div>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-if="idx<cac_sao_xau.length-1">{{sao.ten_sao+","}}</span>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-else>{{sao.ten_sao}}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
            </div>
						<div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">HUNG TINH THEO TIẾT KHÍ</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          <div class="row m-0 mr-2 pl-3 pr-2">
                            <span class="note pl-1" v-for="(sao, idx) in cac_sao_xau_tk">
                                <div class="hidden" :tooltip="sao.tinh_chat"></div>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-if="idx<cac_sao_xau.length-1">{{sao.ten_sao+","}}</span>
                                <span :class="sao.to_dam>=2?'text-bold':''" v-else>{{sao.ten_sao}}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
            </div>
						<!-- Kết thúc: Hung tinh -->
        </div>
        <div class="clear h20"></div>
        <div class="row">
            <!-- Bắt đầu: Tam sát niên -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">TAM SÁT NIÊN</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text text-center">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          {{tam_sat_nien.huong_khac}}
                          <div class="clear"></div>
                        </div>
                      </div>
                    </div>
                </div>
            </div><!-- Kết thúc: Tam sát niên -->

            <!-- Bắt đầu: Tam sát nguyệt -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">TAM SÁT NGUYỆT</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text text-center">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          {{tam_sat_nguyet.huong_khac}}
                          <div class="clear"></div>
                        </div>
                      </div>
                    </div>
                </div>
            </div><!-- Kết thúc: Tam sát nguyệt -->

            <!-- Bắt đầu: Tam sát nhựt -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">TAM SÁT NHỰT</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text text-center">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          {{tam_sat_nhut.huong_khac}}
                          <div class="clear"></div>
                        </div>
                      </div>
                    </div>
                </div>
            </div><!-- Kết thúc: Tam sát nhựt -->

            <!-- Bắt đầu: Tam sát thời -->
            <div class="col-md-3 khung nowrap p-0 p-0">
                <div class="card">
                    <div class="card-header">
                      <h5 class="title">TAM SÁT THỜI</h5>
                    </div>
                    <div class="card-body">
                      <div class="card-text text-center">
                        <div class="d-table-cell" style="vertical-align: middle;">
                          {{tam_sat_thoi.huong_khac}}
                          <div class="clear"></div>
                        </div>
                      </div>
                    </div>
                </div>
            </div><!-- Kết thúc: Tam sát thời -->
        </div>
        <div class="clear h20"></div>
        <div class="row">
            <!-- Bắt đầu: Giờ hoàng đạo -->
            <div class="col-md-3 khung nowrap p-0">
              <div class="card">
                <div class="card-header">
                  <h5 class="title">GIỜ HOÀNG ĐẠO</h5>
                </div>
                <div class="card-body p-0">
                  <div class="card-text">
                    <div class="d-table-cell" style="vertical-align: middle;">
                      <div class="d-flex" v-for="(hd, idx) in gio_hoang_dao">
                        <div class="col-4"><span>{{hd.ten_gio}}</span></div>
                        <div class="col-3">{{hd.khung_gio}}</div>
                        <div class="col-5 text-right text-red" :class="1*hd.to_dam>=2?' text-bold':''"><span class="note"><div class="hidden" :tooltip="hd.tinh_chat"></div>{{hd.ten}}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div><!-- Kết thúc: Giờ hoàng đạo -->

            <!-- Bắt đầu: Sao theo giờ -->
            <div class="col-md-3 khung nowrap p-0">
              <div class="card">
                  <div class="card-header">
                    <h5 class="title">SAO THEO GIỜ</h5>
                  </div>
                  <div class="card-body">
                    <div class="card-text">
                      <div class="d-table-cell" style="vertical-align: middle;">
                        <div class="d-flex" style="padding-left: 5px !important;" v-for="(sao, idx) in sao_theo_gio">
                          <div class="col-2 p-0 pl-1 text-left">{{sao.chi_gio}}</div>
                          <div class="col-5 p-0 text-right" :class="sao.tinh_chat>=2?(sao.tinh_chat===3?'text-red':'')+' text-bold':(sao.tinh_chat===1?'text-red':'')"><span class="note" v-if="sao.y_nghia"><div class="hidden" :tooltip="sao.y_nghia"></div>{{sao.ten_sao}}</span><span v-else>{{sao.ten_sao}}</span></div>
                          <div class="col-5 p-0 pr-3 text-right" :class="sao.tinh_chat1>=2?(sao.tinh_chat1===3?'text-red':'')+' text-bold':(sao.tinh_chat1===1?'text-red':'')"><span class="note" v-if="sao.y_nghia1"><div class="hidden" :tooltip="sao.y_nghia1"></div>{{sao.ten_sao1}}</span><span v-else>{{sao.ten_sao1}}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div><!-- Kết thúc: Sao theo giờ -->

            <!-- Bắt đầu: Giờ lục nhâm -->
            <div class="col-md-3 khung nowrap p-0">
              <div class="card">
                  <div class="card-header">
                    <h5 class="title">GIỜ LỤC NHÂM</h5>
                  </div>
                  <div class="card-body">
                    <div class="card-text">
                      <div class="d-table-cell pl-2" style="vertical-align: middle;">
                        <div class="row m-0 ml-1 mr-1">
                          <div class="col-6 p-0" v-for="(gio, idx) in gio_luc_nham">
                            <div class="d-flex" :class="idx%2!=0?'ml-2 mr-2':'ml-2 mr-2'">
                              <div class="col-3 p-0 d-inline-flex">{{gio.ten_gio}}</div>
                              <div class="col-8 p-0 text-right ml-1" :class="gio.tot?'text-red':''"><span class="note"><div class="hidden" :tooltip="gio.tho_han"></div>{{gio.ten_luc_nham}}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div><!-- Kết thúc: Giờ lục nhâm -->

            <!-- Bắt đầu: Giờ nước lớn, ròng -->
            <div class="col-md-3 khung nowrap p-0">
              <div class="card">
                <div class="card-header">
                  <h5 class="title">GIỜ NƯỚC LỚN, RÒNG</h5>
                </div>
                <div class="card-body p-0">
                  <div class="card-text">
                    <div class="d-table-cell" style="vertical-align: middle;">
                      <div class="col-12">
                          <span class="text-bold">Đối Với Vùng Thấp</span>
                          <br>
                          - Giờ Nước Lớn:<span class="ml-1" style="color:red;">{{(gio_nuoc.gio_nuoc_lon?gio_nuoc.gio_nuoc_lon:'').replace(',',', ')}}</span>
                          <br>
                          - Giờ Nước Ròng:<span class="ml-1">{{(gio_nuoc.gio_nuoc_nho?gio_nuoc.gio_nuoc_nho:'').replace(',',', ')}}</span>                     
                      </div>
                      <div class="col-12">
                          <span class="text-bold">Đối Với Vùng Cao</span>
                          <br>
                          - Giờ Nước Lớn:<span class="ml-1" style="color:red;">{{(gio_nuoc.gio_nuoc_nho?gio_nuoc.gio_nuoc_nho:'').replace(',',', ')}}</span>
                          <br>
                          - Giờ Nước Ròng:<span class="ml-1">{{(gio_nuoc.gio_nuoc_lon?gio_nuoc.gio_nuoc_lon:'').replace(',',', ')}}</span>
                      </div>
                      <div class="clear"></div>
                    </div>
                  </div>
                </div>
              </div>
          </div><!-- Kết thúc: Giờ nước lớn, ròng -->
        </div>
        <div class="clear h20"></div>
        <div class="row">
            <!-- Bắt đầu: Tuổi xung khắc với ngày -->
            <div class="col-md-3 khung p-0">
              <div class="card">
                <div class="card-header">
                  <h5 class="title">TUỔI XUNG KHẮC VỚI NGÀY</h5>
                </div>
                <div class="card-body p-0">
                  <div class="card-text">
                    <div class="d-table-cell pl-2" style="vertical-align: middle;">
                      <span class="d-flex m-1 ml-2" v-for="(tuoi, idx) in tuoi_xung_khac_ngay">{{tuoi}}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div><!-- Kết thúc: Tuổi xung khắc với ngày -->

            <!-- Bắt đầu: Tuổi xung khắc với tháng -->
            <div class="col-md-3 khung p-0">
              <div class="card">
                <div class="card-header">
                  <h5 class="title">TUỔI XUNG KHẮC VỚI THÁNG</h5>
                </div>
                <div class="card-body">
                  <div class="card-text">
                    <div class="d-table-cell" style="vertical-align: middle;">
                      <span class="d-flex m-1 ml-2" v-for="(tuoi, idx) in tuoi_xung_khac_thang">{{tuoi}}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div><!-- Kết thúc: Tuổi xung khắc với tháng -->

            <!-- Bắt đầu: Hướng kiết hung -->
            <div class="col-md-3 khung p-0">
              <div class="card">
                <div class="card-header">
                  <h5 class="title">HƯỚNG KIẾT HUNG</h5>
                </div>
                <div class="card-body">
                  <div class="card-text">
                    <div class="d-table-cell" style="vertical-align: middle;">
                      <span class="d-flex m-1 ml-2">Tài Thần: <span class="ml-1" style="color:red;">{{huong_kiet_hung.tai_than}}</span></span>
                      <span class="d-flex m-1 ml-2">Hỷ Thần: <span class="ml-1" style="color:red;">{{huong_kiet_hung.hy_than}}</span></span>
                      <span class="d-flex m-1 ml-2">Hạc Thần: <span class="ml-1">{{huong_kiet_hung.hac_than}}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div><!-- Kết thúc: Hướng kiết hung -->

            <!-- Bắt đầu: Giờ không vong -->
            <div class="col-md-3 khung nowrap p-0">
                <div class="card">
                  <div class="card-header">
                    <h5 class="title">GIỜ KHÔNG VONG</h5>
                  </div>
                  <div class="card-body">
                    <div class="card-text">
                      <div class="d-table-cell" style="vertical-align: middle;">
                        <div class="d-flex m-1 ml-2">Giờ Cô:<span class="ml-1" style="color:red;"> {{gio_kv.gio_co}}</span></div>
                        <div class="d-flex m-1 ml-2">Giờ Hư: <span class="ml-1">{{gio_kv.gio_hu}}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
            </div><!-- Kết thúc: Giờ không vong -->
        </div>
        <div class="clear h20"></div>
        <div class="row">
          <!-- Bắt đầu: Đổng công - Soạn trạch nhật -->
          <div class="col-md-6 khung p-0">
            <div class="card" style="height: 100%;">
              <div class="card-header">
                <h5 class="title">ĐỔNG CÔNG - SOẠN TRẠCH NHẬT</h5>
              </div>
              <div class="card-body d-block">
                <div class="text-left card-text">
                  <div class="d-table-cell pl-2" style="vertical-align: middle;">
                    <div class="row"><span class="col-12 dongcong"><div class="hidden" :tooltip="dong_cong_ly_giai.note"></div><div v-html="'<b>Ngày '+ngay_al.can_chi+':</b><br/>'+decodeURIComponent(dong_cong_ly_giai.nghi_ki)"></div></span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Bắt đầu: Trạng Trình - Nguyễn Bỉnh Khiêm -->
          <div class="col-md-6 khung p-0" id="trang_trinh">
            <div class="card" style="height: 100%;">
              <div class="card-header">
                <h5 class="title">TRẠNG TRÌNH - NGUYỄN BỈNH KHIÊM</h5>
              </div>
              <div class="card-body d-block">
                <div class="text-left card-text">
                  <div class="d-table-cell trangtrinh pl-2" style="vertical-align: middle;">
                    <div class="row">
                      <div class="col-6" v-for="(nbk, idx) in trang_trinh_ly_giai"><span class="note"><div class="hidden" :tooltip="nbk.y_nghia"></div>{{htmlDecode(nbk.cong_viec)}}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="row cham_ngon">
          <div class="col-lg-12 khung text-center p-0 font-italic">
            <div class="card">
              <div class="card-body khunginfotren" style="display: table;">
                <div class="col-12 text-center p-1" style="display: table-cell;font-style: normal;vertical-align: middle;">
                  <div style="display: inline-block;">
                      <div style="width: fit-content;">{{cham_ngon.noi_dung}}<div class="text-bold text-right font-italic">“{{cham_ngon.tac_gia}}”</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="clear h20 cham_ngon"></div>
      </div>
    `,
    style:`
      #dvxemngaytotxau .btn{
        color: #212529;
        padding: 1.2rem;
      }
      #dvxemngaytotxau .title {
          padding: 0px !important;
          margin: 0px !important;
          color: white !important;
          text-align: center;
          font-size: 12pt;
          font-weight: bold;
      }
      #dvxemngaytotxau .card-header {
        padding: 5px;
        background: #1c325c;
        border-radius: unset;
      }
      #dvxemngaytotxau .card-body {
        font-size: 10pt;
        display: table!important;
        padding: 5px;
      }
      #dvxemngaytotxau .card-text{
        display: table-row;
      }
      #dvxemngaytotxau .card {
        height: 100%;
        border: 1px solid rgba(240, 207, 33, 0.55);
        border-radius: unset;
      }
      .text-red{
        color: red;
      }
      .text-bold{
        font-weight: bold;
      }
      @media (min-width: 768px)
      {
        .col-sm-push-4 {
            left: 33.33333333%;
        }
        .col-sm-pull-4 {
            right: 33.33333333%;
        }
      }
      .lichamduong{
        position: absolute;
        background: #e8e8df;
        z-index: 1;
        border: 1px solid;
        padding: 10px;
        top: 30px;
        width: 100%;
        left: 0px;
      }
      .lichamduong .am {
          text-align: right;
          font-size: 75%;
          line-height: 100%;
          color: blue;
      }
      .dx-tooltip-wrapper{
          width: fit-content !important;
          position: static !important;
      }
      .dx-overlay-content{
        background: #e3e3e3;
        height: auto !important;
      }
      .dx-popup-content{
        border: 1px solid;
        padding: 9px;
        height: auto !important;
      }
      .dx-popup-content>p{
        display:none
      }
      .dx-popup-content li td,.note{text-transform: capitalize;}
      .dx-popup-content li{
        display: inline-block;
       text-align: center;
      }
      .dx-popup-content>table{
        background: transparent !important;
        text-align: center;
        font-family: inherit;
      }
      .bgcuutinh {
          width: 415px;
          height: 415px;
          background: url(app_images/web/bgcuutinh.png) no-repeat;
          background-size: contain;
      }
      .bgcuutinh .divcuutinh {
          padding: 100px;
          height: 415px;
          margin-left: -2px;
      }
      .bgcuutinh .divcuutinh .socuutinh {
          border: 1px dashed #000;
          width: 72px;
          height: 72px;
          float: left;
          text-align: center;
          font-size: 50px;
          line-height: 69px;
          background: rgba(253, 255, 125, 0.5);
      }
      .section>.container {
          padding: 15px !important;
          padding-top: 0px !important;
          padding-bottom: 0px !important;
      }
      .hidden {
        display: none;
      }
    `
}