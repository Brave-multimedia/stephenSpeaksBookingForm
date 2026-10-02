export interface AccessEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

export interface StaffIdentity {
  email: string;
}

let cachedKeys: { expiresAt: number; keys: JsonWebKey[] } | undefined;

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function requireAdmin(request: Request, env: AccessEnv): Promise<StaffIdentity | null> {
  try {
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

    const [encodedHeader, encodedClaims, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedClaims || !encodedSignature) return null;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader)));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedClaims)));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const issuer = `https://${teamDomain}`;
    if (claims.iss !== issuer || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(env.ACCESS_AUD)) return null;

    if (!cachedKeys || cachedKeys.expiresAt < Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
      if (!response.ok) return null;
      const keySet = await response.json() as { keys: JsonWebKey[] };
      cachedKeys = { keys: keySet.keys, expiresAt: Date.now() + 5 * 60_000 };
    }

    const jwk = cachedKeys.keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const signedValue = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey, decodeBase64Url(encodedSignature), signedValue
    );
    if (!valid || typeof claims.email !== 'string') return null;

    const email = claims.email.trim().toLowerCase();
    return email === 'admin@bravemultimedia.com' ? { email } : null;
  } catch {
    return null;
  }
}
