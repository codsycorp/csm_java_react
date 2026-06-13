package web

import (
	"net/http"
	"strings"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

func ServeSSRCategories(st *state.AppState, w http.ResponseWriter, host string) {
	domain := DomainFromHost(host)
	filter := model.SearchFilter{
		Operator: "AND",
		Conditions: []model.SearchFilter{
			model.EqFilter("status", "active"),
			{Field: "domain", FilterType: "like", Value: domain},
		},
	}
	result := st.RecordManager.Filter("web", "web_services", filter)
	rows := rowsFromAny(result)
	total := len(rows)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true, "data": rows, "rows": rows, "total": total, "totalCount": total,
	})
}

func ServeSSRTags(st *state.AppState, w http.ResponseWriter, host, query string) {
	domain := DomainFromHost(host)
	serviceIDsRaw := QSParam(query, "service_ids")
	serviceIDs := strings.Split(serviceIDsRaw, ",")
	tagsMap := map[string]any{}
	for _, serviceID := range serviceIDs {
		serviceID = strings.TrimSpace(serviceID)
		if serviceID == "" {
			continue
		}
		filter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("service_id", serviceID),
				{Field: "domain", FilterType: "like", Value: domain},
			},
		}
		result := st.RecordManager.Filter("web", "web_service_tags", filter)
		rows := rowsFromAny(result)
		var tags []string
		for _, r := range rows {
			if tag := recordStr(r, "tag"); tag != "" {
				tags = append(tags, tag)
			}
		}
		tagsMap[serviceID] = tags
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "data": tagsMap})
}

func ServeSSRReviews(st *state.AppState, w http.ResponseWriter, host, query string) {
	domain := DomainFromHost(host)
	serviceIDsRaw := QSParam(query, "service_ids")
	serviceIDs := strings.Split(serviceIDsRaw, ",")
	reviewsMap := map[string]any{}
	for _, serviceID := range serviceIDs {
		serviceID = strings.TrimSpace(serviceID)
		if serviceID == "" {
			continue
		}
		filter := model.SearchFilter{
			Operator: "AND",
			Conditions: []model.SearchFilter{
				model.EqFilter("service_id", serviceID),
				model.EqFilter("status", "approved"),
				{Field: "domain", FilterType: "like", Value: domain},
			},
		}
		result := st.RecordManager.Filter("web", "web_service_reviews", filter)
		reviewsMap[serviceID] = rowsFromAny(result)
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "data": reviewsMap})
}

func rowsFromAny(result map[string]any) []map[string]any {
	return rowsFrom(result)
}
