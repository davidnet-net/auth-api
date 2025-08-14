import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { createAccessToken, createRefreshToken, verifyJWT } from "../lib/jwt.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
	throw new Error("Invalid env: DA_ISPROD");
}

export interface SessionInfo {
	userId: number;
	username: string;
	display_name: string;
	profilePicture: string;
	email_verified: number;
	email: string;
	type: "access";
	exp: number;
	jti: string;
	admin: number;
	internal: number;
	preferences: {
		timezone: string;
		dateFormat: string;
		firstDay: string;
	};
}

// deno-lint-ignore no-explicit-any
function toSessionInfo(payload: any): SessionInfo {
	return {
		userId: payload.userId,
		username: payload.username,
		display_name: payload.display_name ?? "",
		profilePicture: payload.profilePicture ?? "",
		email_verified: payload.email_verified ?? 0,
		email: payload.email ?? "",
		type: "access",
		exp: payload.exp ?? 0,
		jti: payload.jti ?? "",
		admin: payload.admin ?? 0,
		internal: payload.internal ?? 0,
		preferences: {
			timezone: payload.preferences?.timezone ?? "UTC",
			dateFormat: payload.preferences?.dateFormat ?? "DD/MM/YYYY",
			firstDay: payload.preferences?.firstDay ?? "1",
		},
	};
}

export const refresh = async (ctx: Context) => {
	try {
		// Get refresh token from cookies
		const refreshToken = await ctx.cookies.get("refresh_token");
		if (!refreshToken) {
			ctx.response.status = 401;
			ctx.response.body = { error: "Missing refresh token" };
			return;
		}

		// Verify refresh token
		const jwt = await verifyJWT(refreshToken);
		const payload: SessionInfo = toSessionInfo(jwt);
		if (!payload) {
			ctx.response.status = 401;
			ctx.response.body = { error: "Invalid refresh token" };
			return;
		}

		const client = await getDBClient();
		if (!client) {
			log_error("refresh error: DATABASE CONNECTION ERR", ctx.state.correlationID);
			ctx.response.status = 500;
			ctx.response.body = { error: "Database connection error." };
			return;
		}

		// Check session in DB
		const sessions = await client.query(
			`SELECT * FROM sessions WHERE jwt_id = ? AND user_id = ? AND expires_at > NOW() LIMIT 1`,
			[payload.jti, payload.userId]
		);
		if (sessions.length === 0) {
			ctx.response.status = 401;
			ctx.response.body = { error: "Session expired or invalid" };
			return;
		}

		// Check freshdata flag in body
		let freshData = false;
		try {
			const body = await ctx.request.body({ type: "json" }).value;
			freshData = body?.freshdata === true;
		} catch {
			freshData = false;
		}

		// If email_verified is 0, we must always fetch fresh data
		if (payload.email_verified === 0) freshData = true;

		// Fetch fresh user info from DB if needed
		let userData = payload;
		if (freshData) {
			const [userRow] = await client.query(
				`SELECT username, display_name, avatar_url AS profilePicture, email, email_verified, admin, internal FROM users WHERE id = ? LIMIT 1`,
				[payload.userId]
			);
			const [settingsRow] = await client.query(
				`SELECT timezone, dateFormat, firstDay FROM user_settings WHERE user_id = ? LIMIT 1`,
				[payload.userId]
			);

			userData = {
				...payload,
				username: userRow.username,
				display_name: userRow.display_name,
				profilePicture: userRow.profilePicture,
				email: userRow.email,
				email_verified: userRow.email_verified,
                admin: userRow.admin,
                internal: userRow.internal,
				preferences: {
					timezone: settingsRow?.timezone ?? "UTC",
					dateFormat: settingsRow?.dateFormat ?? "DD/MM/YYYY",
					firstDay: settingsRow?.firstDay ?? "1",
				},
			};
		}

		// Generate new JWTs
		const newJwtId = crypto.randomUUID();
		const newAccessToken = await createAccessToken({ ...userData, jti: newJwtId });
		const newRefreshToken = await createRefreshToken({ ...userData, jti: newJwtId });

		// Update session in DB
		const userAgent = ctx.request.headers.get("user-agent") || "";
		const ipAddress = ctx.request.ip;
		await client.execute(
			`UPDATE sessions SET jwt_id = ?, expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY), user_agent = ?, ip_address = ? WHERE jwt_id = ? AND user_id = ?`,
			[newJwtId, userAgent, ipAddress, payload.jti, payload.userId]
		);

		// Set new refresh token cookie
		ctx.cookies.set("refresh_token", newRefreshToken, {
			httpOnly: true,
			secure: DA_ISPROD,
			sameSite: DA_ISPROD ? "none" : "lax",
			domain: DA_ISPROD ? ".davidnet.net" : undefined,
			path: "/",
			maxAge: 7 * 24 * 60 * 60,
		});

		ctx.response.status = 200;
		ctx.response.body = { accessToken: newAccessToken };
	} catch (err) {
		log_error("refresh", err, ctx.state.correlationID);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error" };
	}
};

export default refresh;
