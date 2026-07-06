# DOCX template + PDF pipeline (CSM)

## 1) File mau de tai ve

- Mau DOCX: Mau_BaoCao_Docxtemplater.docx
- Data mau: Mau_BaoCao_Docxtemplater_data.json
- Trigger mau: Mau_trigger_report_db.js

## 2) Quy uoc tag trong DOCX (Docxtemplater)

- Bien don: {ten_cong_ty}, {so_bao_gia}, {tong_thanh_toan}
- Vong lap dong hang:
  - Mo: {#items}
  - Dong: {stt} {ten_hang} {dvt} {so_luong} {don_gia} {thanh_tien}
  - Dong: {/items}
- Anh logo: {%com_logo}

Luu y: ten tag trong DOCX phai trung 100% voi key trong object tra ve tu report_db.

## 3) Gan vao CSM de chay

1. Upload file Mau_BaoCao_Docxtemplater.docx len duong dan report_name/template_url ma menu dang dung.
2. Gan trigger report_db bang noi dung file Mau_trigger_report_db.js (chi lay body return object).
3. Dam bao m_configs.orientation, p_width, p_height phu hop kho giay.
4. Bam "Xem" trong man hinh report de render DOCX -> convert PDF.

## 4) Luong tu dong "Nap PDF mau -> sinh DOCX + trigger"

Trong code hien tai cua ban da co nen cho luong nay o frontend-admin:

- Tach layout PDF: src/components/production-order/line-items-pdf-layout.ts
- Import PDF va tao trigger seed: src/components/production-order/line-items-print-import.ts
- Tao DOCX skeleton: src/components/production-order/line-items-docx-template.ts
- Render DOCX voi image module: src/components/production-order/line-items-docx-print.ts

De dev dung lai nhieu lan, nen chuan hoa quy trinh sau:

1. User upload PDF mau.
2. Trich text + layout headers/signature.
3. Map sang blueprint chung (title, headerLines, tableHeaders, signatureLabels).
4. Sinh DOCX skeleton tu blueprint.
5. Sinh trigger report_db theo bo key quy chuan (items + totals + signatures).
6. Cho phep user review va chinh 2 file:
   - DOCX template
   - trigger report_db
7. Luu preset theo doc_type (bao_gia, lenh_sx, pxk) de tai su dung 1-click.

## 5) Checklist de ra PDF "giong het"

- Font trong DOCX trung voi mau (Times New Roman/Arial...)
- Khoang cach dong, margin, border table canh tay
- Ten nhan header/signature giong 100%
- So cot va do rong cot trung mau
- Dinh dang so tien da format truoc khi dua vao tag

## 6) Loi thuong gap

- DOCX khong render: report_name tro toi file khong phai docx that
- Anh logo khong len: URL anh khong truy cap duoc
- Table khong lap: quen cap {#items} ... {/items}
- Tag mat gia tri: key trong object khong trung ten tag
