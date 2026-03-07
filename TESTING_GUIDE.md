# Dynamic Menu Testing Guide

## Step-by-Step Testing Procedures

### Test 1: Dynamic Link Menu (External URL)

**Setup**:
1. Go to System → Menu
2. Click "Add" button
3. Fill in basic info:
   - Name (VI): "Truy Cập Google"
   - Name (EN): "Visit Google"
   - Name (ZH): "访问谷歌"
   - Path: `/external-link` (optional)
4. Under "Cài đặt hiển thị dữ liệu":
   - **Thể hiện theo**: Select "Liên kết động (Dynamic Link)"
5. Under "Cài đặt hiển thị nâng cao":
   - **Đường dẫn Link Động**: `https://google.com`
6. Save

**Test**:
- Click menu item in sidebar → Should open Google in new window ✓

---

### Test 2: Dynamic Link Menu (Internal Route)

**Setup**:
1. Add new menu item
2. Basic info:
   - Name: "Quay về Home"
   - Path: `/internal-link`
3. Under "Cài đặt hiển thị dữ liệu":
   - **Thể hiện theo**: "Liên kết động"
4. Under "Cài đặt hiển thị nâng cao":
   - **Đường dẫn Link Động**: `/home`
5. Save

**Test**:
- Click menu → Should navigate to home page ✓

---

### Test 3: Dynamic Code Menu (Simple HTML)

**Step 1: Create Code Template in sys_autos**

Open database console or use API:
```sql
-- Option 1: Via Database
INSERT INTO sys_autos (p_name, p_type, p_code, p_status) 
VALUES (
  'test_hello_world',
  0,
  '/* Insert encrypted code here */',
  1
);
```

**Step 2: Encrypt Code**

In browser console:
```javascript
// Raw code
const code = `
const container = document.getElementById('dynamic-code-root');
container.innerHTML = '<h1 style="color: #1890ff; padding: 20px;">Hello from Dynamic Code!</h1>';
window.thongbao('Code executed successfully!');
`;

// Encrypt it
const encrypted = window.csmCrypto?.encrypt(code);
console.log('Encrypted:', encrypted);
// Copy the encrypted value
```

**Step 3: Update sys_autos**

```sql
UPDATE sys_autos 
SET p_code = 'PASTE_ENCRYPTED_VALUE_HERE'
WHERE p_name = 'test_hello_world';
```

**Step 4: Create Menu**

1. System → Menu → Add
2. Basic info:
   - Name (VI): "Test Code - Hello"
   - Path: `/test-hello`
3. Under "Cài đặt hiển thị dữ liệu":
   - **Thể hiện theo**: Select "Chạy code động (Dynamic Code)"
4. Under "Cài đặt hiển thị nâng cao":
   - **Template Code Động**: Should see dropdown with "test_hello_world"
   - Select it
5. Save

**Test**:
- Click menu → Should display blue heading "Hello from Dynamic Code!" ✓
- Should show success notification ✓

---

### Test 4: Dynamic Code Menu (Fetch Data)

**Step 1: Create Code Template**

```javascript
const code = `
async function loadUsers() {
  const container = document.getElementById('dynamic-code-root');
  container.innerHTML = '<p>Loading...</p>';
  
  try {
    const res = await seft.getTableData({
      app_id: seft.appId,
      obj_name: 'csm_accounts',
      take: 10
    });
    
    const rows = res?.rows || res?.data || [];
    const html = '<table style="width:100%; border-collapse: collapse;">';
    
    rows.forEach(row => {
      html += '<tr>' +
        '<td style="padding: 8px; border: 1px solid #ddd;">' + (row.username || 'N/A') + '</td>' +
        '<td style="padding: 8px; border: 1px solid #ddd;">' + (row.email || 'N/A') + '</td>' +
      '</tr>';
    });
    html += '<table>';
    
    container.innerHTML = '<h2>Users List</h2>' + html;
    window.thongbao('Loaded ' + rows.length + ' users');
  } catch (err) {
    window.canhbao('Error: ' + err.message);
  }
}

loadUsers();
`;

// In browser console:
const encrypted = window.csmCrypto?.encrypt(code);
console.log(encrypted);
```

**Step 2: Create sys_autos record and Menu**

```sql
INSERT INTO sys_autos (p_name, p_type, p_code, p_status) 
VALUES ('fetch_users_list', 0, 'ENCRYPTED_CODE', 1);
```

Then create menu with type=4, selecting "fetch_users_list"

**Test**:
- Click menu → Should display list of users ✓
- Should show notification with count ✓

---

### Test 5: Dynamic Code Menu (React Component)

**Step 1: Create Code Template**

```javascript
const code = `
function Dashboard() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div style={{ padding: 20, background: window.csmTheme.getCardBackground() }}>
      <h2>Dashboard Counter</h2>
      <p>Count: {count}</p>
      <button 
        onClick={() => setCount(count + 1)}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Increment
      </button>
      <p style={{ marginTop: 16, color: '#666' }}>
        Menu ID: {seft.menuId} | User: {seft.user?.username}
      </p>
    </div>
  );
}

DynamicCodeHelpers.renderComponent(Dashboard);
`;

// Encrypt in console
const encrypted = window.csmCrypto?.encrypt(code);
```

**Step 2: Setup and Test**

Create sys_autos + menu as above

**Test**:
- Click menu → Should display React component ✓
- Click button → Counter increments ✓
- Background color should match theme ✓

---

### Test 6: Error Handling

**Test Case 6a: Invalid Code**

Code template:
```javascript
const code = `
throw new Error('Intentional error for testing');
`;

const encrypted = window.csmCrypto?.encrypt(code);
```

- Click menu → Should show error alert ✓
- Check browser console for error details ✓

**Test Case 6b: Missing Template**

1. Create menu with type=4
2. Don't select a template (leave empty)
3. Try to click menu

Expected: Should show alert "Template Code Động is required" ✓

**Test Case 6c: Template Not Found**

1. Create menu with type=4
2. Select a template that doesn't exist
3. Click menu

Expected: Should show error message about template not found in sys_autos ✓

---

### Test 7: Theme Integration

**Code Template**:
```javascript
const code = `
const bg = window.csmTheme?.getBackgroundColor();
const text = window.csmTheme?.getTextColor();
const isDark = window.csmTheme?.isDark;

const container = document.getElementById('dynamic-code-root');
container.style.background = bg;
container.style.color = text;
container.innerHTML = \`
  <div style="padding: 20px;">
    <h3>Theme Info</h3>
    <p>Dark Mode: <strong>\${isDark ? 'Yes' : 'No'}</strong></p>
    <p>Background: <code>\${bg}</code></p>
    <p>Text Color: <code>\${text}</code></p>
  </div>
\`;
`;

const encrypted = window.csmCrypto?.encrypt(code);
```

- Click in light mode → Background white, text black ✓
- Toggle to dark mode → Background dark, text white ✓
- Reload → Colors persist with theme preference ✓

---

### Test 8: API Integration in Code

**Code Template**:
```javascript
const code = `
const { getTableData, updateTableData } = seft;

async function demo() {
  // Fetch
  const res = await getTableData({
    app_id: seft.appId,
    obj_name: 'csm_accounts',
    take: 1
  });
  
  const rows = res?.rows || res?.data || [];
  if (rows.length > 0) {
    const user = rows[0];
    const container = document.getElementById('dynamic-code-root');
    container.innerHTML = \`<p>First user: <strong>\${user.username}</strong></p>\`;
  }
}

demo().catch(err => window.canhbao(err.message));
`;

const encrypted = window.csmCrypto?.encrypt(code);
```

- Click menu → Should display first user's username ✓
- Check browser network tab → API call successful ✓

---

## Automated Testing (Optional)

### Browser Console Test Script

```javascript
// Run in browser console to validate setup

console.log('🧪 Dynamic Menu System Tests');
console.log('============================\n');

// Test 1: Check window.csmCrypto
console.log('✓ Test 1: Encryption API');
console.log(typeof window.csmCrypto?.encrypt === 'function' ? '  PASS' : '  FAIL');

// Test 2: Check theme
console.log('\n✓ Test 2: Theme API');
console.log(window.csmTheme ? '  PASS' : '  FAIL');
console.log('  isDark:', window.csmTheme?.isDark);
console.log('  Primary Color:', window.csmTheme?.themeColorPrimary);

// Test 3: Check CSM APIs
console.log('\n✓ Test 3: CSM API Methods');
console.log(typeof window.csmApi?.getTableData === 'function' ? '  PASS' : '  FAIL');

// Test 4: Check container
console.log('\n✓ Test 4: Dynamic Code Container');
const container = document.getElementById('dynamic-code-root');
console.log(container ? '  PASS' : '  FAIL');

// Test 5: Encryption/Decryption round-trip
console.log('\n✓ Test 5: Encryption Round-Trip');
const testCode = 'const x = 1;';
const encrypted = window.csmCrypto?.encrypt(testCode);
const decrypted = window.csmCrypto?.decrypt(encrypted);
console.log(decrypted === testCode ? '  PASS' : '  FAIL');

console.log('\n============================');
console.log('Test suite complete!');
```

---

## Common Test Issues & Solutions

| Issue | Solution |
|-------|----------|
| sys_autos options dropdown empty | Refresh page, verify sys_autos records have p_type=0 |
| Code doesn't execute | Check browser console for error, verify code is valid JS |
| Template not found error | Verify sys_autos p_name matches exactly (case-sensitive) |
| Theme colors undefined | Use safe check: `window.csmTheme?.getBackgroundColor?.()` |
| Encrypted code error | Verify code was encrypted before storing in sys_autos |
| External link opens in same tab | Make sure URL starts with `http://` or `https://` |
| Menu doesn't show | Check `m_show` is set to 1 (Show = Yes) |

---

## Screenshots/Expected Output

### Type 3 - Dynamic Link
```
User clicks menu "Truy Cập Google"
↓
New browser tab opens to google.com
✓ PASS
```

### Type 4 - Dynamic Code (Simple HTML)
```
User clicks menu "Test Code"
↓
Container displays:
"Hello from Dynamic Code!"
✓ Success notification appears
✓ PASS
```

### Type 4 - Dynamic Code (Data Fetch)
```
User clicks menu "Load Users"
↓
Container displays table:
| Username | Email |
|----------|-------|
| admin | admin@... |
...
✓ Shows count notification
✓ PASS
```

---

## Quick Validation Checklist

After implementation, verify:

- [ ] Menu form has "Liên kết động" option (type 3)
- [ ] Menu form has "Chạy code động" option (type 4)
- [ ] When type 4 selected, "Template Code Động" dropdown appears
- [ ] When type 3 selected, "Đường dẫn Link Động" input appears
- [ ] sys_autos dropdown loads with p_type=0 records
- [ ] Dynamic code page route works: `/system/dynamic-code/:menuId`
- [ ] Code execution doesn't block UI (loading indicator shows)
- [ ] Error messages display for invalid templates
- [ ] Theme colors accessible in code context
- [ ] External links open in new window
- [ ] Internal links navigate correctly

---

## Performance Validation

Run these browser DevTools tests:

```javascript
// Measure code execution time
console.time('code-exec');
// ... click dynamic code menu ...
console.timeEnd('code-exec');
// Should be < 100ms

// Check network tab
// Should see 1 API call to /getTableData for loading template
```

---

**Last Updated**: March 7, 2026
**Version**: 1.0
