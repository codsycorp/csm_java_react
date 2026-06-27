package services

import "regexp"

type routerThresholdConfig struct {
	GreyDelta      float64
	GreyConfidence int
	FuzzyMin       float64
}

var routerThresholds = routerThresholdConfig{
	GreyDelta:      0.15,
	GreyConfidence: 60,
	FuzzyMin:       0.82,
}

var conversationalHintPhrases = []string{
	"cho tôi biết",
	"giúp tôi",
	"hãy cho",
	"vui lòng",
	"xin cho",
	"please",
	"thông tin",
	"tin tức",
	"thời tiết",
	"hôm nay",
	"latest",
	"news",
}

var explicitEditQuestionPatterns = mustCompileRegexList(
	`(?i)\b(cách|làm sao|như thế nào|how to)\b.{0,40}\b(sửa|fix|chỉnh|refactor|patch)\b`,
	`(?i)\b(sửa|fix|chỉnh|refactor|patch)\b.{0,40}\b(được không|không\?|khong\?|để làm gì|for what)\b`,
)

var explicitEditDirectivePatterns = mustCompileRegexList(
	`(?i)\b(sửa|fix|chỉnh|thêm|xóa|xoá|remove|delete|update|refactor|patch|apply|viết|tạo)\b.{0,40}\b(hàm|function|class|biến|menu|json|file|đoạn|code|module|table)\b`,
	`(?i)\b(sửa|fix|chỉnh|thêm|xóa|xoá|remove|delete|update|refactor|patch|apply)\b.{0,40}\b(này|đây|ngay|trực tiếp|directly)\b`,
)

func mustCompileRegexList(patterns ...string) []*regexp.Regexp {
	out := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		out = append(out, regexp.MustCompile(p))
	}
	return out
}
