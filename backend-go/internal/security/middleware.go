package security

import "context"

type contextKey string

const AuthUserKey contextKey = "authUser"

func AuthFromContext(ctx context.Context) *AuthUser {
	if v := ctx.Value(AuthUserKey); v != nil {
		if au, ok := v.(AuthUser); ok {
			return &au
		}
	}
	return nil
}
