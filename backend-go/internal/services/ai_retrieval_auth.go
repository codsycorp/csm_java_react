package services

import (
	"strings"
)

// RetrievalAuthContext mirrors Java AiRetrievalAuthContext for RAG ACL filtering.
type RetrievalAuthContext struct {
	Authenticated bool
	IsAdminOrDev  bool
	BranchID      string
	DeptID        string
	DataScope     string
	FilterEnabled bool
}

// RetrievalAuthAnonymous is default when no user context.
var RetrievalAuthAnonymous = RetrievalAuthContext{FilterEnabled: true}

// BuildRetrievalAuthContext builds ACL context from request principal fields.
func BuildRetrievalAuthContext(appID string, dev, isSubUser bool, branchID, deptID, dataScope string) RetrievalAuthContext {
	auth := RetrievalAuthContext{
		Authenticated: true,
		IsAdminOrDev:  dev || strings.EqualFold(appID, "csm"),
		BranchID:      strings.TrimSpace(branchID),
		DeptID:        strings.TrimSpace(deptID),
		DataScope:     strings.TrimSpace(dataScope),
		FilterEnabled: true,
	}
	_ = isSubUser
	return auth
}

// PassesRetrievalAuthFilter checks chunk tags against principal ACL (Java parity).
func PassesRetrievalAuthFilter(tags string, auth RetrievalAuthContext) bool {
	if !auth.FilterEnabled {
		return true
	}
	if auth.IsAdminOrDev {
		return true
	}
	normalized := strings.ToLower(strings.TrimSpace(tags))
	if !strings.Contains(normalized, "acl:") {
		return true
	}
	if strings.Contains(normalized, "acl:admin") {
		return false
	}
	if strings.Contains(normalized, "acl:tenant") && !auth.Authenticated {
		return false
	}
	if auth.BranchID != "" && strings.Contains(normalized, "branch:") {
		tag := extractTagValue(normalized, "branch:")
		if tag != "" && tag != strings.ToLower(auth.BranchID) {
			return false
		}
	}
	if auth.DeptID != "" && strings.Contains(normalized, "dept:") {
		tag := extractTagValue(normalized, "dept:")
		if tag != "" && tag != strings.ToLower(auth.DeptID) {
			return false
		}
	}
	return true
}

func extractTagValue(tags, prefix string) string {
	idx := strings.Index(tags, prefix)
	if idx < 0 {
		return ""
	}
	start := idx + len(prefix)
	end := strings.Index(tags[start:], " ")
	if end < 0 {
		return strings.TrimSpace(tags[start:])
	}
	return strings.TrimSpace(tags[start : start+end])
}

// EnrichRetrievalTagsWithACL adds branch/dept ACL tags for scoped org data.
func EnrichRetrievalTagsWithACL(baseTags []string, auth RetrievalAuthContext) string {
	tags := append([]string{}, baseTags...)
	if auth.BranchID != "" {
		tags = append(tags, "branch:"+strings.ToLower(auth.BranchID))
	}
	if auth.DeptID != "" {
		tags = append(tags, "dept:"+strings.ToLower(auth.DeptID))
	}
	return strings.Join(tags, ",")
}
