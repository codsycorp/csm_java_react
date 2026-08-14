package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	crmCustomers      = "crm_customers"
	crmPurchases      = "crm_purchases"
	crmContactHistory = "crm_contact_history"
	crmAds            = "crm_ads"
)

type CrmService struct {
	rm         *data.RecordManager
	httpClient *http.Client
}

func NewCrmService(rm *data.RecordManager) *CrmService {
	s := &CrmService{
		rm:         rm,
		httpClient: &http.Client{Timeout: 45 * time.Second},
	}
	s.InitializeTables()
	return s
}

func (s *CrmService) InitializeTables() {
	for _, spec := range []struct {
		name string
		pk   []string
	}{
		{crmCustomers, []string{"phone", "app_id"}},
		{crmPurchases, []string{"purchase_id"}},
		{crmContactHistory, []string{"history_id"}},
		{crmAds, []string{"ad_id"}},
	} {
		existing := s.rm.Find("csm", "index", model.EqFilter("id", spec.name))
		if len(existing) > 0 {
			continue
		}
		_, _ = s.rm.CreateRecord("csm", "index", map[string]any{
			"id":     spec.name,
			"struct": map[string]any{"fieldsPK": spec.pk},
		}, []string{"id"})
	}
}

func (s *CrmService) CreateOrUpdateCustomer(appID string, customer map[string]any) map[string]any {
	phone, _ := customer["phone"].(string)
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return crmErr("Phone number is required")
	}
	customer["phone"] = phone
	customer["app_id"] = appID
	if _, ok := customer["id"]; !ok {
		customer["id"] = uuid.NewString()
	}
	now := time.Now().UnixMilli()
	if _, ok := customer["created_at"]; !ok {
		customer["created_at"] = now
	}
	customer["updated_at"] = now
	if _, err := s.rm.CreateRecord(appID, crmCustomers, customer, []string{"phone"}); err != nil {
		return crmErr(err.Error())
	}
	return map[string]any{"success": true, "customer": customer}
}

func (s *CrmService) GetCustomers(appID, status, search string, offset, limit int) []map[string]any {
	filter := model.SearchFilter{}
	if status != "" {
		filter = model.EqFilter("status", status)
	}
	page := s.rm.FilterWithPagination(appID, crmCustomers, filter, "", offset, limit, nil)
	rows := rowsAsMaps(page["rows"])
	if search == "" {
		return rows
	}
	q := strings.ToLower(search)
	var out []map[string]any
	for _, row := range rows {
		phone, _ := row["phone"].(string)
		name, _ := row["name"].(string)
		if strings.Contains(phone, q) || strings.Contains(strings.ToLower(name), q) {
			out = append(out, row)
		}
	}
	return out
}

func (s *CrmService) GetCustomerByPhone(appID, phone string) map[string]any {
	return s.rm.Find(appID, crmCustomers, model.EqFilter("phone", phone))
}

func (s *CrmService) AssignCustomer(appID, phone, employeeID string) map[string]any {
	customer := s.GetCustomerByPhone(appID, phone)
	if len(customer) == 0 {
		return crmErr("Customer not found")
	}
	customer["assigned_to"] = employeeID
	customer["updated_at"] = time.Now().UnixMilli()
	_, _ = s.rm.CreateRecord(appID, crmCustomers, customer, []string{"phone"})
	return map[string]any{"success": true}
}

func (s *CrmService) UpdateCustomerStatus(appID, phone, status, notes string) map[string]any {
	customer := s.GetCustomerByPhone(appID, phone)
	if len(customer) == 0 {
		return crmErr("Customer not found")
	}
	customer["status"] = status
	if notes != "" {
		customer["notes"] = notes
	}
	customer["updated_at"] = time.Now().UnixMilli()
	_, _ = s.rm.CreateRecord(appID, crmCustomers, customer, []string{"phone"})
	return map[string]any{"success": true}
}

func (s *CrmService) AddPurchase(appID, phone string, purchase map[string]any) map[string]any {
	purchaseID := uuid.NewString()
	purchase["id"] = uuid.NewString()
	purchase["purchase_id"] = purchaseID
	purchase["app_id"] = appID
	purchase["customer_phone"] = phone
	purchase["created_at"] = time.Now().UnixMilli()
	if _, err := s.rm.CreateRecord(appID, crmPurchases, purchase, []string{"purchase_id"}); err != nil {
		return crmErr(err.Error())
	}
	return map[string]any{"success": true, "purchase": purchase}
}

func (s *CrmService) AddContactHistory(appID, phone, contactType, notes, employeeID string) map[string]any {
	historyID := uuid.NewString()
	row := map[string]any{
		"id": historyID, "history_id": historyID, "app_id": appID, "customer_phone": phone,
		"contact_type": contactType, "notes": notes, "employee_id": employeeID,
		"created_at": time.Now().UnixMilli(),
	}
	if _, err := s.rm.CreateRecord(appID, crmContactHistory, row, []string{"history_id"}); err != nil {
		return crmErr(err.Error())
	}
	return map[string]any{"success": true, "history": row}
}

func (s *CrmService) GetUpcomingBirthdays(appID string) []map[string]any {
	page := s.rm.Filter(appID, crmCustomers, model.SearchFilter{})
	return rowsAsMaps(page["rows"])
}

func (s *CrmService) GetStats(appID string) map[string]any {
	customers := rowsAsMaps(s.rm.Filter(appID, crmCustomers, model.SearchFilter{})["rows"])
	return map[string]any{
		"totalCustomers":  len(customers),
		"activeCustomers": countStatus(customers, "active"),
		"newCustomers":    len(customers),
	}
}

func (s *CrmService) GetAds(appID string) []map[string]any {
	return rowsAsMaps(s.rm.Filter(appID, crmAds, model.SearchFilter{})["rows"])
}

func (s *CrmService) CreateAd(appID string, ad map[string]any) map[string]any {
	platform := strings.ToLower(strings.TrimSpace(fmt.Sprint(ad["platform"])))
	if platform == "google" || platform == "google_ads" {
		payload := ad
		if nested, ok := ad["adData"].(map[string]any); ok && len(nested) > 0 {
			payload = nested
		}
		payload["platform"] = "google_ads"
		result := s.createGoogleAdsCampaign(payload)
		if success, _ := result["success"].(bool); !success {
			return result
		}
		ad = cloneMap(payload)
		for k, v := range result {
			if k != "success" {
				ad["google_"+k] = v
			}
		}
	}
	ad["id"] = uuid.NewString()
	ad["ad_id"] = ad["id"]
	ad["app_id"] = appID
	ad["created_at"] = time.Now().UnixMilli()
	if _, err := s.rm.CreateRecord(appID, crmAds, ad, []string{"ad_id"}); err != nil {
		return crmErr(err.Error())
	}
	return map[string]any{"success": true, "ad": ad}
}

func (s *CrmService) createGoogleAdsCampaign(ad map[string]any) map[string]any {
	customerID := strings.TrimSpace(fmt.Sprint(ad["customer_id"]))
	accessToken := strings.TrimSpace(fmt.Sprint(ad["access_token"]))
	developerToken := strings.TrimSpace(fmt.Sprint(ad["developer_token"]))
	loginCustomerID := strings.TrimSpace(fmt.Sprint(ad["login_customer_id"]))
	finalURL := strings.TrimSpace(firstAdValue(ad, "final_url", "target_url", "link"))
	if customerID == "" || accessToken == "" || developerToken == "" {
		return crmErr("Google Ads cần customer_id, access_token và developer_token")
	}
	if _, err := strconv.ParseUint(strings.ReplaceAll(customerID, "-", ""), 10, 64); err != nil {
		return crmErr("Google Ads customer_id không hợp lệ")
	}
	parsedURL, err := url.Parse(finalURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || parsedURL.Host == "" {
		return crmErr("Google Ads cần final_url/target_url là URL http hoặc https hợp lệ")
	}

	campaignName := firstAdValue(ad, "campaign_name", "name")
	if campaignName == "" {
		campaignName = "CSM Google Campaign " + time.Now().Format("20060102-150405")
	}
	status := normalizeGoogleAdsStatus(firstAdValue(ad, "status"))
	budgetMicros := parseGoogleMicros(ad, []string{"budget_micros", "budgetMicros"}, 50_000_000)
	if _, exists := ad["budget_micros"]; !exists {
		if raw := firstAdValue(ad, "budget"); raw != "" {
			if value, parseErr := strconv.ParseFloat(raw, 64); parseErr == nil {
				budgetMicros = maxInt64(1_000_000, int64(value*1_000_000))
			}
		}
	}
	if budgetMicros < 1_000_000 {
		return crmErr("Google Ads budget_micros phải lớn hơn hoặc bằng 1000000")
	}
	cpcBidMicros := parseGoogleMicros(ad, []string{"cpc_bid_micros", "cpcBidMicros"}, 2_000_000)
	if cpcBidMicros < 1_000 {
		return crmErr("Google Ads cpc_bid_micros không hợp lệ")
	}

	base := "https://googleads.googleapis.com/v18/customers/" + url.PathEscape(strings.ReplaceAll(customerID, "-", ""))
	headers := map[string]string{
		"Authorization":   "Bearer " + accessToken,
		"developer-token": developerToken,
		"Content-Type":    "application/json",
	}
	if loginCustomerID != "" {
		headers["login-customer-id"] = strings.ReplaceAll(loginCustomerID, "-", "")
	}

	budget, err := s.googleAdsMutate(base+"/campaignBudgets:mutate", headers, map[string]any{
		"operations": []any{map[string]any{"create": map[string]any{
			"name": campaignName + " Budget", "deliveryMethod": "STANDARD",
			"amountMicros": strconv.FormatInt(budgetMicros, 10), "explicitlyShared": false,
		}}},
	})
	if err != nil {
		return crmErr("Google Ads tạo ngân sách thất bại: " + err.Error())
	}
	budgetResource := firstGoogleResourceName(budget)
	if budgetResource == "" {
		return map[string]any{"success": false, "message": "Google Ads tạo ngân sách nhưng không trả resourceName", "budget_response": budget}
	}

	campaign, err := s.googleAdsMutate(base+"/campaigns:mutate", headers, map[string]any{
		"operations": []any{map[string]any{"create": map[string]any{
			"name": campaignName, "advertisingChannelType": "SEARCH", "status": status,
			"campaignBudget": budgetResource, "manualCpc": map[string]any{},
			"networkSettings": map[string]any{"targetGoogleSearch": true, "targetSearchNetwork": true, "targetContentNetwork": false, "targetPartnerSearchNetwork": false},
		}}},
	})
	if err != nil {
		return map[string]any{"success": false, "message": "Google Ads tạo campaign thất bại: " + err.Error(), "budget_response": budget}
	}
	campaignResource := firstGoogleResourceName(campaign)
	if campaignResource == "" {
		return map[string]any{"success": false, "message": "Google Ads tạo campaign nhưng không trả resourceName", "budget_response": budget, "campaign_response": campaign}
	}

	adGroupName := firstAdValue(ad, "ad_group_name")
	if adGroupName == "" {
		adGroupName = campaignName + " Ad Group"
	}
	adGroup, err := s.googleAdsMutate(base+"/adGroups:mutate", headers, map[string]any{
		"operations": []any{map[string]any{"create": map[string]any{
			"name": adGroupName, "campaign": campaignResource, "status": status,
			"type": "SEARCH_STANDARD", "cpcBidMicros": strconv.FormatInt(cpcBidMicros, 10),
		}}},
	})
	if err != nil {
		return map[string]any{"success": false, "message": "Google Ads tạo ad group thất bại: " + err.Error(), "budget_response": budget, "campaign_response": campaign}
	}
	adGroupResource := firstGoogleResourceName(adGroup)
	if adGroupResource == "" {
		return map[string]any{"success": false, "message": "Google Ads tạo ad group nhưng không trả resourceName", "campaign_response": campaign, "ad_group_response": adGroup}
	}

	keywords := normalizeGoogleKeywords(ad)
	if len(keywords) > 0 {
		keywordOps := make([]any, 0, len(keywords))
		for _, keyword := range keywords {
			keywordOps = append(keywordOps, map[string]any{"create": map[string]any{
				"adGroup": adGroupResource,
				"status":  status,
				"keyword": map[string]any{"text": keyword, "matchType": "BROAD"},
			}})
		}
		keywordResponse, keywordErr := s.googleAdsMutate(base+"/adGroupCriteria:mutate", headers, map[string]any{"operations": keywordOps})
		if keywordErr != nil {
			return map[string]any{"success": false, "message": "Google Ads tạo keywords thất bại: " + keywordErr.Error(), "campaign_response": campaign, "ad_group_response": adGroup}
		}
		ad["google_keyword_response"] = keywordResponse
	}

	headlines := []any{
		map[string]any{"text": fallbackAdValue(ad, "headline1", campaignName)},
		map[string]any{"text": fallbackAdValue(ad, "headline2", "Giải pháp phù hợp cho doanh nghiệp")},
		map[string]any{"text": fallbackAdValue(ad, "headline3", "Liên hệ để được tư vấn")},
	}
	descriptions := []any{
		map[string]any{"text": fallbackAdValue(ad, "description1", "Tìm hiểu giải pháp rõ ràng, thực tế và dễ triển khai.")},
		map[string]any{"text": fallbackAdValue(ad, "description2", "Liên hệ Lê Anh CSM để nhận tư vấn chi tiết.")},
	}
	adGroupAd, err := s.googleAdsMutate(base+"/adGroupAds:mutate", headers, map[string]any{
		"operations": []any{map[string]any{"create": map[string]any{
			"adGroup": adGroupResource, "status": status,
			"ad": map[string]any{"finalUrls": []any{finalURL}, "responsiveSearchAd": map[string]any{
				"headlines": headlines, "descriptions": descriptions,
			}},
		}}},
	})
	if err != nil {
		return map[string]any{"success": false, "message": "Google Ads tạo quảng cáo thất bại: " + err.Error(), "budget_response": budget, "campaign_response": campaign, "ad_group_response": adGroup}
	}
	return map[string]any{
		"success": true, "message": "Google Ads đã tạo campaign, ad group và quảng cáo ở trạng thái " + status,
		"budget_response": budget, "campaign_response": campaign, "ad_group_response": adGroup, "ad_group_ad_response": adGroupAd,
	}
}

func (s *CrmService) ListGoogleAds(ad map[string]any) map[string]any {
	base, headers, err := s.googleAdsConnection(ad)
	if err != nil {
		return crmErr(err.Error())
	}
	query := `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' ORDER BY campaign.id`
	rows, err := s.googleAdsSearch(base, headers, query)
	if err != nil {
		return crmErr("Google Ads lấy danh sách campaign thất bại: " + err.Error())
	}
	return map[string]any{"success": true, "campaigns": flattenGoogleSearchResults(rows), "raw": rows}
}

func (s *CrmService) GetGoogleAdsCost(ad map[string]any) map[string]any {
	base, headers, err := s.googleAdsConnection(ad)
	if err != nil {
		return crmErr(err.Error())
	}
	from := firstAdValue(ad, "date_from", "from")
	to := firstAdValue(ad, "date_to", "to")
	if from == "" {
		from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	}
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", from); err != nil {
		return crmErr("date_from phải có dạng YYYY-MM-DD")
	}
	if _, err := time.Parse("2006-01-02", to); err != nil {
		return crmErr("date_to phải có dạng YYYY-MM-DD")
	}
	query := fmt.Sprintf(`SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros, segments.date FROM campaign WHERE segments.date BETWEEN '%s' AND '%s' ORDER BY segments.date`, from, to)
	rows, err := s.googleAdsSearch(base, headers, query)
	if err != nil {
		return crmErr("Google Ads lấy chi phí thất bại: " + err.Error())
	}
	return map[string]any{"success": true, "date_from": from, "date_to": to, "summary": summarizeGoogleCost(rows), "rows": flattenGoogleSearchResults(rows), "raw": rows}
}

func (s *CrmService) googleAdsConnection(ad map[string]any) (string, map[string]string, error) {
	customerID := strings.ReplaceAll(firstAdValue(ad, "customer_id"), "-", "")
	if customerID == "" || firstAdValue(ad, "access_token") == "" || firstAdValue(ad, "developer_token") == "" {
		return "", nil, fmt.Errorf("Google Ads cần customer_id, access_token và developer_token")
	}
	if _, err := strconv.ParseUint(customerID, 10, 64); err != nil {
		return "", nil, fmt.Errorf("Google Ads customer_id không hợp lệ")
	}
	headers := map[string]string{"Authorization": "Bearer " + firstAdValue(ad, "access_token"), "developer-token": firstAdValue(ad, "developer_token"), "Content-Type": "application/json"}
	if login := strings.ReplaceAll(firstAdValue(ad, "login_customer_id"), "-", ""); login != "" {
		headers["login-customer-id"] = login
	}
	return "https://googleads.googleapis.com/v18/customers/" + url.PathEscape(customerID), headers, nil
}

func (s *CrmService) googleAdsSearch(base string, headers map[string]string, query string) (any, error) {
	body, err := json.Marshal(map[string]any{"query": query})
	if err != nil {
		return nil, err
	}
	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequest(http.MethodPost, base+"/googleAds:searchStream", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	var decoded any
	if jsonErr := json.Unmarshal(responseBody, &decoded); jsonErr != nil {
		return nil, fmt.Errorf("Google Ads response không phải JSON: %s", strings.TrimSpace(string(responseBody)))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return decoded, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return decoded, nil
}

func flattenGoogleSearchResults(raw any) []any {
	out := []any{}
	var walk func(any)
	walk = func(value any) {
		switch item := value.(type) {
		case []any:
			for _, child := range item {
				walk(child)
			}
		case map[string]any:
			if results, ok := item["results"].([]any); ok {
				out = append(out, results...)
			}
		}
	}
	walk(raw)
	return out
}

func summarizeGoogleCost(raw any) map[string]any {
	var impressions, clicks int64
	var conversions, costMicros float64
	for _, item := range flattenGoogleSearchResults(raw) {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		metrics, _ := row["metrics"].(map[string]any)
		impressions += parseGoogleInt(metrics["impressions"])
		clicks += parseGoogleInt(metrics["clicks"])
		conversions += parseGoogleFloat(metrics["conversions"])
		costMicros += parseGoogleFloat(metrics["costMicros"])
	}
	return map[string]any{"impressions": impressions, "clicks": clicks, "conversions": conversions, "cost_micros": costMicros, "cost": costMicros / 1_000_000}
}

func parseGoogleInt(value any) int64 {
	parsed, _ := strconv.ParseInt(fmt.Sprint(value), 10, 64)
	return parsed
}
func parseGoogleFloat(value any) float64 {
	parsed, _ := strconv.ParseFloat(fmt.Sprint(value), 64)
	return parsed
}

func normalizeGoogleKeywords(ad map[string]any) []string {
	values := []string{}
	if raw, ok := ad["keywords"].([]any); ok {
		for _, value := range raw {
			values = append(values, strings.TrimSpace(fmt.Sprint(value)))
		}
	} else if raw, ok := ad["keywords"].([]string); ok {
		values = append(values, raw...)
	} else if raw := firstAdValue(ad, "keywords", "keyword_text"); raw != "" {
		values = strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == '\n' || r == ';' })
	}
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		key := strings.ToLower(value)
		if value != "" && !seen[key] {
			seen[key] = true
			out = append(out, value)
		}
	}
	return out
}

func (s *CrmService) googleAdsMutate(endpoint string, headers map[string]string, payload map[string]any) (map[string]any, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	client := s.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if readErr != nil {
		return nil, readErr
	}
	var decoded map[string]any
	if len(responseBody) > 0 {
		_ = json.Unmarshal(responseBody, &decoded)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := strings.TrimSpace(string(responseBody))
		if message == "" {
			message = resp.Status
		}
		return decoded, fmt.Errorf("HTTP %d: %s", resp.StatusCode, message)
	}
	return decoded, nil
}

func firstGoogleResourceName(value map[string]any) string {
	if value == nil {
		return ""
	}
	if direct, ok := value["resourceName"].(string); ok && strings.TrimSpace(direct) != "" {
		return direct
	}
	if results, ok := value["results"].([]any); ok {
		for _, item := range results {
			if row, ok := item.(map[string]any); ok {
				if resource := firstGoogleResourceName(row); resource != "" {
					return resource
				}
			}
		}
	}
	return ""
}

func firstAdValue(ad map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(fmt.Sprint(ad[key])); value != "" && value != "<nil>" {
			return value
		}
	}
	return ""
}

func fallbackAdValue(ad map[string]any, key, fallback string) string {
	value := firstAdValue(ad, key)
	return valueOrFallback(value, fallback)
}

func valueOrFallback(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func parseGoogleMicros(ad map[string]any, keys []string, fallback int64) int64 {
	raw := firstAdValue(ad, keys...)
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

func normalizeGoogleAdsStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "active", "enabled", "run":
		return "ENABLED"
	case "removed", "delete":
		return "REMOVED"
	default:
		return "PAUSED"
	}
}

func cloneMap(source map[string]any) map[string]any {
	target := make(map[string]any, len(source))
	for key, value := range source {
		target[key] = value
	}
	return target
}

func countStatus(rows []map[string]any, status string) int {
	n := 0
	for _, row := range rows {
		if s, _ := row["status"].(string); strings.EqualFold(s, status) {
			n++
		}
	}
	return n
}

func rowsAsMaps(v any) []map[string]any {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, item := range arr {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func crmErr(msg string) map[string]any {
	return map[string]any{"success": false, "message": msg}
}
