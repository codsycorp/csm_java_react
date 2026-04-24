import { request } from "#src/utils";

export interface AiReviewCodeRequest {
	paths?: string[];
	maxFiles?: number;
	focus?: string;
}

export interface AiReviewImprovement {
	severity?: "HIGH" | "MEDIUM" | "LOW" | string;
	file?: string;
	issue?: string;
	recommendation?: string;
	sample_patch?: string;
}

export interface AiReviewCodeResult {
	files?: string[];
	scannedCount?: number;
	contextChars?: number;
	focus?: string;
	review?: {
		summary?: string;
		improvements?: AiReviewImprovement[];
		[key: string]: any;
	};
	raw?: string;
	[key: string]: any;
}

export async function reviewCodeWithAi(payload: AiReviewCodeRequest): Promise<ApiResponse<AiReviewCodeResult>> {
	return request
		.post("ai-review-code", {
			json: payload,
			timeout: 15 * 60 * 1000,
		})
		.json<ApiResponse<AiReviewCodeResult>>();
}
