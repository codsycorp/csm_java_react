package web

import (
	"net/http"
	"strings"
	"unicode"

	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/state"
)

func normalizeKqxsYYYYMMDD(dateStr string) string {
	s := strings.TrimSpace(dateStr)
	if s == "" {
		return ""
	}
	if strings.Contains(s, "/") {
		parts := strings.Split(s, "/")
		if len(parts) == 3 {
			return parts[2] + parts[1] + parts[0]
		}
		return ""
	}
	var digits strings.Builder
	for _, c := range s {
		if unicode.IsDigit(c) {
			digits.WriteRune(c)
		}
	}
	d := digits.String()
	if len(d) == 8 {
		return d
	}
	return ""
}

func ServeKqxsStation(st *state.AppState, w http.ResponseWriter, query string) {
	objName := QSParam(query, "obj_name")
	date := QSParam(query, "date")
	if objName == "" || !strings.HasPrefix(objName, "kqxs_") {
		writeJSONError(w, "Invalid station")
		return
	}
	formatted := normalizeKqxsYYYYMMDD(date)
	if formatted == "" {
		writeJSONError(w, "Invalid date format")
		return
	}
	filter := model.EqFilter("field_ngay", formatted)
	result := st.RecordManager.Filter("kqxs", objName, filter)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "rows": rowsFromAny(result)})
}

func ServeKqxsStations(st *state.AppState, w http.ResponseWriter, query string) {
	mien := QSParam(query, "mien")
	thu := QSParam(query, "thu")
	var conditions []model.SearchFilter
	if mien != "" {
		conditions = append(conditions, model.EqFilter("mien", mien))
	}
	if thu != "" {
		conditions = append(conditions, model.EqFilter("thu", thu))
	}
	var filter model.SearchFilter
	switch len(conditions) {
	case 0:
		filter = model.SearchFilter{Field: "id", FilterType: "gt", Value: "0"}
	case 1:
		filter = conditions[0]
	default:
		filter = model.SearchFilter{Operator: "AND", Conditions: conditions}
	}
	result := st.RecordManager.Filter("kqxs", "kqxs_lichxoso", filter)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "rows": rowsFromAny(result)})
}

func ServeKqxsTableRange(st *state.AppState, w http.ResponseWriter, query string) {
	objName := QSParam(query, "obj_name")
	from := QSParam(query, "from")
	to := QSParam(query, "to")
	if objName == "" || !strings.HasPrefix(objName, "kqxs_") {
		writeJSONError(w, "Invalid table")
		return
	}
	fromYMD := normalizeKqxsYYYYMMDD(from)
	toYMD := normalizeKqxsYYYYMMDD(to)
	var conditions []model.SearchFilter
	if fromYMD != "" {
		conditions = append(conditions, model.SearchFilter{Field: "field_ngay", FilterType: "gte", Value: fromYMD})
	}
	if toYMD != "" {
		conditions = append(conditions, model.SearchFilter{Field: "field_ngay", FilterType: "lte", Value: toYMD})
	}
	var filter model.SearchFilter
	switch len(conditions) {
	case 0:
		filter = model.SearchFilter{Field: "id", FilterType: "gt", Value: "0"}
	case 1:
		filter = conditions[0]
	default:
		filter = model.SearchFilter{Operator: "AND", Conditions: conditions}
	}
	result := st.RecordManager.Filter("kqxs", objName, filter)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "rows": rowsFromAny(result)})
}

func ServeKqxsTonghop(st *state.AppState, w http.ResponseWriter, query string) {
	maDuoi := QSParam(query, "ma_duoi")
	tuNgay := QSParam(query, "tu_ngay")
	denNgay := QSParam(query, "den_ngay")
	fromYMD := normalizeKqxsYYYYMMDD(tuNgay)
	toYMD := normalizeKqxsYYYYMMDD(denNgay)
	if fromYMD == "" || toYMD == "" {
		writeJSONError(w, "Invalid date range")
		return
	}
	conditions := []model.SearchFilter{
		model.EqFilter("ma_duoi", maDuoi),
		{Field: "field_ngay", FilterType: "gte", Value: fromYMD},
		{Field: "field_ngay", FilterType: "lte", Value: toYMD},
	}
	for _, p := range []struct{ param, field string }{
		{"l2c", "l2c"}, {"tky", "tky"}, {"ktn", "ktn"}, {"ktd", "ktd"}, {"tnd", "tnd"},
		{"nhom_so", "nhom_so"}, {"nhom_so_triet", "nhom_so_triet"}, {"so_nhap", "so_nhap"},
		{"triet_tieu", "triet_tieu"}, {"triet_duoi", "triet_duoi"}, {"show_nhom", "show_nhom"},
		{"show_tk", "show_tk"}, {"loai_tim", "loai_tim"}, {"ket_qua_filter", "ket_qua_filter"},
	} {
		if val := QSParam(query, p.param); val != "" {
			conditions = append(conditions, model.EqFilter(p.field, val))
		}
	}
	filter := model.SearchFilter{Operator: "AND", Conditions: conditions}
	result := st.RecordManager.Filter("tonghop", "kqxs_tonghop", filter)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "rows": rowsFromAny(result)})
}

var validVptsTables = map[string]struct{}{
	"vpts_danhngon": {}, "vpts_dongcong": {}, "vpts_tamsat": {}, "vpts_khongminh": {},
	"vpts_thapnhitruc": {}, "vpts_nguyenbinhkhiem": {}, "vpts_cuutinh": {}, "vpts_gionuoclon": {},
	"vpts_kiethungtinhthoi": {}, "vpts_cathungthan": {}, "vpts_giokhongvong": {},
	"vpts_lucnham": {}, "vpts_tietkhi": {}, "vpts_saotot": {}, "vpts_saoxau": {},
}

func ServeVpts(st *state.AppState, w http.ResponseWriter, query string) {
	objName := QSParam(query, "obj_name")
	if objName == "" {
		writeJSONError(w, "Invalid obj_name")
		return
	}
	if _, ok := validVptsTables[objName]; !ok {
		writeJSONError(w, "Invalid obj_name")
		return
	}
	filter := model.SearchFilter{Operator: "AND"}
	result := st.RecordManager.Filter("vpts", objName, filter)
	rows := rowsFromAny(result)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true, "data": rows, "rows": rows, "total": len(rows),
	})
}
