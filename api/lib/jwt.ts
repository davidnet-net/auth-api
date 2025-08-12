// lib/jwt.ts
import {
	create,
	getNumericDate,
	Payload,
	verify,
} from "https://deno.land/x/djwt@v2.8/mod.ts";

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

const JWT_SECRET_STRING = Deno.env.get("DA_JWT_SECRET");
if (!JWT_SECRET_STRING) throw new Error("Missing JWT_SECRET env var");

export const JWT_SECRET = await importKey(JWT_SECRET_STRING);

const ALGORITHM = "HS256";

export interface AccessTokenPayload extends Payload {
	userId: number | string;
	username: string;
	type: "access";
}

export interface RefreshTokenPayload extends Payload {
	userId: number | string;
	username: string;
	type: "refresh";
	jti: string;
}

export type JwtPayload = AccessTokenPayload | RefreshTokenPayload;

/**
 * Create a JWT token with specified payload and expiry (in seconds)
 */
export async function createJWT(
	payload: Omit<JwtPayload, "exp">,
	expiresInSeconds: number,
): Promise<string> {
	const fullPayload = {
		...payload,
		exp: getNumericDate(expiresInSeconds),
	};
	return await create(
		{ alg: ALGORITHM, typ: "JWT" },
		fullPayload,
		JWT_SECRET,
	);
}

/**
 * Verify a JWT token and return the decoded payload if valid.
 * Throws if token is invalid or expired.
 */
export async function verifyJWT(token: string): Promise<JwtPayload> {
	const payload = await verify(token, JWT_SECRET);
	return payload as JwtPayload;
}

/**
 * Convenience function to create access token (15 minutes expiry)
 */
export async function createAccessToken(
	payload: Omit<AccessTokenPayload, "exp" | "type">,
) {
	return await createJWT({ ...payload, type: "access" }, 15 * 60);
}

/**
 * Convenience function to create refresh token (7 days expiry)
 */
export async function createRefreshToken(
	payload: Omit<RefreshTokenPayload, "exp" | "type">,
) {
	return await createJWT({ ...payload, type: "refresh" }, 7 * 24 * 60 * 60);
}
