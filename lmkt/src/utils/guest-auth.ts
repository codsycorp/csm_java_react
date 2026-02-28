/**
 * Guest Authentication Manager
 * Manages guest tokens for website visitors
 */

const GUEST_TOKEN_KEY = 'csm_guest_token';
const GUEST_ID_KEY = 'csm_guest_id';
const GUEST_TOKEN_EXPIRY_KEY = 'csm_guest_token_expiry';

export interface GuestTokenResponse {
  token: string;
  guestId: string;
  expiresIn?: number;
  expiresAt?: string;
}

/**
 * Get or create guest token
 */
export async function getOrCreateGuestToken(apiBaseUrl: string): Promise<string | null> {
  try {
    const cached = getStoredGuestToken();
    if (cached && isTokenValid(cached)) {
      console.log('✅ Using cached guest token');
      return cached;
    }

    console.log('🔄 Requesting new guest token...');
    // Ensure URL doesn't end with /api and build correctly
    const baseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
    const response = await fetch(`${baseUrl}/generate-guest-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        referrer: document.referrer,
      }),
    });

    if (!response.ok) {
      console.error(`❌ Failed to get guest token: ${response.status}`);
      return null;
    }

    const data: GuestTokenResponse = await response.json();
    if (data.token) {
      storeGuestToken(data.token, data.guestId, data.expiresIn);
      console.log('✅ New guest token created and stored');
      return data.token;
    }
  } catch (err) {
    console.error('❌ Error getting guest token:', err);
  }

  return null;
}

/**
 * Store guest token in localStorage
 */
export function storeGuestToken(token: string, guestId: string, expiresInSeconds?: number): void {
  try {
    localStorage.setItem(GUEST_TOKEN_KEY, token);
    localStorage.setItem(GUEST_ID_KEY, guestId);
    
    if (expiresInSeconds) {
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      localStorage.setItem(GUEST_TOKEN_EXPIRY_KEY, expiresAt);
    }
  } catch (err) {
    console.warn('⚠️ Failed to store guest token:', err);
  }
}

/**
 * Get guest token from localStorage
 */
export function getStoredGuestToken(): string | null {
  try {
    return localStorage.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Check if token is valid
 */
export function isTokenValid(token: string): boolean {
  try {
    const expiryStr = localStorage.getItem(GUEST_TOKEN_EXPIRY_KEY);
    if (!expiryStr) return true;
    
    const expiry = new Date(expiryStr);
    return expiry > new Date();
  } catch {
    return false;
  }
}

/**
 * Get guest ID
 */
export function getGuestId(): string | null {
  try {
    return localStorage.getItem(GUEST_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear guest token
 */
export function clearGuestToken(): void {
  try {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_TOKEN_EXPIRY_KEY);
    console.log('✅ Guest token cleared');
  } catch (err) {
    console.warn('⚠️ Failed to clear guest token:', err);
  }
}

/**
 * Add guest token to headers
 */
export function addGuestTokenToHeaders(
  headers: Record<string, string>,
  token: string | null
): Record<string, string> {
  if (token) {
    return {
      ...headers,
      'X-Guest-Token': token,
    };
  }
  return headers;
}
