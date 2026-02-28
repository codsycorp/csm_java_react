// kqxs_service.ts
// Các hàm gọi API và xử lý dữ liệu server cho KQXS

import { fetchKQXSByStation, fetchKQXSStationsWithFilter, fetchKQXSTableRange, calculateTongHopResults, fetchLoaiTim } from "#src/api/kqxs_service";

export const kqxs_fetchKQXSByStation = fetchKQXSByStation;
export const kqxs_fetchKQXSStationsWithFilter = fetchKQXSStationsWithFilter;
export const kqxs_fetchKQXSTableRange = fetchKQXSTableRange;
export const kqxs_calculateTongHopResults = calculateTongHopResults;
export const kqxs_fetchLoaiTim = fetchLoaiTim;
