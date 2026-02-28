// App token validation (admin decrypt removed for lmkt)

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidAppToken(token: string, expectedAppId?: string): boolean {
  // Stub implementation - lmkt doesn't use encrypted tokens
  if (!token || typeof token !== "string") return false;
  return true;
}

export default isValidAppToken;
