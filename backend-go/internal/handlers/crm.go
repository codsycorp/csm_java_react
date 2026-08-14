package handlers

import (
	"fmt"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
	"csm_server/backend-go/internal/services"
)

type CrmHandler struct {
	crm *services.CrmService
}

func NewCrmHandler(crm *services.CrmService) *CrmHandler {
	return &CrmHandler{crm: crm}
}

func (h *CrmHandler) resolveAppID(params map[string]any, auth *security.AuthUser) string {
	return security.ResolveRequestAppID(params, auth)
}

func (h *CrmHandler) HandleCustomers(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	appID := h.resolveAppID(params, auth)
	status, _ := params["status"].(string)
	search, _ := params["search"].(string)
	offset := intParam(params, "offset", 0)
	limit := intParam(params, "limit", 100)
	if limit <= 0 {
		limit = 100
	}
	rows := h.crm.GetCustomers(appID, status, search, offset, limit)
	return model.OKResponse(map[string]any{"customers": rows, "total": len(rows)})
}

func (h *CrmHandler) HandleCustomer(method string, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	appID := h.resolveAppID(params, auth)
	switch strings.ToUpper(method) {
	case "GET":
		phone, _ := params["phone"].(string)
		customer := h.crm.GetCustomerByPhone(appID, phone)
		if len(customer) == 0 {
			return model.ErrorResponse(404, "Customer not found")
		}
		return model.OKResponse(customer)
	case "POST", "PUT":
		return model.OKResponse(h.crm.CreateOrUpdateCustomer(appID, params))
	default:
		return model.ErrorResponse(405, "Method not allowed")
	}
}

func (h *CrmHandler) HandleAssign(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	phone, _ := params["phone"].(string)
	employeeID, _ := params["employeeId"].(string)
	return model.OKResponse(h.crm.AssignCustomer(h.resolveAppID(params, auth), phone, employeeID))
}

func (h *CrmHandler) HandleStatus(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	phone, _ := params["phone"].(string)
	status, _ := params["status"].(string)
	notes, _ := params["notes"].(string)
	return model.OKResponse(h.crm.UpdateCustomerStatus(h.resolveAppID(params, auth), phone, status, notes))
}

func (h *CrmHandler) HandlePurchase(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	phone, _ := params["phone"].(string)
	purchase, _ := params["purchase"].(map[string]any)
	if purchase == nil {
		purchase = params
	}
	return model.OKResponse(h.crm.AddPurchase(h.resolveAppID(params, auth), phone, purchase))
}

func (h *CrmHandler) HandleContact(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	phone, _ := params["phone"].(string)
	contactType, _ := params["contactType"].(string)
	notes, _ := params["notes"].(string)
	employeeID, _ := params["employeeId"].(string)
	return model.OKResponse(h.crm.AddContactHistory(h.resolveAppID(params, auth), phone, contactType, notes, employeeID))
}

func (h *CrmHandler) HandleBirthdays(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	return model.OKResponse(h.crm.GetUpcomingBirthdays(h.resolveAppID(params, auth)))
}

func (h *CrmHandler) HandleCrmStats(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	return model.OKResponse(h.crm.GetStats(h.resolveAppID(params, auth)))
}

func (h *CrmHandler) HandleWebsiteStats(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	return h.HandleCrmStats(params, auth)
}

func (h *CrmHandler) HandleAdsStats(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	ads := h.crm.GetAds(h.resolveAppID(params, auth))
	return model.OKResponse(map[string]any{"totalAds": len(ads), "ads": ads})
}

func (h *CrmHandler) HandleCreateAd(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	result := h.crm.CreateAd(h.resolveAppID(params, auth), params)
	if success, ok := result["success"].(bool); ok && !success {
		message, _ := result["message"].(string)
		return model.ErrorResponse(400, message)
	}
	return model.OKResponse(result)
}

func (h *CrmHandler) HandleGoogleAdsList(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	result := h.crm.ListGoogleAds(params)
	if success, _ := result["success"].(bool); !success {
		return model.ErrorResponse(400, fmt.Sprint(result["message"]))
	}
	return model.OKResponse(result)
}

func (h *CrmHandler) HandleGoogleAdsCost(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	result := h.crm.GetGoogleAdsCost(params)
	if success, _ := result["success"].(bool); !success {
		return model.ErrorResponse(400, fmt.Sprint(result["message"]))
	}
	return model.OKResponse(result)
}

func (h *CrmHandler) HandleGetAds(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if auth == nil {
		return model.ErrorResponse(401, "Not authenticated")
	}
	return model.OKResponse(h.crm.GetAds(h.resolveAppID(params, auth)))
}

func (h *CrmHandler) HandleAnalytics(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	return h.HandleCrmStats(params, auth)
}

func (h *CrmHandler) HandleInsights(params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	return model.OKResponse(map[string]any{"insights": []any{}, "stats": h.crm.GetStats(h.resolveAppID(params, auth))})
}
