package security

import (
	"crypto/sha256"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const jwtExpirationMs = 86_400_000 // 24h

type Claims struct {
	Sub string `json:"sub"`
	UID string `json:"uid"`
	Ver int    `json:"ver"`
	jwt.RegisteredClaims
}

type JWTUtil struct {
	secret []byte
}

func NewJWTUtil(secret string) *JWTUtil {
	return &JWTUtil{secret: deriveKeyBytes(secret)}
}

func (j *JWTUtil) GenerateToken(subject string, loginVersion int) string {
	return j.GenerateTokenWithUID(subject, "", loginVersion)
}

func (j *JWTUtil) GenerateTokenWithUID(subject, userID string, loginVersion int) string {
	now := time.Now()
	claims := Claims{
		Sub: subject,
		UID: userID,
		Ver: loginVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(jwtExpirationMs) * time.Millisecond)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, _ := token.SignedString(j.secret)
	return s
}

func (j *JWTUtil) ValidateToken(token string) bool {
	_, err := j.ParseClaims(token)
	return err == nil
}

func (j *JWTUtil) ParseClaims(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		return j.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := parsed.Claims.(*Claims); ok && parsed.Valid {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}

func (j *JWTUtil) ParseClaimsAllowExpired(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		return j.secret, nil
	}, jwt.WithoutClaimsValidation())
	if err != nil {
		return nil, err
	}
	if claims, ok := parsed.Claims.(*Claims); ok {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}

func (j *JWTUtil) UsernameFromToken(token string) string {
	if c, err := j.ParseClaims(token); err == nil {
		return c.Sub
	}
	return ""
}

func (j *JWTUtil) UserIDFromToken(token string) string {
	if c, err := j.ParseClaims(token); err == nil {
		return c.UID
	}
	return ""
}

func (j *JWTUtil) LoginVersionFromToken(token string) int {
	if c, err := j.ParseClaims(token); err == nil {
		return c.Ver
	}
	return 0
}

func deriveKeyBytes(secret string) []byte {
	raw := []byte(secret)
	if len(raw) == 0 {
		raw = []byte("change-me-to-a-strong-secretge")
	}
	if len(raw) >= 32 {
		return raw
	}
	sum := sha256.Sum256(raw)
	return sum[:]
}
