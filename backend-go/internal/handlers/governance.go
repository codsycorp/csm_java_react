package handlers

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/platform/audit"
	"csm_server/backend-go/internal/platform/catalog"
	governancepkg "csm_server/backend-go/internal/platform/governance"
	"csm_server/backend-go/internal/platform/lake"
	"csm_server/backend-go/internal/platform/lineage"
	"csm_server/backend-go/internal/security"
)

// GovernanceHandler exposes data platform, GDPR DSR, and capacity APIs (dev/admin).
type GovernanceHandler struct {
	rm       *data.RecordManager
	dsr      *governancepkg.DSRService
	audit    *audit.Store
	catalog  *catalog.Registry
	lineage  *lineage.Store
	lake     *lake.Exporter
}

func NewGovernanceHandler(
	rm *data.RecordManager,
	dsr *governancepkg.DSRService,
	auditStore *audit.Store,
	cat *catalog.Registry,
	lin *lineage.Store,
	lk *lake.Exporter,
) *GovernanceHandler {
	return &GovernanceHandler{rm: rm, dsr: dsr, audit: auditStore, catalog: cat, lineage: lin, lake: lk}
}

func (h *GovernanceHandler) Handle(path string, params map[string]any, auth *security.AuthUser) *model.StandardResponse {
	if !governanceAllowed(auth) {
		return model.ErrorResponse(403, "governance APIs require dev or admin")
	}
	switch path {
	case "/governance/capacity":
		return h.capacity()
	case "/governance/catalog":
		return h.catalogList()
	case "/governance/lake-stats":
		return h.lakeStats()
	case "/governance/dsr/export":
		return h.dsrExport(params)
	case "/governance/dsr/erase":
		return h.dsrErase(params)
	default:
		if strings.HasPrefix(path, "/governance/lineage/") {
			id := strings.TrimPrefix(path, "/governance/lineage/")
			return h.lineageBySource(id)
		}
		return model.ErrorResponse(404, "unknown governance path")
	}
}

func governanceAllowed(auth *security.AuthUser) bool {
	if auth == nil {
		return false
	}
	return auth.Dev || (!auth.IsSubUser && strings.EqualFold(auth.DataScope, "admin"))
}

func (h *GovernanceHandler) capacity() *model.StandardResponse {
	r := model.NewResponse()
	report := h.rm.BuildCapacityReport()
	report.GeneratedAt = time.Now().UTC().Format(time.RFC3339Nano)
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", report)
	return r
}

func (h *GovernanceHandler) catalogList() *model.StandardResponse {
	r := model.NewResponse()
	if h.catalog == nil || !h.catalog.Enabled() {
		return model.ErrorResponse(503, "catalog disabled")
	}
	list, err := h.catalog.List()
	if err != nil {
		return model.ErrorResponse(500, err.Error())
	}
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", list)
	return r
}

func (h *GovernanceHandler) lakeStats() *model.StandardResponse {
	r := model.NewResponse()
	if h.lake == nil || !h.lake.Enabled() {
		return model.ErrorResponse(503, "lake export disabled")
	}
	parts, _ := h.lake.ListPartitions()
	stats := h.lake.Stats()
	stats["partitions"] = parts
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", stats)
	return r
}

func (h *GovernanceHandler) lineageBySource(sourceID string) *model.StandardResponse {
	r := model.NewResponse()
	if h.lineage == nil || !h.lineage.Enabled() {
		return model.ErrorResponse(503, "lineage disabled")
	}
	edges, err := h.lineage.BySource(sourceID, 50)
	if err != nil {
		return model.ErrorResponse(500, err.Error())
	}
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", edges)
	return r
}

func (h *GovernanceHandler) dsrExport(params map[string]any) *model.StandardResponse {
	if h.dsr == nil {
		return model.ErrorResponse(503, "DSR service unavailable")
	}
	req := governancepkg.DSRRequest{
		UserID:    strParam(params, "user_id"),
		Email:     strParam(params, "email"),
		RequestID: strParam(params, "request_id"),
	}
	if req.RequestID == "" {
		req.RequestID = uuid.NewString()
	}
	if req.UserID == "" && req.Email == "" {
		return model.ErrorResponse(400, "user_id or email required")
	}
	pkg, err := h.dsr.Export(req)
	if err != nil {
		return model.ErrorResponse(404, err.Error())
	}
	h.recordDSRAudit("gdpr.export", req.RequestID, map[string]any{"user_id": req.UserID, "email": req.Email})
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", pkg)
	return r
}

func (h *GovernanceHandler) dsrErase(params map[string]any) *model.StandardResponse {
	if h.dsr == nil {
		return model.ErrorResponse(503, "DSR service unavailable")
	}
	req := governancepkg.DSRRequest{
		UserID:    strParam(params, "user_id"),
		Email:     strParam(params, "email"),
		RequestID: strParam(params, "request_id"),
	}
	if req.RequestID == "" {
		req.RequestID = uuid.NewString()
	}
	if req.UserID == "" && req.Email == "" {
		return model.ErrorResponse(400, "user_id or email required")
	}
	result, err := h.dsr.Erase(req)
	if err != nil {
		return model.ErrorResponse(404, err.Error())
	}
	h.recordDSRAudit("gdpr.erase", req.RequestID, map[string]any{"records": result.RecordsUpdated})
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", result)
	return r
}

func strParam(params map[string]any, key string) string {
	if params == nil {
		return ""
	}
	v, _ := params[key].(string)
	return strings.TrimSpace(v)
}

func (h *GovernanceHandler) recordDSRAudit(action, requestID string, meta map[string]any) {
	if h.audit == nil || !h.audit.Enabled() {
		return
	}
	if meta == nil {
		meta = map[string]any{}
	}
	meta["request_id"] = requestID
	h.audit.Record(audit.Event{Action: action, Table: "dsr", AppID: "csm", Meta: meta})
}
