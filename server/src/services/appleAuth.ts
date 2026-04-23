import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const KEYS_TTL_MS = 60 * 60 * 1000;

interface AppleJwk {
  kid: string;
  alg: string;
  kty: string;
  use: string;
  n: string;
  e: string;
}

interface AppleKeysResponse {
  keys: AppleJwk[];
}

export interface AppleIdentityClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  nonce?: string;
}

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function fetchAppleKeys(force = false): Promise<AppleJwk[]> {
  if (!force && cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_TTL_MS) {
    return cachedKeys.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) {
    throw new Error(`Apple JWKS request failed: ${res.status}`);
  }
  const data = (await res.json()) as AppleKeysResponse;
  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('Apple JWKS response was empty');
  }
  cachedKeys = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function jwkToPem(jwk: AppleJwk): string {
  const pubKey = crypto.createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  return pubKey.export({ format: 'pem', type: 'spki' }).toString();
}

async function findKey(kid: string): Promise<AppleJwk> {
  let keys = await fetchAppleKeys();
  let match = keys.find((k) => k.kid === kid);
  if (!match) {
    keys = await fetchAppleKeys(true);
    match = keys.find((k) => k.kid === kid);
  }
  if (!match) {
    throw new Error('Apple identity token signed with unknown key');
  }
  return match;
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string,
): Promise<AppleIdentityClaims> {
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Apple identity token is malformed');
  }
  const key = await findKey(decoded.header.kid);
  const pem = jwkToPem(key);
  const payload = jwt.verify(identityToken, pem, {
    algorithms: ['RS256'],
    audience,
    issuer: APPLE_ISSUER,
  });
  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Apple identity token payload is invalid');
  }
  return payload as AppleIdentityClaims;
}
