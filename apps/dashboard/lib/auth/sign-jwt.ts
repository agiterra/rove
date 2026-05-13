/**
 * Minimal HS256 JWT sign/decode for worker tokens.
 *
 * Supabase signs its own auth JWTs with HS256 + project-level secret.
 * We reuse that secret to mint per-worker tokens so PostgREST validates
 * them through the standard auth pipeline — no auth proxy, no custom
 * middleware. Pulling `jose` or `jsonwebtoken` in for two operations
 * we can do with Node's built-in crypto in 20 lines is not worth the
 * dep surface.
 */
import "server-only";
import crypto from "node:crypto";

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function signJwtHs256(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const seg1 = base64urlEncode(JSON.stringify(header));
  const seg2 = base64urlEncode(JSON.stringify(payload));
  const signing = `${seg1}.${seg2}`;
  const sig = crypto.createHmac("sha256", secret).update(signing).digest();
  return `${signing}.${base64urlEncode(sig)}`;
}

/**
 * Decode JWT claims without verifying the signature. Used only for
 * diagnostics (`rove auth show-token` in step 4). NEVER trust the
 * returned payload for an auth decision — PostgREST verifies the
 * signature, we don't.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed JWT (expected 3 segments)");
  }
  return JSON.parse(base64urlDecode(parts[1]).toString("utf-8"));
}
