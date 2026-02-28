# 🧪 HƯỚNG DẪN KIỂM THỬ SỬA CHỮA SYNC ISSUE

## 📋 PRE-TEST CHECKLIST

Trước khi test, đảm bảo:
- [ ] Code đã được compile: `pnpm build`
- [ ] No TypeScript errors
- [ ] Browser console không có errors

---

## 🧪 TEST PLAN

### TEST 1: Edit Service và Save
**Mục tiêu**: Kiểm tra mã hóa khi save

1. Mở admin → Services
2. Click edit một service có content HTML
3. Thay đổi nội dung HTML:
   ```html
   <h3>Test: <strong>Xin chào</strong></h3>
   <p>Nội dung đơn giản 123</p>
   ```
4. **Expected**: 
   - Database lưu: `csmEncrypt → encodeURIComponent` (URL-safe string)
   - Console: Không có error

**Kiểm tra Database**:
```sql
SELECT content FROM web_services WHERE slug='...' LIMIT 1;
-- Phải thấy: %... (URL encoded, không phải HTML)
```

---

### TEST 2: Load Form Edit
**Mục tiêu**: Kiểm tra giải mã khi load form

1. Mở lại service vừa edit
2. Click Edit
3. **Expected**:
   - Form hiển thị HTML content đúng (không phải URL encoded string)
   - Editor load nội dung gốc

**Console Check**:
```javascript
// Trong browser console, search logs từ HtmlEditorField
console.log('[HtmlEditorField] decrypted value should be HTML');
```

---

### TEST 3: Display Services Page
**Mục tiêu**: Kiểm tra hiển thị trên website

1. Truy cập `/services`
2. Xem category content
3. **Expected**:
   - HTML content hiển thị đúng (formatted HTML)
   - Không phải mã hóa/URL encoded string

**Kiểm tra Element**:
```javascript
// Trong DevTools → Elements
// Tìm div.category-content-intro
// Phải thấy: <h3>Test: <strong>Xin chào</strong></h3><p>...</p>
// Không phải: %...
```

---

### TEST 4: Round-trip Test
**Mục tiêu**: Kiểm tra luôn đồng bộ

1. **Bước 1**: Edit service (TEST 1)
2. **Bước 2**: Reload page
3. **Bước 3**: Xem services page (TEST 3)
4. **Bước 4**: Edit lại (TEST 2)
5. **Bước 5**: Save
6. **Bước 6**: Xem services page lại

**Expected**: Content HTML luôn giống nhau, không bị corrupted

---

### TEST 5: Code Editor (Nếu có code field)
**Mục tiêu**: Kiểm tra code field (JavaScript, HTML, etc.)

1. Edit service có code field
2. Nhập code:
   ```javascript
   function test() {
     console.log('Hello World %');
     return true;
   }
   ```
3. Save
4. Reload form
5. **Expected**: Code hiển thị đúng, kể cả ký tự `%`

---

### TEST 6: Special Characters
**Mục tiêu**: Kiểm tra ký tự đặc biệt

1. Edit service
2. Nhập HTML với ký tự đặc biệt:
   ```html
   <p>URL: https://example.com?a=1&b=2</p>
   <p>Symbol: % & # $</p>
   <p>Unicode: 中文 العربية</p>
   ```
3. Save
4. Reload form
5. Xem services page
6. **Expected**: Tất cả ký tự hiển thị đúng

---

### TEST 7: Long Content
**Mục tiêu**: Kiểm tra dữ liệu lớn

1. Edit service
2. Nhập HTML content dài (>5KB):
   ```html
   <h2>Tiêu đề</h2>
   <p>Nội dung lặp lại 100 lần...</p>
   ```
3. Save
4. Reload form
5. Xem services page
6. **Expected**: Tất cả content hiển thị đúng

---

## 🔍 DEBUG LOGS TO CHECK

### Console Logs từ Code

**HtmlEditorField:**
```javascript
[HtmlEditorField] Decrypt failed for key: content
// → Chỉ log này nếu có lỗi, bình thường không log
```

**CodeEditorField:**
```javascript
[CodeEditorField] Decrypt failed for key: code
// → Chỉ log này nếu có lỗi, bình thường không log
```

**wu_services.tsx - decodeHtml:**
```javascript
⚠️ csmDecrypt failed: ...
⚠️ decodeURIComponent failed: ...
// → Không nên thấy cái này, nếu thấy = có vấn đề
```

---

## 📊 CHECKLIST SAU KHI TEST

- [ ] TEST 1: Save HTML content ✅
- [ ] TEST 2: Load form edit ✅
- [ ] TEST 3: Display services page ✅
- [ ] TEST 4: Round-trip (edit → load → save → display) ✅
- [ ] TEST 5: Code editor ✅
- [ ] TEST 6: Special characters ✅
- [ ] TEST 7: Long content ✅
- [ ] Console không có errors ✅
- [ ] Database content URL-safe ✅

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: HTML vẫn là URL encoded
**Nguyên nhân**: `decodeHtml` hoặc `decodeHtmlField` không được gọi
**Giải pháp**: 
- Kiểm tra import `decodeHtml`
- Kiểm tra `dangerouslySetInnerHTML` dùng `decodeHtml` chưa

### Issue 2: Form edit hiển thị URL encoded
**Nguyên nhân**: HtmlEditorField không nhận biết form value
**Giải pháp**:
- Kiểm tra `hasFormValue` logic
- Xem console log decrypt error

### Issue 3: Double mã hóa (mã hóa lại khi save)
**Nguyên nhân**: `encodeHtmlField` trong submit handler chưa loại bỏ
**Giải pháp**:
- Xóa `encodeHtmlField` trong submit
- HtmlEditorField xử lý toàn bộ

### Issue 4: URL encode thất bại
**Nguyên nhân**: `encodeURIComponent` không được gọi trong `handleHtmlChange`
**Giải pháp**:
- Kiểm tra `handleHtmlChange` có `encodeURIComponent` chưa
- Tương tự cho `handleCodeChange`

---

## 💾 KIỂM TRA DATABASE

### Query Check
```sql
-- Kiểm tra cấu trúc dữ liệu
SELECT slug, domain, status, LENGTH(content) as content_length, 
       SUBSTRING(content, 1, 50) as content_sample
FROM web_services
LIMIT 5;

-- Phải thấy:
-- content_sample: %... (không phải HTML tags)
-- content_length: > 50
```

### Before/After
**Trước sửa** (SAI):
```
content: <h3>Test</h3><p>...</p>  ← Plain HTML (không mã hóa)
```

**Sau sửa** (ĐÚNG):
```
content: %encrypted%... ← URL-safe encrypted
```

---

## 🎯 FINAL VERIFICATION

Khi tất cả tests pass:

1. ✅ Services page hiển thị HTML content đúng
2. ✅ Form edit load content đúng
3. ✅ Database lưu dữ liệu URL-safe
4. ✅ Round-trip không corrupt dữ liệu
5. ✅ Không có console errors

---

## 📝 TEST REPORT TEMPLATE

```
# Test Report - SYNC Issue Fix

Date: [DATE]
Tester: [NAME]

## Results
- [ ] TEST 1: ✅/❌
- [ ] TEST 2: ✅/❌
- [ ] TEST 3: ✅/❌
- [ ] TEST 4: ✅/❌
- [ ] TEST 5: ✅/❌
- [ ] TEST 6: ✅/❌
- [ ] TEST 7: ✅/❌

## Issues Found
[List any issues]

## Notes
[Any observations]
```
