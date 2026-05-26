import { request } from "#src/utils";
import type { SeoContentParams, SeoContentResult, GenerateSeoContentRequest } from "./types";

export * from "./types";

/**
 * Template prompt để tạo nội dung SEO
 * Export để có thể tham khảo/custom từ auto-code
 */
export const PROMPT_GENERATE_POST = `
Bạn là một chuyên gia viết bài viết chuẩn SEO top 1 google hơn 10 năm trong ngành, có khả năng tạo ra nội dung hấp dẫn, đúng insight người đọc và tối ưu hóa cho công cụ tìm kiếm.

**NHIỆM VỤ:**
Dựa vào các dữ liệu đầu vào, hãy viết một bài viết hoàn chỉnh, chuẩn SEO và trả về dưới dạng một đối tượng JSON duy nhất.

**DỮ LIỆU ĐẦU VÀO:**
* **Loại bài viết:** "%s"
* **Chủ đề bài viết:** "%s"
* **Thông tin bổ sung để làm giàu nội dung:** %s
* **Từ khóa chính (phải xuất hiện trong tiêu đề và nội dung):** "%s"
* **Các từ khóa phụ/biến thể (cần được tích hợp tự nhiên):** %s

**YÊU CẦU VỀ NỘI DUNG VÀ CẤU TRÚC:**
1. **Tiêu đề chính (\`title\`):**
    * Bạn có thể tham khảo các công thức sau:
      - [Từ khóa chính] + [Lợi ích/Giá trị] + [Thương hiệu]
        Ví dụ: "Dịch vụ SEO Tổng Thể - Tăng Doanh Thu Hiệu Quả - ABC Agency"
      - [Con số] + [Từ khóa chính] + [Thông tin hấp dẫn]
        Ví dụ: "10 Cách Tăng Tốc Độ Website - Cải Thiện SEO & UX Trong 5 Phút"
      - [Từ khóa chính] + [Câu hỏi/Sự tò mò]
        Ví dụ: "Làm Thế Nào Để Viết Bài Chuẩn SEO? 5 Bí Quyết Đơn Giản"
    * Phải chứa **Từ khóa chính**.
    * Giới hạn ký tự: Tiêu đề (Title Tag) nên có độ dài khoảng 50-65 ký tự (hoặc 500-600 pixel)
    * Hấp dẫn, có thông tin quan trọng để tăng CTR:
        - Với **bất động sản**: thêm giá/diện tích/vị trí.
        - Với **việc làm**: thêm mức lương/địa điểm/năm.
2. **Mô tả ngắn (\`description\`):**
    * Độ dài tối ưu khoảng **155 ký tự** (không ngắn hơn 150 và không dài hơn 160).
    * Phải **chứa Từ khóa chính** ít nhất một lần.
    * **QUAN TRỌNG:** TUYỆT ĐỐI không sử dụng các ký tự đặc biệt như \`!\`, \`?\`, \`#\`, \`*\`, emoji. Chỉ dùng dấu chấm (.), dấu phẩy (,).
    * Viết như một thẻ meta description, tóm tắt rõ ràng nội dung chính và có **CTA tự nhiên**.
    * **KHÔNG chứa bất kỳ thẻ HTML nào.**
3. **Nội dung HTML (\`html_content\`):**
    * **Cấu trúc chung:** Mở bài - Thân bài (nhiều \`<h2>\`) - Kết luận/CTA.**Không dùng \`<h1>\`.**
    * **Thân bài:**
        - Với **bất động sản**: có ít nhất các mục về mô tả sản phẩm, vị trí, thiết kế & tiện ích, hỗ trợ pháp lý & liên hệ.
        - Với **việc làm**: có ít nhất các mục về giới thiệu công ty, mô tả công việc, yêu cầu ứng viên, quyền lợi, cách ứng tuyển.
    * **Tối ưu từ khóa:**
        - **Từ khóa chính:** nhắc lại 2-3 lần tự nhiên.
        - **Từ khóa phụ/biến thể:** phân bổ hợp lý có Bôi đen, in nghiêng, gạch dưới.
    * **Nhấn mạnh:** Khoảng 20%% từ khóa phụ nên được bôi đậm/thẻ \`<strong>\` hoặc \`<em>\`.
    * **Tiêu đề phụ:** tất cả là thẻ \`<h2>\`. **Không dùng \`<h1>\`.**
	* **Lấy thông tin liên hệ có trong nội dung ra để phần cuối bài viết kiểm tra kỹ tránh trùng lắp.**
    * **Chất lượng:** Văn phong mạch lạc, chuyên nghiệp, cung cấp thông tin giá trị, không được sao chép, lưu ý không đưa tên các đầu mục như Mở bài,thân bài,kết luận vào bài viết.

**YÊU CẦU ĐẦU RA (CỰC KỲ QUAN TRỌNG):**
* **Định dạng:** Chỉ trả về một đối tượng JSON DUY NHẤT. Không thêm văn bản hay markdown ngoài JSON.
* **Kiểm tra \`description\`:** Trước khi trả về, hãy đảm bảo trường \`description\` chỉ chứa văn bản thuần, không có thẻ HTML và không có bất kỳ ký tự đặc biệt nào (\`!\`, \`?\`, \`#\`, \`*\`, emoji).
* **\`html_content\`:** Là một chuỗi chứa HTML thuần, hợp lệ, để hiển thị một trang web đẹp mắt,có lề bài bản và đầu mục rõ ràng, bạn cần dùng với CSS của Bootstrap v4.5.3 đã có sẵn. Không bao bọc trong \`\`\`html.
* **Độ dài \`html_content\`:** Không vượt quá 4096 chữ.
* **Cấu trúc JSON bắt buộc:**
{
  "title": "string",
  "description": "string",
  "html_content": "string"
}
`;

// Long-running AI generation can take several minutes with server-side chunk/retry flow.
// Set VITE_AI_TIMEOUT_MS=0 to disable client timeout for this endpoint.
const AI_TIMEOUT_ENV = Number(import.meta.env.VITE_AI_TIMEOUT_MS);
const AI_TIMEOUT_FALLBACK_MS = 30 * 60 * 1000;
const AI_TIMEOUT_MS = Number.isFinite(AI_TIMEOUT_ENV) && AI_TIMEOUT_ENV > 0
	? AI_TIMEOUT_ENV
	: AI_TIMEOUT_FALLBACK_MS;
const AI_REQUEST_TIMEOUT: number | false = Number.isFinite(AI_TIMEOUT_ENV) && AI_TIMEOUT_ENV === 0
	? false
	: AI_TIMEOUT_MS;
const AI_ASYNC_THRESHOLD_CHARS = Number(import.meta.env.VITE_AI_ASYNC_THRESHOLD_CHARS) || 8000;
const AI_ASYNC_POLL_INTERVAL_MS = Number(import.meta.env.VITE_AI_ASYNC_POLL_INTERVAL_MS) || 4000;
const AI_ASYNC_MAX_WAIT_MS = Number(import.meta.env.VITE_AI_ASYNC_MAX_WAIT_MS) || 45 * 60 * 1000;

export type AiProgressPayload = Record<string, any>;

type GenerateSeoContentOptions = {
	onProgress?: (progress: AiProgressPayload) => void;
	/** Submit async job + poll — recommended for local llama on weak servers (avoids long HTTP hang). */
	preferAsync?: boolean;
	taskType?: string;
};

async function generateSeoContentWithPromptAsync(prompt: string, options?: GenerateSeoContentOptions): Promise<ApiResponse<any>> {
	const submitResponse = await request
		.post("ai-generate-seo-content", {
			json: {
				prompt,
				mode: "submit",
				async: true,
				taskType: options?.taskType || "seo_content",
			},
			timeout: AI_REQUEST_TIMEOUT,
		})
		.json<ApiResponse<any>>();

	const submitPayload = (submitResponse?.result || (submitResponse as any)?.data || {}) as Record<string, any>;
	const jobId = submitPayload?.jobId;
	if (submitPayload?.progress) {
		options?.onProgress?.({ jobId, status: submitPayload?.status || "queued", ...submitPayload.progress });
	}
	if (!jobId) {
		return {
			code: -1,
			result: {} as any,
			message: submitResponse?.message || "Không lấy được jobId từ submit async AI",
			success: false,
		};
	}

	const startedAt = Date.now();
	while (Date.now() - startedAt < AI_ASYNC_MAX_WAIT_MS) {
		const statusResponse = await request
			.post("ai-generate-seo-content", {
				json: {
					mode: "status",
					jobId,
				},
				timeout: AI_REQUEST_TIMEOUT,
			})
			.json<ApiResponse<any>>();

		const statusPayload = (statusResponse?.result || (statusResponse as any)?.data || {}) as Record<string, any>;
		if (statusPayload?.progress) {
			options?.onProgress?.({
				jobId,
				status: statusPayload?.status,
				elapsedMs: statusPayload?.elapsedMs,
				...statusPayload.progress,
			});
		}

		const status = String(statusPayload?.status || "").toLowerCase();
		if (status === "completed" || status === "failed") {
			const finalResult = statusPayload?.result;
			if (finalResult && typeof finalResult === "object") {
				return finalResult as ApiResponse<any>;
			}
			return {
				code: -1,
				result: {} as any,
				message: "Async AI job kết thúc nhưng thiếu dữ liệu result",
				success: false,
			};
		}

		const pollAfterMs = Number(statusPayload?.pollAfterMs) || AI_ASYNC_POLL_INTERVAL_MS;
		await new Promise((resolve) => setTimeout(resolve, Math.max(1000, pollAfterMs)));
	}

	return {
		code: -1,
		result: {} as any,
		message: "Hết thời gian chờ xử lý async AI",
		success: false,
	};
}

/**
 * Format SEO prompt với các tham số
 * Export để có thể gọi từ auto-code với custom template
 */
export function formatSeoPrompt(params: SeoContentParams): string {
	const { articleType, topic, additionalInfo, primaryKeyword, secondaryKeywords } = params;
	
	// Chuyển đổi mảng từ khóa phụ thành chuỗi có định dạng JSON
	const secondaryKeywordsString = JSON.stringify(secondaryKeywords);
	
	// Sử dụng chuỗi này để thay thế placeholder trong prompt
	return PROMPT_GENERATE_POST
		.replace('"%s"', `"${articleType}"`)
		.replace('"%s"', `"${topic}"`)
		.replace('%s', additionalInfo)
		.replace('"%s"', `"${primaryKeyword}"`)
		.replace('%s', secondaryKeywordsString);
}

/**
 * Gọi API để tạo nội dung SEO bằng AI
 * 
 * @param params - Tham số để tạo nội dung SEO
 * @param customPrompt - (Optional) Custom prompt thay vì dùng PROMPT_GENERATE_POST mặc định
 * @returns Promise trả về kết quả SEO content hoặc lỗi
 * 
 * @example
 * ```typescript
 * // Dùng prompt mặc định
 * const result = await generateSeoContent({
 *   articleType: "Bất động sản",
 *   topic: "Căn hộ cao cấp Vinhomes Central Park",
 *   additionalInfo: "Căn 2PN, 80m2, view sông, giá 5 tỷ",
 *   primaryKeyword: "căn hộ Vinhomes Central Park",
 *   secondaryKeywords: ["căn hộ cao cấp", "Vinhomes", "view sông"]
 * });
 * 
 * // Dùng custom prompt
 * const customResult = await generateSeoContent(params, myCustomPrompt);
 * 
 * if (result.success) {
 *   console.log(result.data.title);
 *   console.log(result.data.description);
 *   console.log(result.data.html_content);
 * }
 * ```
 */
export async function generateSeoContent(params: SeoContentParams, customPrompt?: string) {
	const seoPrompt = customPrompt || formatSeoPrompt(params);
	
	const requestBody: GenerateSeoContentRequest = {
		prompt: seoPrompt
	};
	
	try {
		const response = await request
			.post("ai-generate-seo-content", {
				json: requestBody,
				timeout: AI_REQUEST_TIMEOUT,
			})
			.json<ApiResponse<SeoContentResult>>();
		
		return response;
	} catch (error: any) {
		return {
			code: -1,
			result: {} as SeoContentResult,
			message: error.message || "Unknown error occurred",
			success: false
		};
	}
}

/**
 * Gọi AI với prompt tùy chỉnh hoàn toàn (không cần params cấu trúc)
 * Sử dụng khi bạn muốn kiểm soát hoàn toàn nội dung prompt và format trả về
 * 
 * @param prompt - Prompt đầy đủ để gửi tới AI
 * @returns Promise trả về kết quả - có thể chứa bất kỳ trường nào AI trả về trong JSON
 * 
 * @example
 * ```typescript
 * const customPrompt = `
 *   Viết một bài SEO về bất động sản. Trả về JSON với format:
 *   {
 *     "title": "...",
 *     "description": "...",
 *     "html_content": "...",
 *     "keywords": "...",
 *     "author": "..."
 *   }
 * `;
 * const result = await generateSeoContentWithPrompt(customPrompt);
 * // result.data có thể chứa thêm keywords, author ngoài 3 trường chuẩn
 * ```
 */
export async function generateSeoContentWithPrompt(prompt: string, options?: GenerateSeoContentOptions) {
	const requestBody: GenerateSeoContentRequest = {
		prompt: prompt
	};
	
	try {
		if (options?.preferAsync || prompt.length >= AI_ASYNC_THRESHOLD_CHARS) {
			return await generateSeoContentWithPromptAsync(prompt, options);
		}

		const response = await request
			.post("ai-generate-seo-content", {
				json: {
					...requestBody,
					taskType: options?.taskType || "seo_content",
				},
				timeout: AI_REQUEST_TIMEOUT,
			})
			.json<ApiResponse<any>>(); // any để chấp nhận custom fields
		
		return response;
	} catch (error: any) {
		return {
			code: -1,
			result: {} as any,
			message: error.message || "Unknown error occurred",
			success: false
		};
	}
}

/**
 * Shorthand: csm_ai_generate_seo_content
 * Để tương thích với code cũ, cung cấp alias với callback pattern
 * 
 * @deprecated Khuyến khích dùng generateSeoContent với async/await
 */
export function csm_ai_generate_seo_content(
	articleType: string,
	topic: string,
	additionalInfo: string,
	primaryKeyword: string,
	secondaryKeywords: string[],
	callback: (result: ApiResponse<SeoContentResult>) => void
) {
	generateSeoContent({
		articleType,
		topic,
		additionalInfo,
		primaryKeyword,
		secondaryKeywords
	})
		.then(callback)
		.catch(error => {
			callback({
				code: -1,
				result: {} as SeoContentResult,
				message: error.message || "Unknown error occurred",
				success: false
			});
		});
}
