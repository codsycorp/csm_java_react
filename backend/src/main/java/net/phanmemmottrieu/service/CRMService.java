package net.phanmemmottrieu.service;

import java.util.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.annotation.PostConstruct;
import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;

/**
 * CRM Service - Simplified version using correct RecordManager APIs
 * 
 * TABLES (auto-created on first insert):
 * - crm_customers: customer data (PK: phone)
 * - crm_purchases: purchase history (PK: purchase_id)
 * - crm_contact_history: contact logs (PK: history_id)
 * - crm_ads: Facebook/Google ads (PK: ad_id)
 * - web_stats: website statistics (PK: stat_date)
 * 
 * NOTE: Full filter/search implementation requires proper SearchFilter usage study.
 * Current version uses createRecord() which handles both insert and update.
 */
@Service
public class CRMService {
    private static final Logger logger = LoggerFactory.getLogger(CRMService.class);
    private final RecordManager recordManager;
    private final GoogleIndexService googleIndexService;
    
    // Table names
    private static final String TABLE_CUSTOMERS = "crm_customers";
    private static final String TABLE_PURCHASES = "crm_purchases";
    private static final String TABLE_CONTACT_HISTORY = "crm_contact_history";
    private static final String TABLE_ADS = "crm_ads";
    private static final String TABLE_GOOGLEBOT_VISITS = "googlebot_visits";
    
    // Table ready flags
    private final AtomicBoolean customersTableReady = new AtomicBoolean(false);
    private final AtomicBoolean purchasesTableReady = new AtomicBoolean(false);
    private final AtomicBoolean contactHistoryTableReady = new AtomicBoolean(false);
    private final AtomicBoolean adsTableReady = new AtomicBoolean(false);

    @Autowired
    public CRMService(RecordManager recordManager, GoogleIndexService googleIndexService) {
        this.recordManager = recordManager;
        this.googleIndexService = googleIndexService;
    }
    
    @PostConstruct
    public void initializeTables() {
        logger.info("Initializing CRM tables...");
        try {
            ensureCustomersTable();
            ensurePurchasesTable();
            ensureContactHistoryTable();
            ensureAdsTable();
            logger.info("✅ All CRM tables initialized successfully");
        } catch (Exception e) {
            logger.error("❌ Error initializing CRM tables: {}", e.getMessage(), e);
        }
    }
    
    @SuppressWarnings("unchecked")
    private void ensureCustomersTable() {
        if (customersTableReady.get()) return;
        synchronized (customersTableReady) {
            if (customersTableReady.get()) return;
            try {
                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE_CUSTOMERS);
                Map<String, Object> existing = recordManager.find("csm", "index", filter);
                if (existing == null || existing.isEmpty()) {
                    Map<String, Object> struct = new HashMap<>();
                    struct.put("fieldsPK", List.of("phone", "app_id"));
                    struct.put("fieldsSearch", List.of("id", "phone", "name", "email", "status", "source", "assigned_to"));
                    
                    Map<String, Object> record = new HashMap<>();
                    record.put("id", TABLE_CUSTOMERS);
                    record.put("struct", struct);
                    recordManager.createRecord("csm", "index", record);
                    logger.info("✅ Created table struct: {}", TABLE_CUSTOMERS);
                }
                customersTableReady.set(true);
            } catch (Exception e) {
                logger.warn("Cannot ensure table {}: {}", TABLE_CUSTOMERS, e.getMessage());
            }
        }
    }
    
    @SuppressWarnings("unchecked")
    private void ensurePurchasesTable() {
        if (purchasesTableReady.get()) return;
        synchronized (purchasesTableReady) {
            if (purchasesTableReady.get()) return;
            try {
                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE_PURCHASES);
                Map<String, Object> existing = recordManager.find("csm", "index", filter);
                if (existing == null || existing.isEmpty()) {
                    Map<String, Object> struct = new HashMap<>();
                    struct.put("fieldsPK", List.of("purchase_id"));
                    struct.put("fieldsSearch", List.of("id", "purchase_id", "customer_phone", "product_id", "product_name", "advisor_id"));
                    
                    Map<String, Object> record = new HashMap<>();
                    record.put("id", TABLE_PURCHASES);
                    record.put("struct", struct);
                    recordManager.createRecord("csm", "index", record);
                    logger.info("✅ Created table struct: {}", TABLE_PURCHASES);
                }
                purchasesTableReady.set(true);
            } catch (Exception e) {
                logger.warn("Cannot ensure table {}: {}", TABLE_PURCHASES, e.getMessage());
            }
        }
    }
    
    @SuppressWarnings("unchecked")
    private void ensureContactHistoryTable() {
        if (contactHistoryTableReady.get()) return;
        synchronized (contactHistoryTableReady) {
            if (contactHistoryTableReady.get()) return;
            try {
                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE_CONTACT_HISTORY);
                Map<String, Object> existing = recordManager.find("csm", "index", filter);
                if (existing == null || existing.isEmpty()) {
                    Map<String, Object> struct = new HashMap<>();
                    struct.put("fieldsPK", List.of("history_id"));
                    struct.put("fieldsSearch", List.of("id", "history_id", "customer_phone", "contact_type", "employee_id"));
                    
                    Map<String, Object> record = new HashMap<>();
                    record.put("id", TABLE_CONTACT_HISTORY);
                    record.put("struct", struct);
                    recordManager.createRecord("csm", "index", record);
                    logger.info("✅ Created table struct: {}", TABLE_CONTACT_HISTORY);
                }
                contactHistoryTableReady.set(true);
            } catch (Exception e) {
                logger.warn("Cannot ensure table {}: {}", TABLE_CONTACT_HISTORY, e.getMessage());
            }
        }
    }
    
    @SuppressWarnings("unchecked")
    private void ensureAdsTable() {
        if (adsTableReady.get()) return;
        synchronized (adsTableReady) {
            if (adsTableReady.get()) return;
            try {
                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE_ADS);
                Map<String, Object> existing = recordManager.find("csm", "index", filter);
                if (existing == null || existing.isEmpty()) {
                    Map<String, Object> struct = new HashMap<>();
                    struct.put("fieldsPK", List.of("ad_id"));
                    struct.put("fieldsSearch", List.of("id", "ad_id", "platform", "status", "name", "app_id"));
                    
                    Map<String, Object> record = new HashMap<>();
                    record.put("id", TABLE_ADS);
                    record.put("struct", struct);
                    recordManager.createRecord("csm", "index", record);
                    logger.info("✅ Created table struct: {}", TABLE_ADS);
                }
                adsTableReady.set(true);
            } catch (Exception e) {
                logger.warn("Cannot ensure table {}: {}", TABLE_ADS, e.getMessage());
            }
        }
    }

    /**
     * Create or update customer
     * Uses createRecord() which auto-creates table and upserts based on PK
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> createOrUpdateCustomer(String appId, Map<String, Object> customerData) {
        ensureCustomersTable(); // Ensure table exists before insert
        try {
            String phone = (String) customerData.get("phone");
            if (phone == null || phone.trim().isEmpty()) {
                throw new IllegalArgumentException("Phone number is required");
            }
            
            // Prepare customer data
            Map<String, Object> data = new HashMap<>(customerData);
            data.put("app_id", appId);
            data.put("phone", phone);
            
            // Ensure id exists
            if (!data.containsKey("id") || data.get("id") == null || data.get("id").toString().isBlank()) {
                data.put("id", UUID.randomUUID().toString());
            }
            
            // Set timestamps
            long now = Instant.now().toEpochMilli();
            if (!data.containsKey("created_at")) {
                data.put("created_at", now);
            }
            data.put("updated_at", now);
            
            // createRecord auto-creates table and upserts by PK
            recordManager.createRecord(appId, TABLE_CUSTOMERS, data, List.of("phone"));
            
            logger.info("Customer created/updated: {} (app: {})", phone, appId);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("customer", data);
            return result;
            
        } catch (Exception e) {
            logger.error("Error creating/updating customer", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Get customers by filter
     * TODO: Implement using recordManager.filter() or recordManager.find() correctly
     * Currently returns empty list as placeholder
     */
    public List<Map<String, Object>> getCustomers(String appId, String status, String assignedTo, 
                                                   String search, int offset, int limit) {
        try {
            logger.warn("getCustomers() not yet implemented - requires SearchFilter study");
            // TODO: Use recordManager.filter() with proper SearchFilter construction
            return new ArrayList<>();
        } catch (Exception e) {
            logger.error("Error getting customers", e);
            return new ArrayList<>();
        }
    }

    /**
     * Get customer by phone
     * TODO: Implement using recordManager.find() with SearchFilter
     * Currently returns empty map
     */
    public Map<String, Object> getCustomerByPhone(String appId, String phone) {
        try {
            logger.warn("getCustomerByPhone() not yet implemented - requires SearchFilter study");
            // TODO: Use recordManager.find() with SearchFilter for phone+app_id
            return new HashMap<>();
        } catch (Exception e) {
            logger.error("Error getting customer by phone", e);
            return new HashMap<>();
        }
    }

    /**
     * Assign customer to employee
     * TODO: Requires getCustomerByPhone() implementation first
     */
    public Map<String, Object> assignCustomer(String appId, String phone, String employeeId) {
        try {
            logger.warn("assignCustomer() not yet implemented");
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("error", "Not yet implemented");
            return result;
        } catch (Exception e) {
            logger.error("Error assigning customer", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Update customer status
     * TODO: Requires getCustomerByPhone() implementation first
     */
    public Map<String, Object> updateCustomerStatus(String appId, String phone, String status, String notes) {
        try {
            logger.warn("updateCustomerStatus() not yet implemented");
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("error", "Not yet implemented");
            return result;
        } catch (Exception e) {
            logger.error("Error updating customer status", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Add customer purchase
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> addCustomerPurchase(String appId, String phone, Map<String, Object> purchaseData) {
        ensurePurchasesTable(); // Ensure table exists before insert
        try {
            String purchaseId = UUID.randomUUID().toString();
            Map<String, Object> data = new HashMap<>(purchaseData);
            data.put("id", UUID.randomUUID().toString());
            data.put("purchase_id", purchaseId);
            data.put("app_id", appId);
            data.put("customer_phone", phone);
            data.put("created_at", Instant.now().toEpochMilli());
            
            recordManager.createRecord(appId, TABLE_PURCHASES, data, List.of("purchase_id"));
            
            logger.info("Purchase added: {} for customer {}", purchaseId, phone);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("purchase", data);
            return result;
            
        } catch (Exception e) {
            logger.error("Error adding purchase", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Add contact history
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> addContactHistory(String appId, String phone, String contactType, 
                                                  String notes, String employeeId) {
        ensureContactHistoryTable(); // Ensure table exists before insert
        try {
            String historyId = UUID.randomUUID().toString();
            Map<String, Object> data = new HashMap<>();
            data.put("id", UUID.randomUUID().toString());
            data.put("history_id", historyId);
            data.put("app_id", appId);
            data.put("customer_phone", phone);
            data.put("contact_type", contactType);
            data.put("notes", notes);
            data.put("employee_id", employeeId);
            data.put("created_at", Instant.now().toEpochMilli());
            
            recordManager.createRecord(appId, TABLE_CONTACT_HISTORY, data, List.of("history_id"));
            
            logger.info("Contact history added: {} for customer {}", historyId, phone);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("history", data);
            return result;
            
        } catch (Exception e) {
            logger.error("Error adding contact history", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Get upcoming birthdays
     * TODO: Requires date filtering with SearchFilter
     */
    public List<Map<String, Object>> getUpcomingBirthdays(String appId, int daysAhead) {
        try {
            logger.warn("getUpcomingBirthdays() not yet implemented");
            return new ArrayList<>();
        } catch (Exception e) {
            logger.error("Error getting birthdays", e);
            return new ArrayList<>();
        }
    }

    /**
     * Get CRM statistics
     * TODO: Requires filtering and aggregation with SearchFilter
     */
    public Map<String, Object> getCRMStats(String appId, String fromDate, String toDate) {
        try {
            Long fromTs = parseDateBoundary(fromDate, false);
            Long toTs = parseDateBoundary(toDate, true);
            boolean hasDateFilter = fromTs != null || toTs != null;

            List<Map<String, Object>> customers = safeRows(recordManager.fullScan(appId, TABLE_CUSTOMERS));
            List<Map<String, Object>> purchases = safeRows(recordManager.fullScan(appId, TABLE_PURCHASES));

            Map<String, Object> stats = new HashMap<>();

            Map<String, Integer> byStatus = new HashMap<>();
            Map<String, Integer> bySource = new HashMap<>();
            int totalCustomers = 0;
            int contactedCustomers = 0;
            int convertedCustomers = 0;

            for (Map<String, Object> customer : customers) {
                long createdAt = asEpochMillis(customer.get("created_at"));
                if (hasDateFilter && !inRange(createdAt, fromTs, toTs)) {
                    continue;
                }

                totalCustomers++;

                String status = nonBlankOrDefault(asString(customer.get("status")), "new").toLowerCase();
                byStatus.put(status, byStatus.getOrDefault(status, 0) + 1);
                if (isContactedStatus(status)) {
                    contactedCustomers++;
                }
                if ("purchased".equals(status)) {
                    convertedCustomers++;
                }

                String source = canonicalSource(customer.get("source"));
                bySource.put(source, bySource.getOrDefault(source, 0) + 1);
            }

            int totalPurchases = 0;
            double totalRevenue = 0.0;
            for (Map<String, Object> purchase : purchases) {
                long purchasedAt = asEpochMillis(firstNonNull(purchase.get("purchased_at"), purchase.get("created_at")));
                if (hasDateFilter && !inRange(purchasedAt, fromTs, toTs)) {
                    continue;
                }
                totalPurchases++;
                totalRevenue += asDouble(purchase.get("price"));
            }

            stats.put("total_customers", totalCustomers);
            stats.put("new_customers", totalCustomers);
            stats.put("contacted_customers", contactedCustomers);
            stats.put("converted_customers", convertedCustomers);
            stats.put("total_purchases", totalPurchases);
            stats.put("total_revenue", totalRevenue);
            stats.put("by_status", byStatus);
            stats.put("by_source", bySource);
            return stats;
        } catch (Exception e) {
            logger.error("Error getting CRM stats", e);
            return new HashMap<>();
        }
    }

    /**
     * Get website statistics
     * TODO: Requires filtering web_stats table
     */
    public Map<String, Object> getWebsiteStats(String appId, String fromDate, String toDate) {
        try {
            Long fromTs = parseDateBoundary(fromDate, false);
            Long toTs = parseDateBoundary(toDate, true);
            boolean hasDateFilter = fromTs != null || toTs != null;

            List<Map<String, Object>> customers = safeRows(recordManager.fullScan(appId, TABLE_CUSTOMERS));
            List<Map<String, Object>> googleBotRows = safeRows(recordManager.fullScan("csm", TABLE_GOOGLEBOT_VISITS));
            List<Map<String, Object>> websitePosts = safeRows(recordManager.fullScan(appId, "web_service_detail"));

            Map<String, Integer> bySource = new HashMap<>();
            Map<String, Integer> dailyLeadCount = new TreeMap<>();
            int totalVisits = 0;

            for (Map<String, Object> customer : customers) {
                long createdAt = asEpochMillis(customer.get("created_at"));
                if (hasDateFilter && !inRange(createdAt, fromTs, toTs)) {
                    continue;
                }

                String source = canonicalSource(customer.get("source"));
                bySource.put(source, bySource.getOrDefault(source, 0) + 1);

                if (!"chat".equals(source)) {
                    totalVisits++;
                }

                String dayKey = toDateKey(createdAt);
                if (!dayKey.isEmpty()) {
                    dailyLeadCount.put(dayKey, dailyLeadCount.getOrDefault(dayKey, 0) + 1);
                }
            }

            Map<String, Integer> dailyGoogleBot = new TreeMap<>();
            int googleBotVisits = 0;
            for (Map<String, Object> row : googleBotRows) {
                long ts = asEpochMillis(firstNonNull(row.get("ts"), row.get("visitedAt")));
                if (hasDateFilter && !inRange(ts, fromTs, toTs)) {
                    continue;
                }
                googleBotVisits++;

                String dayKey = asString(row.get("dateKey"));
                if (dayKey == null || dayKey.isBlank()) {
                    dayKey = toDateKey(ts);
                }
                if (!dayKey.isEmpty()) {
                    dailyGoogleBot.put(dayKey, dailyGoogleBot.getOrDefault(dayKey, 0) + 1);
                }
            }

            Set<String> allDays = new TreeSet<>();
            allDays.addAll(dailyLeadCount.keySet());
            allDays.addAll(dailyGoogleBot.keySet());

            List<Map<String, Object>> dailyStats = new ArrayList<>();
            for (String day : allDays) {
                Map<String, Object> item = new HashMap<>();
                item.put("date", day);
                item.put("visits", dailyLeadCount.getOrDefault(day, 0));
                item.put("google_bot_visits", dailyGoogleBot.getOrDefault(day, 0));
                dailyStats.add(item);
            }

            Map<String, Object> stats = new HashMap<>();
            stats.put("total_visits", totalVisits);
            stats.put("google_bot_visits", googleBotVisits);
            stats.put("daily_stats", dailyStats);
            stats.put("by_source", bySource);
            stats.put("total_posts", websitePosts.size());
            stats.put("total_views", 0);
            return stats;
        } catch (Exception e) {
            logger.error("Error getting website stats", e);
            return new HashMap<>();
        }
    }

    /**
     * Create ad campaign
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> createAd(String appId, Map<String, Object> adData) {
        ensureAdsTable(); // Ensure table exists before insert
        try {
            String adId = UUID.randomUUID().toString();
            Map<String, Object> data = new HashMap<>(adData);
            String platform = nonBlankOrDefault(asString(data.get("platform")), "").toLowerCase();

            Map<String, Object> publishResult = new HashMap<>();
            boolean published = false;
            String publishMessage = "Ad saved only";

            if ("facebook_ads".equals(platform)) {
                publishResult = publishToFacebookAdsCampaign(data);
                published = Boolean.TRUE.equals(publishResult.get("success"));
                publishMessage = asString(publishResult.getOrDefault("message", published ? "Published Facebook ads campaign" : "Facebook ads publish failed"));
            } else if ("facebook".equals(platform)) {
                // Backward compatible: if ad account info is present, use real Facebook Ads API.
                // Otherwise fallback to fanpage post flow.
                if (hasFacebookAdsCredentials(data)) {
                    publishResult = publishToFacebookAdsCampaign(data);
                } else {
                    publishResult = publishToFacebook(data);
                }
                published = Boolean.TRUE.equals(publishResult.get("success"));
                publishMessage = asString(publishResult.getOrDefault("message", published ? "Published to Facebook" : "Facebook publish failed"));
            } else if ("google_ads".equals(platform)) {
                publishResult = publishToGoogleAdsCampaign(data);
                published = Boolean.TRUE.equals(publishResult.get("success"));
                publishMessage = asString(publishResult.getOrDefault("message", published ? "Published Google ads campaign" : "Google ads publish failed"));
            } else if ("google".equals(platform)) {
                // Backward compatible: if Google Ads credentials are present, create real campaign.
                // Otherwise fallback to URL publish flow.
                if (hasGoogleAdsCredentials(data)) {
                    publishResult = publishToGoogleAdsCampaign(data);
                } else {
                    publishResult = publishToGoogle(data);
                }
                published = Boolean.TRUE.equals(publishResult.get("success"));
                publishMessage = asString(publishResult.getOrDefault("message", published ? "Published to Google" : "Google publish failed"));
            } else {
                publishResult.put("success", false);
                publishResult.put("message", "Unsupported platform for auto publish: " + platform);
                publishMessage = asString(publishResult.get("message"));
            }

            data.put("id", UUID.randomUUID().toString());
            data.put("ad_id", adId);
            data.put("app_id", appId);
            data.put("created_at", Instant.now().toEpochMilli());
            data.put("status", published ? "active" : "pending");
            data.put("publish_status", published ? "published" : "failed");
            data.put("publish_message", publishMessage);
            data.put("publish_result", publishResult);
            
            recordManager.createRecord(appId, TABLE_ADS, data, List.of("ad_id"));
            
            logger.info("Ad created: {} (app: {}, platform: {}, published: {})", adId, appId, platform, published);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("ad", data);
            result.put("published", published);
            result.put("publish_result", publishResult);
            return result;
            
        } catch (Exception e) {
            logger.error("Error creating ad", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }
    }

    /**
     * Get ads with statistics
     * TODO: Requires filtering crm_ads table
     */
    public List<Map<String, Object>> getAdsWithStats(String appId, String status, String platform) {
        try {
            logger.warn("getAdsWithStats() not yet implemented");
            return new ArrayList<>();
        } catch (Exception e) {
            logger.error("Error getting ads", e);
            return new ArrayList<>();
        }
    }

    /**
     * Get aggregated ad statistics
     * TODO: Requires filtering and aggregation
     */
    public Map<String, Object> getAdsStats(String appId, String fromDate, String toDate) {
        try {
            logger.warn("getAdsStats() not yet implemented");
            Map<String, Object> stats = new HashMap<>();
            stats.put("total_ads", 0);
            stats.put("active_ads", 0);
            stats.put("total_spend", 0.0);
            stats.put("total_impressions", 0);
            stats.put("total_clicks", 0);
            stats.put("total_conversions", 0);
            stats.put("by_platform", new HashMap<String, Map<String, Object>>());
            return stats;
        } catch (Exception e) {
            logger.error("Error getting ads stats", e);
            return new HashMap<>();
        }
    }

    private List<Map<String, Object>> safeRows(Map<String, Object> scanResult) {
        if (scanResult == null) {
            return new ArrayList<>();
        }
        Object rowsObj = scanResult.get("rows");
        if (rowsObj instanceof List<?>) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Object item : (List<?>) rowsObj) {
                if (item instanceof Map<?, ?> mapItem) {
                    Map<String, Object> casted = new HashMap<>();
                    for (Map.Entry<?, ?> entry : mapItem.entrySet()) {
                        if (entry.getKey() != null) {
                            casted.put(entry.getKey().toString(), entry.getValue());
                        }
                    }
                    rows.add(casted);
                }
            }
            return rows;
        }
        return new ArrayList<>();
    }

    private boolean isContactedStatus(String status) {
        return "contacted".equals(status) || "interested".equals(status) || "purchased".equals(status);
    }

    private Object firstNonNull(Object primary, Object fallback) {
        return primary != null ? primary : fallback;
    }

    private String canonicalSource(Object rawSource) {
        String source = nonBlankOrDefault(asString(rawSource), "unknown").toLowerCase();
        if (source.contains("facebook") || source.contains("fb") || source.contains("instagram")) return "facebook";
        if (source.contains("zalo")) return "zalo";
        if (source.contains("google")) return "google";
        if (source.contains("chat")) return "chat";
        if (source.contains("direct")) return "direct";
        if (source.contains("referral")) return "referral";
        if (source.contains("website") || source.contains("web")) return "website";
        return source;
    }

    private String nonBlankOrDefault(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value;
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        return String.valueOf(value);
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value == null) {
            return 0.0;
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception e) {
            return 0.0;
        }
    }

    private long asEpochMillis(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }

        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return 0L;
        }

        try {
            return Long.parseLong(text);
        } catch (Exception ignored) {
            // Continue with ISO date parsing
        }

        try {
            return Instant.parse(text).toEpochMilli();
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private Long parseDateBoundary(String input, boolean endOfDay) {
        if (input == null || input.isBlank()) {
            return null;
        }
        String value = input.trim();
        try {
            LocalDate date = LocalDate.parse(value);
            long start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            if (endOfDay) {
                return start + 86_399_999L;
            }
            return start;
        } catch (Exception ignored) {
            // Continue parsing
        }

        try {
            return Instant.parse(value).toEpochMilli();
        } catch (Exception ignored) {
            // Continue parsing
        }

        try {
            return Long.parseLong(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean inRange(long ts, Long fromTs, Long toTs) {
        if (ts <= 0) {
            return false;
        }
        if (fromTs != null && ts < fromTs) {
            return false;
        }
        if (toTs != null && ts > toTs) {
            return false;
        }
        return true;
    }

    private String toDateKey(long ts) {
        if (ts <= 0) {
            return "";
        }
        try {
            return Instant.ofEpochMilli(ts).atZone(ZoneOffset.UTC).toLocalDate().toString();
        } catch (Exception e) {
            return "";
        }
    }

    private Map<String, Object> publishToFacebook(Map<String, Object> adData) {
        Map<String, Object> result = new HashMap<>();
        try {
            String pageId = nonBlankOrDefault(asString(adData.get("pageId")), "");
            String pageAccessToken = nonBlankOrDefault(asString(adData.get("pageAccessToken")), "");
            String message = nonBlankOrDefault(asString(firstNonNull(adData.get("message"), adData.get("name"))), "");
            String link = nonBlankOrDefault(asString(firstNonNull(adData.get("link"), adData.get("target_url"))), "");
            String imageUrl = nonBlankOrDefault(asString(firstNonNull(adData.get("imageUrl"), adData.get("thumbnail"))), "");

            if (pageId.isEmpty() || pageAccessToken.isEmpty() || message.isEmpty()) {
                result.put("success", false);
                result.put("message", "Missing pageId/pageAccessToken/message for Facebook publish");
                return result;
            }

            String fbUrl;
            Map<String, String> payload = new HashMap<>();
            payload.put("access_token", pageAccessToken);
            if (!imageUrl.isEmpty()) {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/photos";
                payload.put("url", imageUrl);
                payload.put("caption", message);
            } else {
                fbUrl = "https://graph.facebook.com/v18.0/" + pageId + "/feed";
                payload.put("message", message);
                if (!link.isEmpty()) {
                    payload.put("link", link);
                }
            }

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            org.springframework.http.HttpEntity<Map<String, String>> entity = new org.springframework.http.HttpEntity<>(payload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> fbResponse =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(fbUrl, entity, Map.class);

            if (fbResponse.getStatusCode().is2xxSuccessful()) {
                Map<String, Object> body = fbResponse.getBody();
                result.put("success", true);
                result.put("message", "Published to Facebook successfully");
                result.put("post_id", body != null ? body.get("id") : null);
                result.put("response", body);
            } else {
                result.put("success", false);
                result.put("message", "Facebook API error");
                result.put("response", fbResponse.getBody());
            }
        } catch (Exception e) {
            logger.error("Error publishing ad to Facebook", e);
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return result;
    }

    private Map<String, Object> publishToGoogle(Map<String, Object> adData) {
        Map<String, Object> result = new HashMap<>();
        try {
            String url = nonBlankOrDefault(asString(firstNonNull(adData.get("target_url"), adData.get("link"))), "");
            String action = nonBlankOrDefault(asString(adData.get("google_action")), "publish");

            if (url.isEmpty()) {
                result.put("success", false);
                result.put("message", "Missing target_url/link for Google publish");
                return result;
            }

            GoogleIndexService.IndexingResult indexingResult = googleIndexService.submitUrlToGoogle(url, action);
            result.put("success", indexingResult.success);
            result.put("message", indexingResult.message);
            result.put("response", indexingResult.responseBody);
            result.put("url", url);
            result.put("action", action);
        } catch (Exception e) {
            logger.error("Error publishing ad to Google", e);
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return result;
    }

    private boolean hasFacebookAdsCredentials(Map<String, Object> adData) {
        String adAccountId = nonBlankOrDefault(asString(adData.get("adAccountId")), "");
        String accessToken = nonBlankOrDefault(asString(adData.get("pageAccessToken")), "");
        return !adAccountId.isEmpty() && !accessToken.isEmpty();
    }

    private Map<String, Object> publishToFacebookAdsCampaign(Map<String, Object> adData) {
        Map<String, Object> result = new HashMap<>();
        try {
            String adAccountId = nonBlankOrDefault(asString(adData.get("adAccountId")), "");
            String accessToken = nonBlankOrDefault(asString(adData.get("pageAccessToken")), "");
            String campaignName = nonBlankOrDefault(asString(firstNonNull(adData.get("campaign_name"), adData.get("name"))), "CRM Campaign " + Instant.now().toEpochMilli());
            String objective = nonBlankOrDefault(asString(adData.get("objective")), "OUTCOME_TRAFFIC");
            String status = nonBlankOrDefault(asString(adData.get("status")), "PAUSED");
            String pageId = nonBlankOrDefault(asString(adData.get("pageId")), "");
            String destinationUrl = nonBlankOrDefault(asString(firstNonNull(adData.get("target_url"), adData.get("link"))), "");
            String headline = nonBlankOrDefault(asString(firstNonNull(adData.get("headline"), adData.get("title"))), "Khuyen mai dac biet");
            String primaryText = nonBlankOrDefault(asString(firstNonNull(adData.get("message"), adData.get("body"))), campaignName);
            String description = nonBlankOrDefault(asString(adData.get("description")), "");
            String ctaType = nonBlankOrDefault(asString(adData.get("call_to_action")), "LEARN_MORE");

            if (adAccountId.isEmpty() || accessToken.isEmpty() || pageId.isEmpty() || destinationUrl.isEmpty()) {
                result.put("success", false);
                result.put("message", "Missing adAccountId/pageAccessToken/pageId/target_url for Facebook paid ads");
                return result;
            }

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED);

            // 1) Create campaign
            String campaignUrl = "https://graph.facebook.com/v18.0/act_" + adAccountId + "/campaigns";
            org.springframework.util.LinkedMultiValueMap<String, String> campaignPayload = new org.springframework.util.LinkedMultiValueMap<>();
            campaignPayload.add("name", campaignName);
            campaignPayload.add("objective", objective);
            campaignPayload.add("status", status);
            campaignPayload.add("special_ad_categories", "[]");
            campaignPayload.add("access_token", accessToken);

            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> campaignEntity =
                    new org.springframework.http.HttpEntity<>(campaignPayload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> campaignResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(campaignUrl, campaignEntity, Map.class);

            if (!campaignResp.getStatusCode().is2xxSuccessful()) {
                result.put("success", false);
                result.put("message", "Facebook Ads campaign creation failed");
                result.put("response", campaignResp.getBody());
                return result;
            }

            String campaignId = asString(campaignResp.getBody() != null ? campaignResp.getBody().get("id") : null);
            if (campaignId == null || campaignId.isBlank()) {
                result.put("success", false);
                result.put("message", "Facebook campaign created but id missing");
                result.put("response", campaignResp.getBody());
                return result;
            }

            // 2) Create ad set
            long dailyBudget = 200_000L; // in smallest currency unit
            Object budgetObj = firstNonNull(adData.get("daily_budget"), adData.get("budget"));
            if (budgetObj instanceof Number n) {
                dailyBudget = Math.max(1000L, n.longValue());
            } else if (budgetObj != null) {
                try {
                    dailyBudget = Math.max(1000L, Long.parseLong(String.valueOf(budgetObj)));
                } catch (Exception ignored) {
                    // keep default
                }
            }

            String adSetName = nonBlankOrDefault(asString(adData.get("adset_name")), campaignName + " AdSet");
            String adSetUrl = "https://graph.facebook.com/v18.0/act_" + adAccountId + "/adsets";
            org.springframework.util.LinkedMultiValueMap<String, String> adSetPayload = new org.springframework.util.LinkedMultiValueMap<>();
            adSetPayload.add("name", adSetName);
            adSetPayload.add("campaign_id", campaignId);
            adSetPayload.add("daily_budget", String.valueOf(dailyBudget));
            adSetPayload.add("billing_event", "IMPRESSIONS");
            adSetPayload.add("optimization_goal", nonBlankOrDefault(asString(adData.get("optimization_goal")), "LINK_CLICKS"));
            adSetPayload.add("bid_strategy", nonBlankOrDefault(asString(adData.get("bid_strategy")), "LOWEST_COST_WITHOUT_CAP"));
            adSetPayload.add("status", status);
            adSetPayload.add("targeting", buildFacebookTargetingJson(adData));
            adSetPayload.add("access_token", accessToken);

            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> adSetEntity =
                    new org.springframework.http.HttpEntity<>(adSetPayload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> adSetResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(adSetUrl, adSetEntity, Map.class);

            if (!adSetResp.getStatusCode().is2xxSuccessful()) {
                result.put("success", false);
                result.put("message", "Facebook AdSet creation failed");
                result.put("campaign_id", campaignId);
                result.put("campaign_response", campaignResp.getBody());
                result.put("adset_response", adSetResp.getBody());
                return result;
            }

            String adSetId = asString(adSetResp.getBody() != null ? adSetResp.getBody().get("id") : null);
            if (adSetId == null || adSetId.isBlank()) {
                result.put("success", false);
                result.put("message", "Facebook AdSet created but id missing");
                result.put("campaign_id", campaignId);
                result.put("campaign_response", campaignResp.getBody());
                result.put("adset_response", adSetResp.getBody());
                return result;
            }

            // 3) Create creative
            String creativeName = nonBlankOrDefault(asString(adData.get("creative_name")), campaignName + " Creative");
            String creativeUrl = "https://graph.facebook.com/v18.0/act_" + adAccountId + "/adcreatives";
            org.springframework.util.LinkedMultiValueMap<String, String> creativePayload = new org.springframework.util.LinkedMultiValueMap<>();
            creativePayload.add("name", creativeName);
            creativePayload.add("object_story_spec", buildFacebookObjectStorySpecJson(pageId, destinationUrl, headline, primaryText, description, ctaType));
            creativePayload.add("access_token", accessToken);

            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> creativeEntity =
                    new org.springframework.http.HttpEntity<>(creativePayload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> creativeResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(creativeUrl, creativeEntity, Map.class);

            if (!creativeResp.getStatusCode().is2xxSuccessful()) {
                result.put("success", false);
                result.put("message", "Facebook creative creation failed");
                result.put("campaign_id", campaignId);
                result.put("adset_id", adSetId);
                result.put("campaign_response", campaignResp.getBody());
                result.put("adset_response", adSetResp.getBody());
                result.put("creative_response", creativeResp.getBody());
                return result;
            }

            String creativeId = asString(creativeResp.getBody() != null ? creativeResp.getBody().get("id") : null);
            if (creativeId == null || creativeId.isBlank()) {
                result.put("success", false);
                result.put("message", "Facebook creative created but id missing");
                result.put("campaign_id", campaignId);
                result.put("adset_id", adSetId);
                result.put("campaign_response", campaignResp.getBody());
                result.put("adset_response", adSetResp.getBody());
                result.put("creative_response", creativeResp.getBody());
                return result;
            }

            // 4) Create ad
            String adName = nonBlankOrDefault(asString(adData.get("ad_name")), campaignName + " Ad");
            String adUrl = "https://graph.facebook.com/v18.0/act_" + adAccountId + "/ads";
            org.springframework.util.LinkedMultiValueMap<String, String> adPayload = new org.springframework.util.LinkedMultiValueMap<>();
            adPayload.add("name", adName);
            adPayload.add("adset_id", adSetId);
            adPayload.add("status", status);
            adPayload.add("creative", "{\"creative_id\":\"" + creativeId + "\"}");
            adPayload.add("access_token", accessToken);

            org.springframework.http.HttpEntity<org.springframework.util.LinkedMultiValueMap<String, String>> adEntity =
                    new org.springframework.http.HttpEntity<>(adPayload, headers);

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> adResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(adUrl, adEntity, Map.class);

            if (!adResp.getStatusCode().is2xxSuccessful()) {
                result.put("success", false);
                result.put("message", "Facebook ad creation failed");
                result.put("campaign_id", campaignId);
                result.put("adset_id", adSetId);
                result.put("creative_id", creativeId);
                result.put("campaign_response", campaignResp.getBody());
                result.put("adset_response", adSetResp.getBody());
                result.put("creative_response", creativeResp.getBody());
                result.put("ad_response", adResp.getBody());
                return result;
            }

            String adId = asString(adResp.getBody() != null ? adResp.getBody().get("id") : null);
            result.put("success", true);
            result.put("message", "Facebook paid ad flow created successfully");
            result.put("campaign_id", campaignId);
            result.put("adset_id", adSetId);
            result.put("creative_id", creativeId);
            result.put("ad_id", adId);
            result.put("campaign_response", campaignResp.getBody());
            result.put("adset_response", adSetResp.getBody());
            result.put("creative_response", creativeResp.getBody());
            result.put("ad_response", adResp.getBody());
        } catch (Exception e) {
            logger.error("Error creating Facebook ads campaign", e);
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return result;
    }

    private boolean hasGoogleAdsCredentials(Map<String, Object> adData) {
        String customerId = nonBlankOrDefault(asString(adData.get("customer_id")), "");
        String accessToken = nonBlankOrDefault(asString(adData.get("access_token")), "");
        String developerToken = nonBlankOrDefault(asString(adData.get("developer_token")), "");
        return !customerId.isEmpty() && !accessToken.isEmpty() && !developerToken.isEmpty();
    }

    private Map<String, Object> publishToGoogleAdsCampaign(Map<String, Object> adData) {
        Map<String, Object> result = new HashMap<>();
        try {
            String customerId = nonBlankOrDefault(asString(adData.get("customer_id")), "");
            String accessToken = nonBlankOrDefault(asString(adData.get("access_token")), "");
            String developerToken = nonBlankOrDefault(asString(adData.get("developer_token")), "");
            String loginCustomerId = nonBlankOrDefault(asString(adData.get("login_customer_id")), "");

            if (customerId.isEmpty() || accessToken.isEmpty() || developerToken.isEmpty()) {
                result.put("success", false);
                result.put("message", "Missing customer_id/access_token/developer_token for Google Ads campaign");
                return result;
            }

            String campaignName = nonBlankOrDefault(asString(firstNonNull(adData.get("campaign_name"), adData.get("name"))),
                    "CRM Google Campaign " + Instant.now().toEpochMilli());
                String finalUrl = nonBlankOrDefault(
                    asString(firstNonNull(adData.get("final_url"), firstNonNull(adData.get("target_url"), adData.get("link")))),
                    "");
            if (finalUrl.isEmpty()) {
                result.put("success", false);
                result.put("message", "Missing final_url/target_url/link for Google paid ad");
                return result;
            }
            long budgetMicros = 50_000_000L;
            Object budgetObj = firstNonNull(adData.get("budget_micros"), adData.get("budgetMicros"));
            if (budgetObj instanceof Number n) {
                budgetMicros = n.longValue();
            } else if (budgetObj != null) {
                try {
                    budgetMicros = Long.parseLong(String.valueOf(budgetObj));
                } catch (Exception ignored) {
                    // keep default
                }
            }

            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            headers.setBearerAuth(accessToken);
            headers.set("developer-token", developerToken);
            if (!loginCustomerId.isEmpty()) {
                headers.set("login-customer-id", loginCustomerId);
            }

            String budgetUrl = "https://googleads.googleapis.com/v18/customers/" + customerId + "/campaignBudgets:mutate";
            Map<String, Object> budgetCreate = new HashMap<>();
            budgetCreate.put("name", campaignName + " Budget");
            budgetCreate.put("deliveryMethod", "STANDARD");
            budgetCreate.put("amountMicros", String.valueOf(budgetMicros));
            budgetCreate.put("explicitlyShared", false);

            Map<String, Object> budgetOp = new HashMap<>();
            budgetOp.put("create", budgetCreate);
            Map<String, Object> budgetBody = new HashMap<>();
            budgetBody.put("operations", List.of(budgetOp));

            org.springframework.http.HttpEntity<Map<String, Object>> budgetEntity = new org.springframework.http.HttpEntity<>(budgetBody, headers);
            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> budgetResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(budgetUrl, budgetEntity, Map.class);

            if (!budgetResp.getStatusCode().is2xxSuccessful()) {
                result.put("success", false);
                result.put("message", "Google Ads budget creation failed");
                result.put("response", budgetResp.getBody());
                return result;
            }

            String budgetResourceName = "";
            Object budgetBodyObj = budgetResp.getBody();
            if (budgetBodyObj instanceof Map<?, ?> m) {
                Object resultsObj = m.get("results");
                if (resultsObj instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> item) {
                    Object rn = item.get("resourceName");
                    if (rn != null) {
                        budgetResourceName = String.valueOf(rn);
                    }
                }
            }

            if (budgetResourceName.isEmpty()) {
                result.put("success", false);
                result.put("message", "Google Ads budget created but resourceName missing");
                result.put("response", budgetResp.getBody());
                return result;
            }

            String campaignUrl = "https://googleads.googleapis.com/v18/customers/" + customerId + "/campaigns:mutate";
            Map<String, Object> networkSettings = new HashMap<>();
            networkSettings.put("targetGoogleSearch", true);
            networkSettings.put("targetSearchNetwork", true);
            networkSettings.put("targetContentNetwork", false);
            networkSettings.put("targetPartnerSearchNetwork", false);

            Map<String, Object> campaignCreate = new HashMap<>();
            campaignCreate.put("name", campaignName);
            campaignCreate.put("advertisingChannelType", "SEARCH");
            campaignCreate.put("status", nonBlankOrDefault(asString(adData.get("status")), "PAUSED"));
            campaignCreate.put("campaignBudget", budgetResourceName);
            campaignCreate.put("manualCpc", new HashMap<String, Object>());
            campaignCreate.put("networkSettings", networkSettings);

            Map<String, Object> campaignOp = new HashMap<>();
            campaignOp.put("create", campaignCreate);
            Map<String, Object> campaignBody = new HashMap<>();
            campaignBody.put("operations", List.of(campaignOp));

            org.springframework.http.HttpEntity<Map<String, Object>> campaignEntity = new org.springframework.http.HttpEntity<>(campaignBody, headers);
            @SuppressWarnings({"unchecked", "rawtypes"})
            org.springframework.http.ResponseEntity<Map<String, Object>> campaignResp =
                    (org.springframework.http.ResponseEntity) restTemplate.postForEntity(campaignUrl, campaignEntity, Map.class);

            if (campaignResp.getStatusCode().is2xxSuccessful()) {
                String campaignResourceName = extractFirstResourceName(campaignResp.getBody());
                if (campaignResourceName == null || campaignResourceName.isBlank()) {
                    result.put("success", false);
                    result.put("message", "Google campaign created but resourceName missing");
                    result.put("budget_response", budgetResp.getBody());
                    result.put("campaign_response", campaignResp.getBody());
                    return result;
                }

                // 3) Create Ad Group
                String adGroupName = nonBlankOrDefault(asString(adData.get("ad_group_name")), campaignName + " AdGroup");
                long cpcBidMicros = 2_000_000L;
                Object cpcObj = firstNonNull(adData.get("cpc_bid_micros"), adData.get("cpcBidMicros"));
                if (cpcObj instanceof Number n) {
                    cpcBidMicros = n.longValue();
                } else if (cpcObj != null) {
                    try {
                        cpcBidMicros = Long.parseLong(String.valueOf(cpcObj));
                    } catch (Exception ignored) {
                        // keep default
                    }
                }

                String adGroupUrl = "https://googleads.googleapis.com/v18/customers/" + customerId + "/adGroups:mutate";
                Map<String, Object> adGroupCreate = new HashMap<>();
                adGroupCreate.put("name", adGroupName);
                adGroupCreate.put("campaign", campaignResourceName);
                adGroupCreate.put("status", nonBlankOrDefault(asString(adData.get("status")), "PAUSED"));
                adGroupCreate.put("type", "SEARCH_STANDARD");
                adGroupCreate.put("cpcBidMicros", String.valueOf(cpcBidMicros));

                Map<String, Object> adGroupOp = new HashMap<>();
                adGroupOp.put("create", adGroupCreate);
                Map<String, Object> adGroupBody = new HashMap<>();
                adGroupBody.put("operations", List.of(adGroupOp));

                org.springframework.http.HttpEntity<Map<String, Object>> adGroupEntity = new org.springframework.http.HttpEntity<>(adGroupBody, headers);
                @SuppressWarnings({"unchecked", "rawtypes"})
                org.springframework.http.ResponseEntity<Map<String, Object>> adGroupResp =
                        (org.springframework.http.ResponseEntity) restTemplate.postForEntity(adGroupUrl, adGroupEntity, Map.class);

                if (!adGroupResp.getStatusCode().is2xxSuccessful()) {
                    result.put("success", false);
                    result.put("message", "Google ad group creation failed");
                    result.put("budget_response", budgetResp.getBody());
                    result.put("campaign_response", campaignResp.getBody());
                    result.put("ad_group_response", adGroupResp.getBody());
                    return result;
                }

                String adGroupResourceName = extractFirstResourceName(adGroupResp.getBody());
                if (adGroupResourceName == null || adGroupResourceName.isBlank()) {
                    result.put("success", false);
                    result.put("message", "Google ad group created but resourceName missing");
                    result.put("budget_response", budgetResp.getBody());
                    result.put("campaign_response", campaignResp.getBody());
                    result.put("ad_group_response", adGroupResp.getBody());
                    return result;
                }

                // 4) Create Ad (Responsive Search Ad)
                String adGroupAdUrl = "https://googleads.googleapis.com/v18/customers/" + customerId + "/adGroupAds:mutate";
                List<Map<String, Object>> headlines = new ArrayList<>();
                headlines.add(Map.of("text", nonBlankOrDefault(asString(adData.get("headline1")), campaignName)));
                headlines.add(Map.of("text", nonBlankOrDefault(asString(adData.get("headline2")), "Uu dai hap dan")));
                headlines.add(Map.of("text", nonBlankOrDefault(asString(adData.get("headline3")), "Dang ky ngay")));

                List<Map<String, Object>> descriptions = new ArrayList<>();
                descriptions.add(Map.of("text", nonBlankOrDefault(asString(adData.get("description1")), "Trai nghiem giai phap toi uu cho doanh nghiep")));
                descriptions.add(Map.of("text", nonBlankOrDefault(asString(adData.get("description2")), "Lien he de nhan tu van chi tiet")));

                Map<String, Object> rsa = new HashMap<>();
                rsa.put("headlines", headlines);
                rsa.put("descriptions", descriptions);

                Map<String, Object> adCreate = new HashMap<>();
                adCreate.put("finalUrls", List.of(finalUrl));
                adCreate.put("responsiveSearchAd", rsa);

                Map<String, Object> adGroupAdCreate = new HashMap<>();
                adGroupAdCreate.put("adGroup", adGroupResourceName);
                adGroupAdCreate.put("status", nonBlankOrDefault(asString(adData.get("status")), "PAUSED"));
                adGroupAdCreate.put("ad", adCreate);

                Map<String, Object> adGroupAdOp = new HashMap<>();
                adGroupAdOp.put("create", adGroupAdCreate);
                Map<String, Object> adGroupAdBody = new HashMap<>();
                adGroupAdBody.put("operations", List.of(adGroupAdOp));

                org.springframework.http.HttpEntity<Map<String, Object>> adGroupAdEntity = new org.springframework.http.HttpEntity<>(adGroupAdBody, headers);
                @SuppressWarnings({"unchecked", "rawtypes"})
                org.springframework.http.ResponseEntity<Map<String, Object>> adGroupAdResp =
                        (org.springframework.http.ResponseEntity) restTemplate.postForEntity(adGroupAdUrl, adGroupAdEntity, Map.class);

                if (!adGroupAdResp.getStatusCode().is2xxSuccessful()) {
                    result.put("success", false);
                    result.put("message", "Google ad creation failed");
                    result.put("budget_response", budgetResp.getBody());
                    result.put("campaign_response", campaignResp.getBody());
                    result.put("ad_group_response", adGroupResp.getBody());
                    result.put("ad_group_ad_response", adGroupAdResp.getBody());
                    return result;
                }

                result.put("success", true);
                result.put("message", "Google paid ad flow created successfully");
                result.put("budget_response", budgetResp.getBody());
                result.put("campaign_response", campaignResp.getBody());
                result.put("ad_group_response", adGroupResp.getBody());
                result.put("ad_group_ad_response", adGroupAdResp.getBody());
            } else {
                result.put("success", false);
                result.put("message", "Google Ads campaign creation failed");
                result.put("budget_response", budgetResp.getBody());
                result.put("campaign_response", campaignResp.getBody());
            }
        } catch (Exception e) {
            logger.error("Error creating Google ads campaign", e);
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return result;
    }

    private String buildFacebookTargetingJson(Map<String, Object> adData) {
        List<String> countries = new ArrayList<>();
        Object countriesObj = firstNonNull(adData.get("countries"), adData.get("target_countries"));
        if (countriesObj instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    countries.add(String.valueOf(item));
                }
            }
        }
        if (countries.isEmpty()) {
            countries.add("VN");
        }

        int ageMin = 18;
        int ageMax = 65;
        Object ageMinObj = firstNonNull(adData.get("age_min"), adData.get("ageMin"));
        Object ageMaxObj = firstNonNull(adData.get("age_max"), adData.get("ageMax"));
        if (ageMinObj instanceof Number n) {
            ageMin = n.intValue();
        }
        if (ageMaxObj instanceof Number n) {
            ageMax = n.intValue();
        }

        Map<String, Object> geo = new HashMap<>();
        geo.put("countries", countries);
        Map<String, Object> targeting = new HashMap<>();
        targeting.put("geo_locations", geo);
        targeting.put("age_min", ageMin);
        targeting.put("age_max", ageMax);

        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(targeting);
        } catch (Exception e) {
            return "{\"geo_locations\":{\"countries\":[\"VN\"]},\"age_min\":18,\"age_max\":65}";
        }
    }

    private String buildFacebookObjectStorySpecJson(String pageId, String link, String name, String message,
            String description, String ctaType) {
        Map<String, Object> ctaValue = new HashMap<>();
        ctaValue.put("link", link);

        Map<String, Object> cta = new HashMap<>();
        cta.put("type", ctaType);
        cta.put("value", ctaValue);

        Map<String, Object> linkData = new HashMap<>();
        linkData.put("link", link);
        linkData.put("name", name);
        linkData.put("message", message);
        if (description != null && !description.isBlank()) {
            linkData.put("description", description);
        }
        linkData.put("call_to_action", cta);

        Map<String, Object> storySpec = new HashMap<>();
        storySpec.put("page_id", pageId);
        storySpec.put("link_data", linkData);

        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(storySpec);
        } catch (Exception e) {
            return "{\"page_id\":\"" + pageId + "\",\"link_data\":{\"link\":\"" + link + "\",\"name\":\"" + name + "\",\"message\":\"" + message + "\"}}";
        }
    }

    private String extractFirstResourceName(Map<String, Object> responseBody) {
        if (responseBody == null) {
            return "";
        }
        Object resultsObj = responseBody.get("results");
        if (resultsObj instanceof List<?> list && !list.isEmpty()) {
            Object first = list.get(0);
            if (first instanceof Map<?, ?> m) {
                Object resourceName = m.get("resourceName");
                if (resourceName != null) {
                    return String.valueOf(resourceName);
                }
            }
        }
        return "";
    }
}
