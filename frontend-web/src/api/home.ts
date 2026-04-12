import { request } from "#src/utils";

export interface PieDataType {
	value: number
	code: string
	name?: string // localized label for chart legends
}

export interface GooglebotVisit {
	id: string
	host: string
	path: string
	ip: string
	userAgent: string
	visitedAt: string
	dateKey: string
}

export interface GooglebotDailyStat {
	date: string
	count: number
	lastVisitAt?: string
}

export interface GooglebotStats {
	totalVisits: number
	latest: GooglebotVisit[]
	byDate: GooglebotDailyStat[]
	deleted?: number
}
export function fetchPie(data: { by: string | number }) {
	return request
		.get("home/pie", { searchParams: data })
		.json<ApiResponse<PieDataType[]>>();
}

export function fetchLine(data: { range: string }) {
	return request
		.post("home/line", { json: data })
		.json<ApiResponse<string[]>>();
}

export function fetchGooglebotStats(params?: { limit?: number; offset?: number }) {
	return request
		.get("home/googlebot", { searchParams: params })
		.json<ApiResponse<GooglebotStats>>();
}

export function deleteGooglebotVisits(data: { ids?: string[]; deleteAll?: boolean }) {
	return request
		.post("home/googlebot/delete", { json: data })
		.json<ApiResponse<GooglebotStats>>();
}
