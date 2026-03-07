# Dynamic Menu System - Implementation Guide

## Overview

The menu system has been extended to support **4 display types** instead of just 2:

1. **Type 1: Data Table Grid** (Dạng bảng) - Display tabular data
2. **Type 2: Master-Detail Form** (Dạng Form Master-Detail) - Hierarchical data with master and detail records
3. **Type 3: Dynamic Link** (Liên kết động) - Redirect to external or internal URLs with dynamic computation
4. **Type 4: Dynamic Code** (Chạy code động) - Execute JavaScript code from sys_autos templates

## Architecture

### Files Modified

#### 1. **Frontend Menu Declaration (detail.tsx)**
- **File**: `/frontend/src/pages/system/menu/components/detail.tsx`
- **Changes**:
  - Added `sys_autos` data loading via `getTableData()` API
  - Extended `type_form` select options to include Type 3 and Type 4
  - Added conditional rendering for `auto_code_name` selector (appears when type_form=4)
  - Added conditional rendering for `dynamic_link_url` input (appears when type_form=3)
  - Added alert messages explaining each type behavior

**Key Features**:
```typescript
// Load sys_autos (p_type=0) code templates on modal open
useEffect(() => {
  if (!open) return;
  // Fetch from sys_autos where p_type=0
  // Build options list with p_name values
}, [open]);

// Show auto_code_name selector only for type_form=4
<ProFormDependency name={["type_form"]}>
  {(values) => {
    if (values.type_form === 4) {
      return <ProFormSelect name="auto_code_name" .../>;
    }
  }}
</ProFormDependency>
```

#### 2. **Menu Item Type Definition (types.ts)**
- **File**: `/frontend/src/api/system/menu/types.ts`
- **New Fields**:
  - `auto_code_name?: string` - Reference to sys_autos p_name for dynamic code
  - `dynamic_link_url?: string` - URL for dynamic link navigation
  - Updated `type_form` comment to reflect new types (3, 4)

#### 3. **Menu Type Resolver Utility**
- **File**: `/frontend/src/pages/system/menu/utils/menu-type-resolver.ts` (NEW)
- **Exports**:
  - `MenuFormType` enum with values TABLE(1), MASTER_DETAIL(2), DYNAMIC_LINK(3), DYNAMIC_CODE(4)
  - `getMenuFormTypeLabel()` - Get display label for each type
  - `resolveMenuRoute()` - Determine routing based on type_form
  - `isDynamicLinkMenu()`, `isDynamicCodeMenu()` - Type checking helpers
  - `getMenuNavigationTarget()` - Calculate navigation target (URL or route)
  - `shouldOpenInNewWindow()` - Check if link should open externally

#### 4. **Dynamic Code Menu Component**
- **File**: `/frontend/src/pages/system/dynamic-code/index.tsx` (NEW)
- **Features**:
  - Loads code template from sys_autos via `auto_code_name`
  - Decrypts `p_code` using `csmDecrypt()`
  - Executes JavaScript code with `seft` runtime context
  - Exposes theme and API globals like `home/index.tsx`
  - Provides error handling and loading states

**Runtime Context (seft)**:
```javascript
{
  appId,           // Application ID
  menuId,          // Current menu ID
  user,            // Current user info
  t,               // Translation function
  ...CsmApi        // All CSM API methods
}
```

**Helpers**:
```typescript
DynamicCodeHelpers = {
  renderComponent,  // Render React component to #dynamic-code-root
  getContainer,     // Get container element for DOM manipulation
  log,              // Prefixed logging
  showError,        // Show error notification
  showSuccess       // Show success notification
}
```

#### 5. **Menu Navigation Handler (use-menu.ts)**
- **File**: `/frontend/src/layout/layout-menu/use-menu.ts`
- **Changes**:
  - Added handling for type_form === 3 (Dynamic Link)
    - Detects external URLs (http/https) and opens in new window
    - Routes internal paths (starting with /) via navigate()
    - Supports relative URLs
  - Added handling for type_form === 4 (Dynamic Code)
    - Routes to `/system/dynamic-code/{menuId}`
    - Passes menu data in location state
    - Updates user store with selected menu ID

#### 6. **Router Configuration (system.ts)**
- **File**: `/frontend/src/router/routes/modules/system.ts`
- **New Route**:
  ```typescript
  {
    path: "/system/dynamic-code/:menuId",
    Component: DynamicCode,
    handle: {
      icon: "CodeOutlined",
      title: "Dynamic Code Menu",
    }
  }
  ```

## Usage Guide

### Creating a Table Menu
1. Go to System → Menu
2. Add new menu item
3. Under "Cài đặt hiển thị dữ liệu" (Data Display Settings):
   - Set **Thể hiện theo** (Type) = "Dạng bảng" (Table)
   - Enter **Tên bảng** (Table Name)
   - Configure field structure
4. Save

### Creating a Master-Detail Menu
1. Add new menu item
2. Under "Cài đặt hiển thị dữ liệu":
   - Set **Thể hiện theo** (Type) = "Dạng Form Master-Detail"
   - Enter **Tên bảng** (Master Table Name)
   - Add child menus for detail tables
3. Configure detail table links under "Cài đặt hiển thị nâng cao"

### Creating a Dynamic Link Menu
1. Add new menu item
2. Under "Cài đặt hiển thị dữ liệu":
   - Set **Thể hiện theo** (Type) = "Liên kết động" (Dynamic Link)
3. Under "Cài đặt hiển thị nâng cao":
   - Enter **Đường dẫn Link Động** (Dynamic Link URL)
   - Examples:
     - External: `https://example.com`
     - Internal: `/home`
     - Relative: `admin/dashboard`
4. Save

### Creating a Dynamic Code Menu
1. **First**, create code template in sys_autos:
   - Table: `sys_autos`
   - Fields:
     - `p_name`: Template name (e.g., "broadcast_dashoard")
     - `p_type`: Set to `0`
     - `p_code`: JavaScript code (encrypted with csmEncrypt)
   - Example code:
     ```javascript
     const container = document.getElementById('dynamic-code-root');
     const div = document.createElement('div');
     div.innerHTML = '<h1>Hello from ' + seft.menuId + '</h1>';
     container.appendChild(div);
     ```

2. In Menu:
   - Add new menu item
   - Under "Cài đặt hiển thị dữ liệu":
     - Set **Thể hiện theo** (Type) = "Chạy code động" (Dynamic Code)
   - Under "Cài đặt hiển thị nâng cao":
     - Select **Template Code Động** (Auto Code Name) - dropdown with sys_autos p_type=0 records
3. Save

## Code Template Examples

### Simple HTML Display
```javascript
const container = seft.getContainer?.() || document.getElementById('dynamic-code-root');
container.innerHTML = `
  <div style="padding: 20px;">
    <h2>Menu: ${seft.menuId}</h2>
    <p>User: ${seft.user?.username}</p>
  </div>
`;
```

### Using Window APIs
```javascript
// Access notifications
window.thongbao('Success message');
window.canhbao('Warning message');

// Access theme
const bgColor = window.csmTheme?.getBackgroundColor();
```

### Fetching Data and Rendering
```javascript
const { getTableData, andWhere } = seft;

const response = await getTableData({
  app_id: seft.appId,
  obj_name: 'my_table',
  where: andWhere([
    { field: 'status', type: 'eq', value: 1 }
  ]),
  take: 10
});

const rows = response?.rows || response?.data || [];
console.log('Fetched rows:', rows);
```

### Rendering React Components
```javascript
const { renderComponent } = DynamicCodeHelpers;

function MyDashboard({ menuId, user }) {
  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ color: window.csmTheme.themeColorPrimary }}>
        Dashboard for {menuId}
      </h1>
      <p>User: {user?.username}</p>
    </div>
  );
}

renderComponent(MyDashboard, {
  menuId: seft.menuId,
  user: seft.user
});
```

## Translation Keys

The following translation keys should be added to your i18n files:

```typescript
{
  'system.menu.autoCodeTemplate': 'Template Code Động',
  'system.menu.dynamicLinkUrl': 'Đường dẫn Link Động',
  'system.menu.typeForm.dynamicLink': 'Liên kết động (Dynamic Link)',
  'system.menu.typeForm.dynamicCode': 'Chạy code động (Dynamic Code)',
}
```

## Security Considerations

1. **Code Execution**: Dynamic code runs in client browser with full access to APIs
   - Only allow trusted admins to create/modify code templates
   - Consider code review process for templates
   - Use `g_readonly` flag to prevent accidental data modification

2. **Data Access**: The `seft` context includes all CSM APIs
   - Code can access any table the user has permission to access
   - Consider using role-based access in code itself

3. **Encryption**: Code in sys_autos is stored encrypted
   - Use `csmEncrypt()` when storing
   - Use `csmDecrypt()` when retrieving (automatic in component)

## Testing

### Test Dynamic Link
1. Create menu with type=3
2. Set URL to `/home`
3. Click menu → should navigate to home
4. Set URL to external link → should open in new window

### Test Dynamic Code
1. Create sys_autos record:
   - `p_name: "test_code"`
   - `p_type: 0`
   - `p_code: csmEncrypt("document.body.innerHTML = '<h1>Test</h1>';")`
2. Create menu with type=4
3. Select "test_code" template
4. Click menu → should execute code and display result

### Test Error Handling
1. Create code with syntax error
2. Click menu → should show error alert
3. Check browser console for details

## Migration from Vue Components

If migrating `v_link` Vue components to dynamic code:

1. Extract Vue component code to JavaScript
2. Use `renderComponent()` helper for React conversion if needed
3. Or use direct DOM manipulation via container element
4. Test thoroughly in dynamic code context

## Troubleshooting

### Code not executing
- Check sys_autos record exists
- Verify `p_type=0` filter
- Check browser console for errors
- Ensure code is not empty

### Dynamic link not routing
- Check `dynamic_link_url` is set
- External URLs must start with `http://` or `https://`
- Internal paths must start with `/`

### Theme colors not available
- Ensure `window.csmTheme` is defined
- Check theme sync useEffect in component
- Use fallback colors if theme unavailable

## Performance Optimization

1. **Lazy Loading**: Code templates are only fetched when menu opens
2. **Memoization**: Use `useMemo` for expensive calculations
3. **Async Loading**: Code execution is deferred via `setTimeout`
4. **Cleanup**: Use effect cleanup to prevent memory leaks

## Future Enhancements

Possible improvements for future versions:
- Code template versioning
- Scheduled code execution
- Code testing/preview environment
- Template marketplace/library
- Performance monitoring for dynamic code
- Code snippets/templates library
