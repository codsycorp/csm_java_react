# HỆ THỐNG CRM & BROADCAST DASHBOARD - HƯỚNG DẪN SỬ DỤNG

## 📋 TỔNG QUAN

Hệ thống CRM (Customer Relationship Management) tích hợp đầy đủ với các tính năng:

### ✨ Tính năng chính

1. **Quản lý khách hàng tự động**
   - Tự động tạo customer record khi khách để số điện thoại trong chat
   - Theo dõi từ lượt truy cập → chat → chuyển đổi
   - Phân bổ khách cho nhân viên chăm sóc
   - Quản lý trạng thái: new, contacted, interested, purchased, cancelled

2. **Thông tin khách hàng đầy đủ**
   - Tên, Số điện thoại, Email
   - Ngày sinh (tự động nhắc sinh nhật)
   - Nick Zalo, Nick Facebook
   - Sản phẩm đã mua
   - Nhân viên tư vấn
   - Lịch sử liên hệ
   - Số nhân viên đã tiếp xúc

3. **Thống kê Website**
   - Số bài đăng lên web trong ngày
   - Lượt xem (page views)
   - Google bot visits
   - Thời gian truy cập trung bình
   - Tỷ lệ bounce

4. **Quản lý Quảng cáo**
   - Tạo và quản lý quảng cáo Facebook/Google
   - Thống kê hiệu quả: impressions, clicks, conversions
   - Biểu đồ phân tích ROI
   - Chi phí và ngân sách

5. **Broadcast Notification**
   - Gửi thông báo đến tất cả users của app
   - Quản lý lịch sử broadcast

6. **Broadcast Page Dynamic Code**
   - Chạy code động từ `sys_autos` như `AutoSetup.tsx`
   - Tùy chỉnh UI/UX linh hoạt theo app_id

---

## 🚀 CÀI ĐẶT VÀ SỬ DỤNG

### Bước 1: Backend APIs đã sẵn sàng

`Lưu ý bảo mật bắt buộc (giống các API nội bộ khác):`

- Tất cả endpoint `/crm/*` chạy sau lớp JWT auth của hệ thống, không cho anonymous truy cập.
- `appId/app_id` từ client không còn là nguồn tin cậy tuyệt đối.
- Backend tự chuẩn hóa `appId` theo user đang đăng nhập (tenant isolation).
- User thường chỉ được thao tác dữ liệu CRM trong chính `app_id` của họ.
- Chỉ `csm admin/dev` mới được phép truy cập chéo tenant (khi truyền `appId` mục tiêu).

`Quy ước multi-tenant:`

- Luôn gửi `appId` ở request để rõ ngữ cảnh, nhưng backend sẽ kiểm tra và ghi đè nếu không hợp lệ.
- Không dùng chung dữ liệu CRM giữa các app, mỗi `app_id` là một không gian dữ liệu độc lập.
- Khi backend nhận request CRM, tham số nội bộ luôn được normalize về cặp `appId` + `app_id` trước khi xử lý.

Các API endpoint sau đã được tạo tự động:

#### CRM Customer APIs
```
POST   /crm/customer              - Tạo/cập nhật customer
GET    /crm/customer              - Lấy chi tiết customer (params: phone, appId)
POST   /crm/customers             - Lấy danh sách customers
POST   /crm/customer/assign       - Phân bổ customer cho nhân viên
POST   /crm/customer/status       - Cập nhật trạng thái customer
POST   /crm/customer/purchase     - Thêm sản phẩm đã mua
POST   /crm/customer/contact      - Ghi nhận lịch sử liên hệ
POST   /crm/birthdays             - Lấy khách có sinh nhật sắp tới
```

#### Thống kê APIs
```
POST   /crm/stats                 - Thống kê CRM tổng quan
POST   /crm/website-stats         - Thống kê website (posts, views, bot)
POST   /crm/ads-stats             - Thống kê quảng cáo Facebook/Google
```

#### Quảng cáo APIs
```
POST   /crm/ads                   - Tạo quảng cáo mới
GET    /crm/ads                   - Lấy danh sách quảng cáo
```

### Bước 2: Database Tables tự động tạo

Các bảng sau sẽ được tạo tự động khi khởi động server:

1. **crm_customers** - Thông tin khách hàng
2. **crm_purchases** - Sản phẩm đã mua
3. **crm_contact_history** - Lịch sử liên hệ
4. **crm_ads** - Quảng cáo Facebook/Google
5. **web_stats** - Thống kê truy cập website

### Bước 3: Tích hợp Chat với CRM

**Tự động tracking:** Khi khách chat và để số điện thoại, hệ thống tự động:
- Tạo customer record trong `crm_customers`
- Ghi nhận source = "chat"
- Status = "new"
- Lưu tin nhắn đầu tiên vào notes

### Bước 4: Sử dụng Broadcast Page với Dynamic Code

#### Option 1: Sử dụng auto_code mẫu

1. Copy nội dung file `broadcast_auto_code_example.js`
2. Vào database, thêm record vào bảng `sys_autos`:
   ```
   app_id: <your_app_id>  (hoặc "csm" cho CSM admin)
   p_type: 2              (broadcast page)
   auto_code: <paste nội dung file broadcast_auto_code_example.js>
   ```
3. Truy cập menu "Broadcast" → code sẽ tự động chạy

#### Option 2: Tùy chỉnh giao diện riêng

Tham khảo file `broadcast_auto_code_example.js` để:
- Tạo UI dashboard riêng
- Sử dụng các APIs có sẵn qua object `seft`
- Render biểu đồ, bảng dữ liệu tùy ý

---

## 💡 VÍ DỤ SỬ DỤNG APIs

### Frontend (React/TypeScript)

```typescript
import { 
  getCustomers, 
  getCRMStats, 
  getWebsiteStats, 
  createOrUpdateCustomer,
  assignCustomer,
  updateCustomerStatus 
} from '#src/components/csm-grid/CsmApi';

// Lấy danh sách customers
const customers = await getCustomers({
  appId: 'my_app',
  status: 'new',      // optional: filter by status
  limit: 50,
  offset: 0,
});

// Tạo customer mới
await createOrUpdateCustomer({
  phone: '+84901234567',
  name: 'Nguyễn Văn A',
  email: 'nva@example.com',
  birthday: '1990-01-15',
  status: 'new',
  source: 'website',
  app_id: 'my_app',
});

// Phân bổ cho nhân viên
await assignCustomer('+84901234567', 'my_app', 'user_123');

// Cập nhật trạng thái
await updateCustomerStatus('+84901234567', 'my_app', 'interested', 'Đã gọi điện tư vấn');

// Thống kê CRM
const stats = await getCRMStats({
  appId: 'my_app',
  fromDate: '2024-01-01',
  toDate: '2024-01-31',
});

// Thống kê website
const webStats = await getWebsiteStats({
  appId: 'my_app',
  fromDate: '2024-01-01',
  toDate: '2024-01-31',
});
```

### Dynamic Auto Code (JavaScript)

Trong file auto_code, bạn có thể sử dụng:

```javascript
;(async function() {
  // Truy cập APIs qua seft object
  const appId = seft.appId;
  
  // Lấy customers
  const customersResult = await seft.getCustomers({
    appId,
    limit: 100,
  });
  
  // Lấy stats
  const crmStats = await seft.getCRMStats({ appId });
  const webStats = await seft.getWebsiteStats({ appId });
  const adsStats = await seft.getAdsStats({ appId, platform: 'all' });
  
  // Render UI với React
  const { Card, Table, Statistic } = window.antd;
  ReactDOM.render(
    React.createElement(YourComponent, { data: customersResult.data }),
    document.getElementById('broadcast-auto-root')
  );
})();
```

---

## 📊 CẤU TRÚC DATABASE

### Table: crm_customers

| Field | Type | Description |
|-------|------|-------------|
| phone | string | Số điện thoại (Primary Key) |
| app_id | string | App ID |
| name | string | Tên khách hàng |
| email | string | Email |
| birthday | string | Ngày sinh (YYYY-MM-DD) |
| nick_zalo | string | Nick Zalo |
| nick_facebook | string | Nick Facebook |
| status | string | Trạng thái (new, contacted, interested, purchased, cancelled) |
| source | string | Nguồn (chat, website, facebook, google) |
| assigned_to | string | User ID nhân viên được phân bổ |
| notes | string | Ghi chú |
| created_at | long | Timestamp tạo |
| updated_at | long | Timestamp cập nhật |
| last_contact_at | long | Timestamp liên hệ cuối |
| contacted_by_count | int | Số nhân viên đã liên hệ |
| contacted_by_list | string | JSON array của user IDs |

### Table: crm_purchases

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID (Primary Key) |
| phone | string | Số điện thoại khách |
| app_id | string | App ID |
| product_id | string | ID sản phẩm |
| product_name | string | Tên sản phẩm |
| price | double | Giá |
| advisor_id | string | User ID nhân viên tư vấn |
| purchased_at | long | Timestamp mua hàng |

### Table: crm_contact_history

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID (Primary Key) |
| phone | string | Số điện thoại khách |
| app_id | string | App ID |
| staff_id | string | User ID nhân viên |
| contact_type | string | Loại liên hệ (call, message, meeting, email) |
| notes | string | Ghi chú |
| contacted_at | long | Timestamp liên hệ |

### Table: crm_ads

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID (Primary Key) |
| app_id | string | App ID |
| platform | string | Nền tảng (facebook, google) |
| ad_id | string | ID từ platform |
| name | string | Tên quảng cáo |
| status | string | Trạng thái (active, paused, completed, cancelled) |
| budget | double | Ngân sách |
| spent | double | Đã chi |
| impressions | long | Lượt hiển thị |
| clicks | long | Lượt click |
| conversions | long | Chuyển đổi |
| target_url | string | URL landing page |
| created_at | long | Timestamp tạo |
| updated_at | long | Timestamp cập nhật |
| metadata | string | JSON metadata |

### Table: web_stats

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID (Primary Key) |
| app_id | string | App ID |
| stat_date | string | Ngày thống kê (YYYY-MM-DD) |
| posts_count | int | Số bài đăng mới |
| page_views | long | Tổng lượt xem |
| unique_visitors | long | Unique visitors |
| google_bot_visits | long | Google bot visits |
| avg_time_on_site | double | Thời gian TB (seconds) |
| bounce_rate | double | Tỷ lệ thoát (%) |
| top_pages | string | JSON array [{url, views}] |
| created_at | long | Timestamp tạo |

---

## 🎯 WORKFLOW THỰC TẾ

### Quy trình chăm sóc khách hàng

1. **Khách truy cập website** → Tracking trong `web_stats`
2. **Khách chat và để SĐT** → Tự động tạo record trong `crm_customers` (status: new)
3. **Admin xem danh sách khách mới** → Phân bổ cho nhân viên
4. **Nhân viên liên hệ** → Ghi nhận trong `crm_contact_history`
5. **Cập nhật trạng thái** → contacted → interested → purchased
6. **Ghi nhận mua hàng** → Thêm vào `crm_purchases`
7. **Nhắc sinh nhật** → API `getUpcomingBirthdays` tự động notify

### Quy trình quảng cáo

1. **Tạo campaign** → Lưu vào `crm_ads`
2. **Khách click quảng cáo** → Landing page tracking
3. **Khách chat/mua hàng** → Link với customer record (source: facebook/google)
4. **Thống kê hiệu quả** → API `getAdsStats` cho biểu đồ ROI

---

## 🔧 TROUBLESHOOTING

### Lỗi thường gặp

**1. Auto code không chạy**
- Kiểm tra `sys_autos` có record với `p_type = 2` chưa
- Check browser console xem có lỗi JavaScript không
- Đảm bảo `app_id` trong `sys_autos` khớp với user đang login

**2. Customer không được tạo tự động**
- Check logs backend: tìm "[CRM] Auto-created/updated customer"
- Đảm bảo guest đã để số điện thoại trong chat
- Kiểm tra table `crm_customers` có tồn tại không

**3. Thống kê không chính xác**
- `web_stats` cần được populate từ `WebSpringController` (tích hợp thêm)
- Kiểm tra date range có hợp lệ không
- Verify data trong database tables

---

## 📞 HỖ TRỢ

Nếu cần hỗ trợ thêm:
1. Check logs backend: `backend/logs/`
2. Check browser console
3. Review code trong các file:
   - `CRMHandler.java`
   - `CRMService.java`
   - `CsmApi.ts`
   - `broadcast.tsx`
   - `SocketIOConfig.java` (auto CRM tracking)

---

## 🎉 TÍNH NĂNG TIẾP THEO (Có thể mở rộng)

- [ ] Tích hợp Facebook Ads API để tạo campaign thật
- [ ] Tích hợp Google Ads API
- [ ] Email marketing automation
- [ ] SMS marketing
- [ ] WhatsApp/Zalo integration
- [ ] AI chatbot tự động trả lời
- [ ] Báo cáo PDF/Excel export
- [ ] Mobile app cho nhân viên sale

---

**Chúc bạn sử dụng hiệu quả hệ thống CRM! 🚀**
