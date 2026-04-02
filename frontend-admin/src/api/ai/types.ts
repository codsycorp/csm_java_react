/**
 * AI SEO Content Generation Types
 */

/**
 * Kết quả trả về từ API generate SEO content
 */
export interface SeoContentResult {
	/** Tiêu đề bài viết (50-65 ký tự) */
	title: string;
	/** Mô tả ngắn (155 ký tự) */
	description: string;
	/** Nội dung HTML đầy đủ */
	html_content: string;
}

/**
 * Request body cho API generate SEO content
 */
export interface GenerateSeoContentRequest {
	/** Prompt đã được format */
	prompt: string;
}

/**
 * Parameters để tạo SEO content
 */
export interface SeoContentParams {
	/** Loại bài viết (ví dụ: "Bất động sản", "Việc làm", "Tin tức") */
	articleType: string;
	/** Chủ đề bài viết */
	topic: string;
	/** Thông tin bổ sung để làm giàu nội dung */
	additionalInfo: string;
	/** Từ khóa chính (phải xuất hiện trong tiêu đề và nội dung) */
	primaryKeyword: string;
	/** Các từ khóa phụ/biến thể (cần được tích hợp tự nhiên) */
	secondaryKeywords: string[];
}
