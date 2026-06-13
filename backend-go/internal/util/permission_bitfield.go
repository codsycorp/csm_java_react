package util

import (
	"encoding/base64"
	"math/big"
	"strings"
)

const (
	SchemaV3 = "v3"

	v3MenuShift = 48
	v3ActionShift = 40
	v3ScopeShift = 32
	v3MenuMask = 0xFFFF
	v3ActionMask = 0xFF
	v3ScopeMask = 0xFF
	v3ReservedSignature = 0x43534D33

	v3ActionView = 0
	v3ActionCreate = 1
	v3ActionEdit = 2
	v3ActionDelete = 3
	v3ActionExport = 4

	v3ScopeOwner = 0
	v3ScopeDepartment = 1
	v3ScopeBranch = 2
	v3ScopeAll = 3

	actionView = 31
	actionCreate = 33
	actionEdit = 32
	actionDelete = 34
	actionExport = 35
	dataScopeOwner = 41
	dataScopeDepartment = 42
	dataScopeBranch = 43
	dataScopeAll = 44
)

var menuBitToToken = map[int]string{
	0: "/home",
	1: "/system/user",
	2: "/system/role",
	3: "/system/menu",
	4: "/system/dept",
	5: "/system/developer",
	6: "/system/broadcast",
	7: "/system/report",
	8: "/crm",
}

func ToCompactToken(bitfield uint64) string {
	return toBase36Upper(bitfield)
}

func MenusFromBitfield(raw string) []string {
	token, ok := ParseSecurityToken(raw)
	if !ok {
		return nil
	}
	var out []string
	for bit, label := range menuBitToToken {
		if hasBitV3(token, bit) {
			out = append(out, label)
		}
	}
	return out
}

func toBase36Upper(value uint64) string {
	if value == 0 {
		return "0"
	}
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	var out []byte
	for value > 0 {
		rem := value % 36
		out = append(out, alphabet[rem])
		value /= 36
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}

func ParseSecurityTokenOptional(raw *string) (uint64, bool) {
	if raw == nil {
		return 0, false
	}
	return ParseSecurityToken(*raw)
}

var actionBitToToken = map[int]string{
	actionView:   "view",
	actionCreate: "create",
	actionEdit:   "edit",
	actionDelete: "delete",
	actionExport: "export",
}

func ParseSecurityToken(raw string) (uint64, bool) {
	text := strings.ReplaceAll(strings.TrimSpace(raw), "_", "")
	if text == "" {
		return 0, false
	}
	if rest, ok := strings.CutPrefix(text, "b36:"); ok || strings.HasPrefix(strings.ToUpper(text), "B36:") {
		if !ok {
			rest = text[4:]
		}
		n, ok := parseBase36(rest)
		if ok {
			return normalizeToSingleToken(n), true
		}
	}
	if strings.HasPrefix(strings.ToLower(text), "b64:") {
		rest := text[4:]
		data, err := base64.RawURLEncoding.DecodeString(rest)
		if err != nil {
			data, err = base64.StdEncoding.DecodeString(rest)
		}
		if err == nil && len(data) == 8 {
			var value uint64
			for _, b := range data {
				value = (value << 8) | uint64(b)
			}
			return normalizeToSingleToken(value), true
		}
	}
	if rest, ok := strings.CutPrefix(text, "0x"); ok {
		n, ok := parseHex(rest)
		if ok {
			return normalizeToSingleToken(n), true
		}
	}
	if isAllDigits(text) {
		n, ok := parseBase10(text)
		if ok {
			return normalizeToSingleToken(n), true
		}
	}
	if isAlphaNum(text) {
		n, ok := parseBase36(text)
		if ok {
			return normalizeToSingleToken(n), true
		}
	}
	n, ok := parseBase10(text)
	if ok {
		return normalizeToSingleToken(n), true
	}
	return 0, false
}

func PermissionsFromBitfield(raw string) []string {
	token, ok := ParseSecurityToken(raw)
	if !ok {
		return nil
	}
	var out []string
	for bit, label := range actionBitToToken {
		if hasBitV3(token, bit) {
			out = append(out, label)
		}
	}
	switch ResolveDataScope(token) {
	case "ALL":
		out = append(out, "scope:all")
	case "BRANCH":
		out = append(out, "scope:branch")
	case "DEPARTMENT":
		out = append(out, "scope:department")
	case "OWNER":
		out = append(out, "scope:owner")
	}
	return out
}

func ResolveDataScope(bitfield uint64) string {
	token := normalizeToSingleToken(bitfield)
	scopeMask := extractV3ScopeMask(token)
	if hasMaskBit(scopeMask, v3ScopeAll) {
		return "ALL"
	}
	if hasMaskBit(scopeMask, v3ScopeBranch) {
		return "BRANCH"
	}
	if hasMaskBit(scopeMask, v3ScopeDepartment) {
		return "DEPARTMENT"
	}
	if hasMaskBit(scopeMask, v3ScopeOwner) {
		return "OWNER"
	}
	return "NONE"
}

func BuildBitfield(permissions, menus []string, dev bool) uint64 {
	var menuMask, actionMask, scopeMask uint64
	if dev {
		actionMask = setMaskBit(actionMask, v3ActionView)
		actionMask = setMaskBit(actionMask, v3ActionCreate)
		actionMask = setMaskBit(actionMask, v3ActionEdit)
		actionMask = setMaskBit(actionMask, v3ActionDelete)
		actionMask = setMaskBit(actionMask, v3ActionExport)
		scopeMask = setMaskBit(scopeMask, v3ScopeAll)
	}
	for _, raw := range permissions {
		token := normalizeToken(raw)
		switch token {
		case "dev", "admin":
			actionMask = setMaskBit(actionMask, v3ActionView)
			actionMask = setMaskBit(actionMask, v3ActionCreate)
			actionMask = setMaskBit(actionMask, v3ActionEdit)
			actionMask = setMaskBit(actionMask, v3ActionDelete)
			actionMask = setMaskBit(actionMask, v3ActionExport)
			scopeMask = setMaskBit(scopeMask, v3ScopeAll)
		case "view", "read":
			actionMask = setMaskBit(actionMask, v3ActionView)
		case "create", "add", "insert":
			actionMask = setMaskBit(actionMask, v3ActionCreate)
		case "edit", "update", "write":
			actionMask = setMaskBit(actionMask, v3ActionEdit)
		case "delete", "remove":
			actionMask = setMaskBit(actionMask, v3ActionDelete)
		case "export":
			actionMask = setMaskBit(actionMask, v3ActionExport)
		case "scope:owner", "owner":
			scopeMask = setMaskBit(scopeMask, v3ScopeOwner)
		case "scope:department", "department", "team":
			scopeMask = setMaskBit(scopeMask, v3ScopeDepartment)
		case "scope:branch", "branch":
			scopeMask = setMaskBit(scopeMask, v3ScopeBranch)
		case "scope:all", "all":
			scopeMask = setMaskBit(scopeMask, v3ScopeAll)
		}
	}
	return (menuMask&v3MenuMask)<<v3MenuShift |
		(actionMask&v3ActionMask)<<v3ActionShift |
		(scopeMask&v3ScopeMask)<<v3ScopeShift |
		(v3ReservedSignature & 0xFFFFFFFF)
}

func MergeUniqueCaseInsensitive(base, extra []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, value := range append(append([]string{}, base...), extra...) {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, normalized)
	}
	return out
}

func SubtractCaseInsensitive(base, deny []string) []string {
	denyKeys := make(map[string]struct{})
	for _, value := range deny {
		key := strings.ToLower(strings.TrimSpace(value))
		if key != "" {
			denyKeys[key] = struct{}{}
		}
	}
	var out []string
	for _, value := range base {
		key := strings.ToLower(strings.TrimSpace(value))
		if key == "" {
			continue
		}
		if _, denied := denyKeys[key]; denied {
			continue
		}
		out = append(out, strings.TrimSpace(value))
	}
	return out
}

func HasAdminPrivilege(bitfield uint64) bool {
	token := normalizeToSingleToken(bitfield)
	return hasBitV3(token, actionView) &&
		hasBitV3(token, actionCreate) &&
		hasBitV3(token, actionEdit) &&
		hasBitV3(token, actionDelete) &&
		hasBitV3(token, actionExport) &&
		strings.EqualFold(ResolveDataScope(token), "ALL")
}

func HasActionPermission(permissions []string, action string) bool {
	expected := strings.ToLower(strings.TrimSpace(action))
	if expected == "" {
		return false
	}
	for _, permission := range permissions {
		normalized := strings.ToLower(strings.TrimSpace(permission))
		if normalized == expected || normalized == "admin" {
			return true
		}
	}
	return false
}

func normalizeToken(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func normalizeToSingleToken(token uint64) uint64 {
	if isSecurityTokenV3(token) {
		return token
	}
	var menuMask uint64
	for i := 0; i <= 15; i++ {
		if token&(1<<uint(i)) != 0 {
			menuMask = setMaskBit(menuMask, uint64(i))
		}
	}
	var actionMask uint64
	if token&(1<<actionView) != 0 {
		actionMask = setMaskBit(actionMask, v3ActionView)
	}
	if token&(1<<actionCreate) != 0 {
		actionMask = setMaskBit(actionMask, v3ActionCreate)
	}
	if token&(1<<actionEdit) != 0 {
		actionMask = setMaskBit(actionMask, v3ActionEdit)
	}
	if token&(1<<actionDelete) != 0 {
		actionMask = setMaskBit(actionMask, v3ActionDelete)
	}
	if token&(1<<actionExport) != 0 {
		actionMask = setMaskBit(actionMask, v3ActionExport)
	}
	var scopeMask uint64
	if token&(1<<dataScopeOwner) != 0 {
		scopeMask = setMaskBit(scopeMask, v3ScopeOwner)
	}
	if token&(1<<dataScopeDepartment) != 0 {
		scopeMask = setMaskBit(scopeMask, v3ScopeDepartment)
	}
	if token&(1<<dataScopeBranch) != 0 {
		scopeMask = setMaskBit(scopeMask, v3ScopeBranch)
	}
	if token&(1<<dataScopeAll) != 0 {
		scopeMask = setMaskBit(scopeMask, v3ScopeAll)
	}
	return (menuMask&v3MenuMask)<<v3MenuShift |
		(actionMask&v3ActionMask)<<v3ActionShift |
		(scopeMask&v3ScopeMask)<<v3ScopeShift |
		(v3ReservedSignature & 0xFFFFFFFF)
}

func isSecurityTokenV3(token uint64) bool {
	return (token & 0xFFFFFFFF) == (v3ReservedSignature & 0xFFFFFFFF)
}

func hasBitV3(token uint64, bitIndex int) bool {
	if bitIndex < 0 {
		return false
	}
	if bitIndex <= 15 {
		return hasMaskBit(extractV3MenuMask(token), uint64(bitIndex))
	}
	switch bitIndex {
	case actionView:
		return hasMaskBit(extractV3ActionMask(token), v3ActionView)
	case actionCreate:
		return hasMaskBit(extractV3ActionMask(token), v3ActionCreate)
	case actionEdit:
		return hasMaskBit(extractV3ActionMask(token), v3ActionEdit)
	case actionDelete:
		return hasMaskBit(extractV3ActionMask(token), v3ActionDelete)
	case actionExport:
		return hasMaskBit(extractV3ActionMask(token), v3ActionExport)
	case dataScopeOwner:
		return hasMaskBit(extractV3ScopeMask(token), v3ScopeOwner)
	case dataScopeDepartment:
		return hasMaskBit(extractV3ScopeMask(token), v3ScopeDepartment)
	case dataScopeBranch:
		return hasMaskBit(extractV3ScopeMask(token), v3ScopeBranch)
	case dataScopeAll:
		return hasMaskBit(extractV3ScopeMask(token), v3ScopeAll)
	default:
		return false
	}
}

func extractV3MenuMask(token uint64) uint64  { return (token >> v3MenuShift) & v3MenuMask }
func extractV3ActionMask(token uint64) uint64 { return (token >> v3ActionShift) & v3ActionMask }
func extractV3ScopeMask(token uint64) uint64  { return (token >> v3ScopeShift) & v3ScopeMask }

func setMaskBit(mask, bit uint64) uint64 { return mask | (1 << bit) }
func hasMaskBit(mask, bit uint64) bool   { return mask&(1<<bit) != 0 }

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func isAlphaNum(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') {
			return false
		}
	}
	return true
}

func parseBase10(s string) (uint64, bool) {
	n := new(big.Int)
	if _, ok := n.SetString(s, 10); !ok {
		return 0, false
	}
	return n.Uint64(), true
}

func parseBase36(s string) (uint64, bool) {
	n := new(big.Int)
	if _, ok := n.SetString(strings.ToUpper(s), 36); !ok {
		return 0, false
	}
	return n.Uint64(), true
}

func parseHex(s string) (uint64, bool) {
	n := new(big.Int)
	if _, ok := n.SetString(s, 16); !ok {
		return 0, false
	}
	return n.Uint64(), true
}
