package services

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	crmCustomers       = "crm_customers"
	crmPurchases       = "crm_purchases"
	crmContactHistory  = "crm_contact_history"
	crmAds             = "crm_ads"
)

type CrmService struct {
	rm *data.RecordManager
}

func NewCrmService(rm *data.RecordManager) *CrmService {
	s := &CrmService{rm: rm}
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
			"id": spec.name,
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
		"totalCustomers": len(customers),
		"activeCustomers": countStatus(customers, "active"),
		"newCustomers": len(customers),
	}
}

func (s *CrmService) GetAds(appID string) []map[string]any {
	return rowsAsMaps(s.rm.Filter(appID, crmAds, model.SearchFilter{})["rows"])
}

func (s *CrmService) CreateAd(appID string, ad map[string]any) map[string]any {
	ad["id"] = uuid.NewString()
	ad["ad_id"] = ad["id"]
	ad["app_id"] = appID
	ad["created_at"] = time.Now().UnixMilli()
	if _, err := s.rm.CreateRecord(appID, crmAds, ad, []string{"ad_id"}); err != nil {
		return crmErr(err.Error())
	}
	return map[string]any{"success": true, "ad": ad}
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
