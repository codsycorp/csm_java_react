package security

import (
	"strconv"
	"strings"
	"time"

	"csm_server/backend-go/internal/model"
)

var accountExpiryFieldAliases = []string{
	"account_expiry_at", "accountExpiryAt", "valid_until", "validUntil",
	"expiry_at", "expiryAt", "expires_at", "expiresAt",
	"end_date", "endDate", "subscription_end", "subscriptionEnd",
}

var accountExpiryDaysAliases = []string{
	"account_expiry_days", "accountExpiryDays", "usage_days", "usageDays",
	"duration_days", "durationDays", "time_use_days", "timeUseDays",
}

func AccountExpired(user model.User) bool {
	if user.AccountExpiryAt == nil {
		return false
	}
	expiry := *user.AccountExpiryAt
	if expiry <= 0 {
		return false
	}
	return expiry <= time.Now().UnixMilli()
}

func ApplyAccountExpiryFromInput(target map[string]any, source map[string]any) (int64, bool) {
	if target == nil {
		return 0, false
	}

	if expiry, explicit := resolveExplicitAccountExpiry(target, source); explicit {
		setCanonicalAccountExpiry(target, expiry)
		return expiry, true
	}

	days, ok := resolveUsageDays(target, source)
	if !ok {
		return 0, false
	}
	if days <= 0 {
		setCanonicalAccountExpiry(target, 0)
		return 0, true
	}
	expiry := toEndOfDay(time.Now().AddDate(0, 0, days)).UnixMilli()
	setCanonicalAccountExpiry(target, expiry)
	return expiry, true
}

func ValidateRequiredAccountExpiryOnCreate(target map[string]any, source map[string]any) (int64, string) {
	expiry, ok := ApplyAccountExpiryFromInput(target, source)
	if !ok {
		return 0, "Thiếu thời hạn sử dụng tài khoản (account_expiry_at hoặc account_expiry_days)."
	}
	if expiry <= time.Now().UnixMilli() {
		return 0, "Thời hạn sử dụng tài khoản phải lớn hơn thời điểm hiện tại."
	}
	return expiry, ""
}

func resolveExplicitAccountExpiry(target, source map[string]any) (int64, bool) {
	for _, key := range accountExpiryFieldAliases {
		if raw, ok := target[key]; ok {
			return model.AccountExpiryFromAny(raw), true
		}
	}
	for _, key := range accountExpiryFieldAliases {
		if source != nil {
			if raw, ok := source[key]; ok {
				return model.AccountExpiryFromAny(raw), true
			}
		}
	}
	return 0, false
}

func resolveUsageDays(target, source map[string]any) (int, bool) {
	for _, key := range accountExpiryDaysAliases {
		if raw, ok := target[key]; ok {
			if days, parsed := intFromAny(raw); parsed {
				return days, true
			}
		}
	}
	for _, key := range accountExpiryDaysAliases {
		if source != nil {
			if raw, ok := source[key]; ok {
				if days, parsed := intFromAny(raw); parsed {
					return days, true
				}
			}
		}
	}
	return 0, false
}

func intFromAny(raw any) (int, bool) {
	switch t := raw.(type) {
	case int:
		return t, true
	case int64:
		return int(t), true
	case float64:
		return int(t), true
	case string:
		text := strings.TrimSpace(t)
		if text == "" {
			return 0, false
		}
		n, err := strconv.Atoi(text)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func setCanonicalAccountExpiry(target map[string]any, expiryAt int64) {
	target["account_expiry_at"] = expiryAt
	target["accountExpiryAt"] = expiryAt
}

func toEndOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	loc := t.Location()
	return time.Date(y, m, d, 23, 59, 59, int(time.Second-time.Millisecond), loc)
}
