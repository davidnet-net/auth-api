import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { createAccessToken, createRefreshToken, verifyJWT } from "../lib/jwt.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
    throw new Error("Invalid env: DA_ISPROD");
}

export const refresh = async (ctx: Context) => {
    try {
        const refreshToken = await ctx.cookies.get("refresh_token");
        if (!refreshToken) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Missing refresh token" };
            return;
        }

        // Verify refresh token signature & payload
        const payload = await verifyJWT(refreshToken);
        if (!payload) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid refresh token" };
            return;
        }

        const client = await getDBClient();
        if (!client) {
            log_error(
                "signup error: DATABASE CONNECTION ERR",
                ctx.state.correlationID,
            );
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        // Check session existence & validity in DB by jwt_id (jti)
        const sessions = await client.query(
            `SELECT * FROM sessions WHERE jwt_id = ? AND user_id = ? AND expires_at > NOW() LIMIT 1`,
            [payload.jti, payload.userId]
        );

        if (sessions.length === 0) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Session expired or invalid" };
            return;
        }

        let email_verified = 1;
        if (!payload.email_verified) {
            const user = await client.query(
                `SELECT email_verified FROM users WHERE id = ?`,
                [payload.userId]
            );
            email_verified = user[0].email_verified;
        }

        // Update session expires_at to extend session
        //await client.execute(
        //    `UPDATE sessions SET expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY) WHERE jwt_id = ?`,
        //    [payload.jti]
        //);

        // Generate new tokens with a new jwtId to prevent reuse of old tokens
        const newJwtId = crypto.randomUUID();

        const newAccessToken = await createAccessToken({
            userId: payload.userId,
            username: payload.username,
            profilePicture: payload.profilePicture,
            display_name: payload.display_name,
            email_verified: email_verified,
            email: payload.email,
            jti: newJwtId,
            admin: payload.admin,
            internal: payload.internal,
        });

        const newRefreshToken = await createRefreshToken({
            userId: payload.userId,
            username: payload.username,
            profilePicture: payload.profilePicture,
            display_name: payload.display_name,
            email: payload.email,
            jti: newJwtId,
            admin: payload.admin,
            internal: payload.internal,
        });

        const userAgent = ctx.request.headers.get("user-agent") || "";
        const ipAddress = ctx.request.ip;

        await client.execute(
            `UPDATE sessions SET jwt_id = ?, expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY), user_agent = ?, ip_address = ? WHERE jwt_id = ? AND user_id = ?`,
            [newJwtId, userAgent, ipAddress, payload.jti, payload.userId]
        );

        // Set new refresh token cookie
        ctx.cookies.set(
            "refresh_token",
            newRefreshToken,
            {
                httpOnly: true,
                secure: DA_ISPROD,
                sameSite: DA_ISPROD ? "none" : "lax",
                domain: DA_ISPROD ? ".davidnet.net" : undefined,
                path: "/",
                maxAge: 7 * 24 * 60 * 60,
            },
        );

        ctx.response.status = 200;
        ctx.response.body = { accessToken: newAccessToken };

    } catch (err) {
        log_error("refresh", err, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
};

export default refresh;
