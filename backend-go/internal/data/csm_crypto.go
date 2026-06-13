package data

import (
	"encoding/base64"
	"fmt"
	"strings"
)

func csmStrtr(s, from, to string) string {
	if len(from) != len(to) {
		return s
	}
	replacer := strings.NewReplacer(pairReplacements(from, to)...)
	return replacer.Replace(s)
}

func pairReplacements(from, to string) []string {
	out := make([]string, 0, len(from)*2)
	for i := 0; i < len(from); i++ {
		out = append(out, string(from[i]), string(to[i]))
	}
	return out
}

func (rm *RecordManager) CsmEncrypt(plain string) string {
	b64 := base64.StdEncoding.EncodeToString([]byte(plain))
	from := Phone + WriteBy
	to := WriteBy + Phone
	return csmStrtr(b64, from, to)
}

func (rm *RecordManager) CsmDecrypt(encoded string) (string, error) {
	from := WriteBy + Phone
	to := Phone + WriteBy
	swapped := csmStrtr(encoded, from, to)
	bytes, err := base64.StdEncoding.DecodeString(swapped)
	if err != nil {
		return "", fmt.Errorf("csm decrypt: %w", err)
	}
	return string(bytes), nil
}
