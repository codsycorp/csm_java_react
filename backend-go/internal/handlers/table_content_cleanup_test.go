package handlers

import "testing"

func TestIsDuplicateAgainstAnchor(t *testing.T) {
	anchor := map[string]any{
		"id":           "100",
		"service_type": "bat-dong-san",
		"domain":       "csmbridge.net,localhost:3333",
		"title":        "Bán căn hộ quận 7 giá tốt",
		"content":      "<p>Căn hộ vị trí trung tâm, full nội thất, pháp lý rõ ràng.</p>",
		"thumbnail":    "https://cdn.test/img/a1.jpg",
	}
	cand := map[string]any{
		"id":           "101",
		"service_type": "bat-dong-san",
		"domain":       "csmbridge.net",
		"title":        "Bán căn hộ quận 7 giá tốt",
		"content":      "Căn hộ vị trí trung tâm, full nội thất, pháp lý rõ ràng.",
		"thumbnail":    "https://cdn.test/img/a1.jpg?ver=2",
	}

	dup, reason := isDuplicateAgainstAnchor(buildNormalizedRowBundle(anchor), cand)
	if !dup {
		t.Fatal("expected duplicate row")
	}
	if reason == "" {
		t.Fatal("expected duplicate reason")
	}
}

func TestDetectCategoryMismatch(t *testing.T) {
	row := map[string]any{
		"service_type": "bat-dong-san",
		"title":        "Phần mềm quản lý bán hàng đa kênh",
		"content":      "Hệ thống ERP giúp tối ưu vận hành doanh nghiệp.",
	}
	known := []string{"bat-dong-san", "phan-mem", "booking-online"}
	mismatch, conflict := detectCategoryMismatch(row, known)
	if !mismatch {
		t.Fatal("expected mismatch")
	}
	if conflict != "phan mem" {
		t.Fatalf("unexpected conflict category: %q", conflict)
	}
}

func TestDomainOverlap(t *testing.T) {
	if !domainOverlap("h-holding.vn,h-holding.com.vn", "www.h-holding.com.vn") {
		t.Fatal("expected aliases to overlap")
	}
	if domainOverlap("h-holding.vn", "csmbridge.net") {
		t.Fatal("expected different domains not to overlap")
	}
}
