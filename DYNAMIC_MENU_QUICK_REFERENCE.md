# Dynamic Menu Quick Reference

## Menu Type Selection Guide

| Type | Label | Use Case | Config Required |
|------|-------|----------|-----------------|
| **1** | Dạng bảng (Table) | Display data in table format with CRUD operations | `table_name` |
| **2** | Master-Detail | Parent-child relationship with cascading data | `table_name`, child menus |
| **3** | Liên kết động (Dynamic Link) | Redirect to external/internal URL | `dynamic_link_url` |
| **4** | Chạy code động (Dynamic Code) | Execute custom JavaScript | `auto_code_name` (from sys_autos) |

## Quick Setup Checklist

### ✅ Table Menu Setup
- [ ] Menu name in all languages (VI/EN/ZH)
- [ ] Select "Dạng bảng" for type_form
- [ ] Enter table name
- [ ] Configure fields (columns) in tab "Fields"
- [ ] Configure triggers if needed (optional)
- [ ] Save and test

### ✅ Master-Detail Menu Setup
- [ ] Menu name in all languages
- [ ] Select "Dạng Form Master-Detail" for type_form
- [ ] Enter master table name
- [ ] Add child menus for detail records
- [ ] Link fields using field_root in advanced settings
- [ ] Configure field structure for each level
- [ ] Save and test

### ✅ Dynamic Link Menu Setup
- [ ] Menu name in all languages
- [ ] Select "Liên kết động" for type_form
- [ ] Enter URL in "Đường dẫn Link Động" field
- [ ] Test: Click menu → should navigate/redirect
- [ ] For external URLs: use full URL with http/https
- [ ] For internal routes: use /path format

### ✅ Dynamic Code Menu Setup
- [ ] **Create code template in sys_autos first**:
  - Table: `sys_autos`
  - Fields: `p_name`, `p_type=0`, `p_code` (encrypted)
  - Example: `p_name="dashboard_home"`, `p_code=csmEncrypt(code_string)`
- [ ] Menu name in all languages
- [ ] Select "Chạy code động" for type_form
- [ ] Select template from "Template Code Động" dropdown
- [ ] Test: Click menu → code should execute

## Code Template Encryption

### Encrypt Code for sys_autos
```javascript
// In browser console or code:
const code = `
  const div = document.getElementById('dynamic-code-root');
  div.innerHTML = '<h1>Hello Dashboard</h1>';
`;
const encrypted = window.csmCrypto?.encrypt(code);
// Copy encrypted value to sys_autos.p_code
```

### Decrypt for Testing
```javascript
const encrypted = "...from sys_autos p_code...";
const decrypted = window.csmCrypto?.decrypt(encrypted);
console.log(decrypted); // Original code
```

## Code Template Variables

### Available in Dynamic Code Context (`seft`)
```javascript
seft.appId              // Current app ID
seft.menuId             // Current menu ID
seft.user               // User object {username, email, ...}
seft.t                  // Translation function: t('key')
seft.getTableData       // Fetch data API
seft.updateTableData    // Update data API
seft.andWhere           // Query builder helper
// ... all CsmApi methods
```

### Available Globally
```javascript
window.csmTheme              // Theme object
window.csmTheme.isDark       // Dark mode flag
window.csmTheme.themeColorPrimary  // Primary color
window.csmTheme.getBackgroundColor()
window.csmTheme.getTextColor()

window.csmApi                // API methods
window.csmCurrentUser        // Current user
window.thongbao(msg)        // Success notification
window.canhbao(msg)         // Warning notification
```

### Container Element
```javascript
// For DOM manipulation
const container = document.getElementById('dynamic-code-root');
// Or use React rendering
DynamicCodeHelpers.renderComponent(MyComponent, props);
```

## Common Code Templates

### 1. Simple Information Display
```javascript
const container = document.getElementById('dynamic-code-root');
container.innerHTML = `
  <div style="padding: 20px; background: ${window.csmTheme.getCardBackground()};">
    <h2>Dashboard</h2>
    <p>User: ${seft.user?.username}</p>
    <p>Menu: ${seft.menuId}</p>
  </div>
`;
```

### 2. Fetch and Display Data
```javascript
const { getTableData, andWhere } = seft;

async function loadData() {
  const res = await getTableData({
    app_id: seft.appId,
    obj_name: 'my_table',
    where: andWhere([{ field: 'status', type: 'eq', value: 1 }]),
    take: 20
  });
  
  const rows = res?.rows || res?.data || [];
  const html = rows.map(row => `<tr><td>${row.name}</td></tr>`).join('');
  document.getElementById('dynamic-code-root').innerHTML = `<table>${html}</table>`;
}
loadData().catch(err => window.canhbao(err.message));
```

### 3. React Component Rendering
```javascript
function Dashboard() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Dynamic Dashboard</h1>
      <p>Menu ID: {seft.menuId}</p>
    </div>
  );
}

DynamicCodeHelpers.renderComponent(Dashboard);
```

### 4. Interactive Form
```javascript
const container = document.getElementById('dynamic-code-root');
container.innerHTML = `
  <form style="padding: 20px;">
    <input id="name-input" placeholder="Enter name" />
    <button id="submit-btn">Submit</button>
    <div id="result"></div>
  </form>
`;

document.getElementById('submit-btn').onclick = async (e) => {
  e.preventDefault();
  const name = document.getElementById('name-input').value;
  const { updateTableData } = seft;
  
  try {
    const res = await updateTableData({
      app_id: seft.appId,
      obj_name: 'my_table',
      command: 'insert',
      obj_update: { name }
    });
    document.getElementById('result').innerHTML = res.message || 'Saved!';
  } catch (err) {
    window.canhbao(err.message);
  }
};
```

## Troubleshooting

### Menu not showing
- **Issue**: Menu hidden because `m_show=false`
  - **Fix**: In menu editor, set "Hiện" = "Có" (Show = Yes)
- **Issue**: Menu dev-only, current user not admin
  - **Fix**: In menu editor, set "dev" flag appropriately

### Dynamic Link not working
- **Issue**: Page doesn't navigate
  - **Fix**: Check URL format
    - External: `https://example.com`
    - Internal: `/admin/dashboard`
- **Issue**: Opens in current tab instead of new
  - **Fix**: For new window, must use external URL (http/https)

### Dynamic Code
- **Issue**: Code doesn't execute or shows error
  - **Fix**: Check browser console for error details
  - **Fix**: Verify sys_autos record exists with correct `p_name`
  - **Fix**: Make sure `p_type=0` filter matches
- **Issue**: Template not showing in dropdown
  - **Fix**: Reload page (modal caches options)
  - **Fix**: Verify sys_autos record has `p_type=0`
- **Issue**: Data not loading in code
  - **Fix**: Check `seft.getTableData()` response format
  - **Fix**: Use `res?.rows || res?.data` fallback
- **Issue**: Theme colors undefined
  - **Fix**: Use safe getter: `window.csmTheme?.getBackgroundColor()`

## Performance Tips

1. **Data Pagination**: Always use `take` parameter
   ```javascript
   getTableData({ ..., take: 50 }) // Don't load all rows
   ```

2. **Caching**: Store frequently-used data in variables
   ```javascript
   // Good
   const rows = await getTableData(...);
   rows.forEach(...); // Reuse rows
   
   // Bad
   for (...) {
     await getTableData(...); // Each loop iteration fetches
   }
   ```

3. **Debounce**: For event handlers
   ```javascript
   let timeoutId;
   element.addEventListener('input', () => {
     clearTimeout(timeoutId);
     timeoutId = setTimeout(() => doSearch(), 300);
   });
   ```

4. **Conditional Rendering**: Only render necessary elements
   ```javascript
   const html = rows.length > 0 
     ? rows.map(r => renderRow(r)).join('')
     : '<p>No data</p>';
   ```

## Security Best Practices

1. **Validate Input**: Always validate user input before API calls
   ```javascript
   const input = document.getElementById('field').value?.trim();
   if (!input) { window.canhbao('Required'); return; }
   ```

2. **Check Permissions**: Consider user roles in code
   ```javascript
   if (seft.user?.role !== 'admin') {
     window.canhbao('Unauthorized'); return;
   }
   ```

3. **Sanitize HTML**: If injecting HTML dynamically
   ```javascript
   // Avoid:
   container.innerHTML = userInput; // XSS risk
   
   // Safe:
   const div = document.createElement('div');
   div.textContent = userInput;
   container.appendChild(div);
   ```

4. **Error Handling**: Always catch and handle errors
   ```javascript
   try {
     // API calls
   } catch (err) {
     window.canhbao('Error: ' + err.message);
     console.error(err);
   }
   ```

## Useful API Methods

### Data Operations
```javascript
// Fetch data
seft.getTableData({ obj_name, where, take })

// Update records
seft.updateTableData({ obj_name, command: 'update', obj_update, pk_fields })

// Insert using form builder
seft.andWhere([{ field, type, value }])
```

### Notifications
```javascript
window.thongbao('Success message')  // Green
window.canhbao('Warning message')   // Orange
```

### Theme Access
```javascript
window.csmTheme.isDark                    // Boolean
window.csmTheme.themeColorPrimary         // Color string
window.csmTheme.getBackgroundColor()      // #ffffff or #141414
window.csmTheme.getTextColor()            // #000000 or #ffffff
```

### Translation
```javascript
seft.t('key', 'fallback text')
seft.t('common.save', 'Save')
```

## Resources

- **Full Documentation**: See `DYNAMIC_MENU_IMPLEMENTATION.md`
- **Examples**: Check `broadcast_analytics_rocksdb.js` for reference code
- **API Reference**: `#src/components/csm-grid/CsmApi`
- **Type Definitions**: `#src/api/system/menu/types.ts`
