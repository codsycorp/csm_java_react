package net.phanmemmottrieu.handler;

import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.CRMService;
import net.phanmemmottrieu.service.CRMAnalyticsService;

/**
 * CRM Handler - Quản lý khách hàng từ website/chat đến chuyển đổi
 * 
 * Chức năng:
 * - Tự động tạo customer record khi khách để SĐT trong chat
 * - Quản lý thông tin: tên, SĐT, ngày sinh, nick Zalo/Facebook
 * - Quản lý trạng thái khách hàng (mới, đang liên hệ, đã mua, hủy...)
 * - Phân bổ khách cho nhân viên chăm sóc
 * - Theo dõi sản phẩm đã mua, nhân viên tư vấn
 * - Lịch sử liên hệ, nhân viên đã tiếp xúc
 * - Nhắc sinh nhật khách hàng
 * - Thống kê hiệu quả website, quảng cáo, Google bot
 */
@Component
public class CRMHandler {
    private static final Logger logger = LoggerFactory.getLogger(CRMHandler.class);
    private final CRMService crmService;
    private final CRMAnalyticsService analyticsService;

    @Autowired
    public CRMHandler(CRMService crmService, CRMAnalyticsService analyticsService) {
        this.crmService = crmService;
        this.analyticsService = analyticsService;
    }

    /**
     * Tạo hoặc cập nhật customer từ chat history
     * Params: phone, name, appId, room, guestMetadata
     */
    public void handleCreateOrUpdateCustomer(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String name = (String) params.getOrDefault("name", "");
            String appId = (String) params.getOrDefault("appId", "csm");
            String source = (String) params.getOrDefault("source", "chat"); // chat, website, facebook...
            
            // Optional fields
            String email = (String) params.getOrDefault("email", "");
            String birthday = (String) params.getOrDefault("birthday", "");
            String nickZalo = (String) params.getOrDefault("nickZalo", "");
            String nickFacebook = (String) params.getOrDefault("nickFacebook", "");
            String status = (String) params.getOrDefault("status", "new"); // new, contacted, interested, purchased, cancelled
            String notes = (String) params.getOrDefault("notes", "");
            String utmSource = (String) params.getOrDefault("utm_source", "");
            String utmMedium = (String) params.getOrDefault("utm_medium", "");
            String utmCampaign = (String) params.getOrDefault("utm_campaign", "");
            String referrer = (String) params.getOrDefault("referrer", "");
            String landingPage = (String) params.getOrDefault("landing_page", "");
            
            if (phone == null || phone.trim().isEmpty()) {
                response.set("error", "Phone number is required");
                response.set("success", false);
                return;
            }
            
            // Build customer data map
            Map<String, Object> customerData = new HashMap<>();
            customerData.put("phone", phone);
            if (name != null) customerData.put("name", name);
            if (email != null) customerData.put("email", email);
            if (birthday != null) customerData.put("birthday", birthday);
            if (nickZalo != null) customerData.put("nick_zalo", nickZalo);
            if (nickFacebook != null) customerData.put("nick_facebook", nickFacebook);
            if (status != null) customerData.put("status", status);
            if (source != null) customerData.put("source", source);
            if (notes != null) customerData.put("notes", notes);
            if (utmSource != null) customerData.put("utm_source", utmSource);
            if (utmMedium != null) customerData.put("utm_medium", utmMedium);
            if (utmCampaign != null) customerData.put("utm_campaign", utmCampaign);
            if (referrer != null) customerData.put("referrer", referrer);
            if (landingPage != null) customerData.put("landing_page", landingPage);
            
            Map<String, Object> result = crmService.createOrUpdateCustomer(appId, customerData);
            Object customerObj = result.get("customer");
            Map<String, Object> customer = new HashMap<>();
            if (customerObj instanceof Map<?, ?> rawMap) {
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    if (entry.getKey() instanceof String key) {
                        customer.put(key, entry.getValue());
                    }
                }
            }
            
            response.set("success", true);
            response.set("data", customer);
            response.set("message", "Customer saved successfully");
            
        } catch (Exception e) {
            logger.error("Error creating/updating customer", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách customers theo appId với filter
     * Params: appId, status, assignedTo, limit, offset, search
     */
    public void handleGetCustomers(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String status = (String) params.get("status"); // có thể null -> lấy tất cả
            String assignedTo = (String) params.get("assignedTo"); // filter theo nhân viên
            String search = (String) params.get("search"); // tìm theo tên hoặc SĐT
            int limit = params.containsKey("limit") ? ((Number) params.get("limit")).intValue() : 100;
            int offset = params.containsKey("offset") ? ((Number) params.get("offset")).intValue() : 0;
            
            List<Map<String, Object>> customers = crmService.getCustomers(
                appId, status, assignedTo, search, offset, limit
            );
            
            response.set("success", true);
            response.set("data", customers);
            response.set("total", customers.size());
            
        } catch (Exception e) {
            logger.error("Error getting customers", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy chi tiết customer theo phone + appId
     * Params: phone, appId
     */
    public void handleGetCustomerDetail(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String appId = (String) params.getOrDefault("appId", "csm");
            
            if (phone == null) {
                response.set("error", "Phone is required");
                response.set("success", false);
                return;
            }
            
            Map<String, Object> customer = crmService.getCustomerByPhone(appId, phone);
            
            if (customer == null) {
                response.set("error", "Customer not found");
                response.set("success", false);
                return;
            }
            
            response.set("success", true);
            response.set("data", customer);
            
        } catch (Exception e) {
            logger.error("Error getting customer detail", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Phân bổ khách cho nhân viên chăm sóc
     * Params: phone, appId, assignedTo (userId)
     */
    public void handleAssignCustomer(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String appId = (String) params.getOrDefault("appId", "csm");
            String assignedTo = (String) params.get("assignedTo");
            
            if (phone == null || assignedTo == null) {
                response.set("error", "Phone and assignedTo are required");
                response.set("success", false);
                return;
            }
            
            Map<String, Object> result = crmService.assignCustomer(appId, phone, assignedTo);
            boolean success = (boolean) result.getOrDefault("success", false);
            
            response.set("success", success);
            if (success) {
                response.set("message", "Customer assigned successfully");
            } else {
                response.set("error", "Failed to assign customer");
            }
            
        } catch (Exception e) {
            logger.error("Error assigning customer", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Cập nhật trạng thái khách hàng
     * Params: phone, appId, status, notes
     */
    public void handleUpdateCustomerStatus(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String appId = (String) params.getOrDefault("appId", "csm");
            String status = (String) params.get("status");
            String notes = (String) params.getOrDefault("notes", "");
            
            if (phone == null || status == null) {
                response.set("error", "Phone and status are required");
                response.set("success", false);
                return;
            }
            
            Map<String, Object> result = crmService.updateCustomerStatus(appId, phone, status, notes);
            boolean success = (boolean) result.getOrDefault("success", false);
            
            response.set("success", success);
            if (success) {
                response.set("message", "Status updated successfully");
            }
            
        } catch (Exception e) {
            logger.error("Error updating customer status", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thêm sản phẩm đã mua cho khách hàng
     * Params: phone, appId, productId, productName, price, advisorId (nhân viên tư vấn)
     */
    public void handleAddPurchase(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String appId = (String) params.getOrDefault("appId", "csm");
            String productId = (String) params.get("productId");
            String productName = (String) params.get("productName");
            Object priceObj = params.get("price");
            String advisorId = (String) params.get("advisorId"); // nhân viên tư vấn
            
            double price = 0;
            if (priceObj != null) {
                if (priceObj instanceof Number) {
                    price = ((Number) priceObj).doubleValue();
                } else if (priceObj instanceof String) {
                    try {
                        price = Double.parseDouble((String) priceObj);
                    } catch (NumberFormatException e) {
                        // ignore
                    }
                }
            }
            
            Map<String, Object> purchaseData = new HashMap<>();
            if (productId != null) purchaseData.put("product_id", productId);
            if (productName != null) purchaseData.put("product_name", productName);
            purchaseData.put("price", price);
            if (advisorId != null) purchaseData.put("advisor_id", advisorId);
            
            Map<String, Object> result = crmService.addCustomerPurchase(appId, phone, purchaseData);
            boolean success = (boolean) result.getOrDefault("success", false);
            
            response.set("success", success);
            if (success) {
                response.set("message", "Purchase added successfully");
            }
            
        } catch (Exception e) {
            logger.error("Error adding purchase", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Ghi nhận lịch sử liên hệ
     * Params: phone, appId, staffId, contactType (call, message, meeting), notes
     */
    public void handleAddContactHistory(StandardResponse response, Map<String, Object> params) {
        try {
            String phone = (String) params.get("phone");
            String appId = (String) params.getOrDefault("appId", "csm");
            String staffId = (String) params.get("staffId");
            String contactType = (String) params.getOrDefault("contactType", "message");
            String notes = (String) params.getOrDefault("notes", "");
            
            Map<String, Object> result = crmService.addContactHistory(appId, phone, contactType, notes, staffId);
            boolean success = (boolean) result.getOrDefault("success", false);
            
            response.set("success", success);
            if (success) {
                response.set("message", "Contact history added");
            }
            
        } catch (Exception e) {
            logger.error("Error adding contact history", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy khách hàng có sinh nhật trong X ngày tới
     * Params: appId, days (default: 7)
     */
    public void handleGetUpcomingBirthdays(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            int days = params.containsKey("days") ? ((Number) params.get("days")).intValue() : 7;
            
            List<Map<String, Object>> customers = crmService.getUpcomingBirthdays(appId, days);
            
            response.set("success", true);
            response.set("data", customers);
            response.set("total", customers.size());
            
        } catch (Exception e) {
            logger.error("Error getting upcoming birthdays", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thống kê CRM theo appId
     * Trả về: tổng khách hàng, khách mới, đã mua, hủy, theo từng trạng thái...
     * Params: appId, fromDate, toDate
     */
    public void handleGetCRMStats(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String fromDate = (String) params.get("fromDate");
            String toDate = (String) params.get("toDate");
            
            Map<String, Object> stats = crmService.getCRMStats(appId, fromDate, toDate);
            
            response.set("success", true);
            response.set("data", stats);
            
        } catch (Exception e) {
            logger.error("Error getting CRM stats", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thống kê website: số bài đăng, lượt xem, Google bot visits
     * Params: appId, fromDate, toDate
     */
    public void handleGetWebsiteStats(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String fromDate = (String) params.get("fromDate");
            String toDate = (String) params.get("toDate");
            
            Map<String, Object> stats = crmService.getWebsiteStats(appId, fromDate, toDate);
            
            response.set("success", true);
            response.set("data", stats);
            
        } catch (Exception e) {
            logger.error("Error getting website stats", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Thống kê quảng cáo Facebook/Google
     * Params: appId, platform (facebook|google), fromDate, toDate
     */
    public void handleGetAdsStats(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String fromDate = (String) params.get("fromDate");
            String toDate = (String) params.get("toDate");
            
            Map<String, Object> stats = crmService.getAdsStats(appId, fromDate, toDate);
            
            response.set("success", true);
            response.set("data", stats);
            
        } catch (Exception e) {
            logger.error("Error getting ads stats", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Tạo quảng cáo lên Facebook/Google
     * Params: appId, platform, adData {...}
     */
    public void handleCreateAd(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String platform = (String) params.get("platform"); // facebook or google
            Object adDataObj = params.get("adData");
            if (!(adDataObj instanceof Map)) {
                response.set("error", "adData is required");
                response.set("success", false);
                return;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> adData = (Map<String, Object>) adDataObj;
            
            if (platform == null) {
                response.set("error", "platform is required");
                response.set("success", false);
                return;
            }
            
            // Add platform to adData if provided
            if (platform != null) {
                adData.put("platform", platform);
            }
            
            Map<String, Object> result = crmService.createAd(appId, adData);
            
            response.set("success", true);
            response.set("data", result);
            response.set("message", "Ad created successfully");
            
        } catch (Exception e) {
            logger.error("Error creating ad", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy danh sách quảng cáo
     * Params: appId, platform, status, limit, offset
     */
    public void handleGetAds(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String platform = (String) params.get("platform");
            String status = (String) params.get("status");
            List<Map<String, Object>> ads = crmService.getAdsWithStats(appId, status, platform);
            
            response.set("success", true);
            response.set("data", ads);
            response.set("total", ads.size());
            
        } catch (Exception e) {
            logger.error("Error getting ads", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy phân tích toàn diện cho một thời kỳ
     * 
     * Params:
     * - appId: Application ID
     * - timePeriod: "day", "week", "month", "year"
     * 
     * Returns:
     * - Key metrics (total customers, revenue, conversion rate, etc.)
     * - Timeline data for charting
     * - Channel analysis (chat, website, Facebook, etc.)
     * - Product performance
     * - Ad performance
     */
    public void handleGetAnalytics(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String timePeriod = (String) params.getOrDefault("timePeriod", "week");
            
            // Validate time period
            if (!timePeriod.matches("^(day|week|month|year)$")) {
                response.set("error", "Invalid timePeriod. Must be: day, week, month, or year");
                response.set("success", false);
                return;
            }
            
            Map<String, Object> analytics = analyticsService.getAnalytics(appId, timePeriod);
            
            response.set("success", true);
            response.set("data", analytics);
            response.set("message", String.format("Analytics retrieved for %s (%s)", appId, timePeriod));
            
        } catch (Exception e) {
            logger.error("Error getting analytics", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }

    /**
     * Lấy phân tích AI và gợi ý hành động
     * 
     * Params:
     * - appId: Application ID
     * - timePeriod: "day", "week", "month", "year"
     * 
     * Returns:
     * - AI analysis text with insights
     * - Structured recommendations with priority
     * - Data-driven actionable steps
     */
    public void handleGetAIInsights(StandardResponse response, Map<String, Object> params) {
        try {
            String appId = (String) params.getOrDefault("appId", "csm");
            String timePeriod = (String) params.getOrDefault("timePeriod", "week");
            
            // Validate time period
            if (!timePeriod.matches("^(day|week|month|year)$")) {
                response.set("error", "Invalid timePeriod. Must be: day, week, month, or year");
                response.set("success", false);
                return;
            }
            
            Map<String, Object> insights = analyticsService.getAIInsights(appId, timePeriod);
            
            response.set("success", true);
            response.set("data", insights);
            response.set("message", String.format("AI insights generated for %s (%s)", appId, timePeriod));
            
        } catch (Exception e) {
            logger.error("Error getting AI insights", e);
            response.set("error", e.getMessage());
            response.set("success", false);
        }
    }
}
