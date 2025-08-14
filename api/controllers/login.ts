import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { compare } from "https://deno.land/x/bcrypt/mod.ts";
import { log_error } from "../lib/logger.ts";
import { createAccessToken, createRefreshToken } from "../lib/jwt.ts";

const AVATAR_PLACEHOLDER = "http://localhost:5173/placeholder.png";
const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
    throw new Error("Invalid env: DA_ISPROD");
}

export const login = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const { identifier, password } = body;

        // Basic validation
        if (!identifier || typeof identifier !== "string" || !password || typeof password !== "string") {
            ctx.response.status = 400;
            ctx.response.body = { error: "Identifier (email or username) and password are required." };
            return;
        }

        const client = await getDBClient();
        if (!client) {
            log_error("login error: DATABASE CONNECTION ERR", ctx.state.correlationID);
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        // Find user by email OR username
        const users = await client.query(
            `SELECT * FROM users 
			 WHERE email = ? OR username = ? 
			 LIMIT 1`,
            [identifier, identifier],
        );

        if (users.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid identifier or password." };
            return;
        }

        const user = users[0];

        const preferences = await client.query(
            `SELECT * FROM user_settings 
			 WHERE id = ? 
			 LIMIT 1`,
            [user.id],
        );
        // Compare password
        const valid = await compare(password, user.password);
        if (!valid) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid identifier or password." };
            return;
        }

        // Generate unique jwtId
        let jwtId = "";
        let exists = true;
        while (exists) {
            jwtId = crypto.randomUUID();
            const rows = await client.query(
                `SELECT 1 FROM sessions WHERE jwt_id = ? LIMIT 1`,
                [jwtId],
            );
            exists = rows.length > 0;
        }

        // Tokens
        const refresh_token = await createRefreshToken({
            userId: user.id,
            username: user.username,
            display_name: user.display_name,
            profilePicture: user.avatar_url || AVATAR_PLACEHOLDER,
            email_verified: user.email_verified,
            email: user.email,
            jti: jwtId,
            admin: user.admin,
            internal: user.internal,
            preferences: {
                timezone: preferences.timezone,
                dateFormat: preferences.dateFormat,
                firstDay: preferences.firstDay,
            },
        });

        const access_token = await createAccessToken({
            userId: user.id,
            username: user.username,
            display_name: user.display_name,
            profilePicture: user.avatar_url || AVATAR_PLACEHOLDER,
            email_verified: user.email_verified,
            email: user.email,
            jti: jwtId,
            admin: user.admin,
            internal: user.internal,
            preferences: {
                timezone: preferences.timezone,
                dateFormat: preferences.dateFormat,
                firstDay: preferences.firstDay,
            },
        });

        // Save session
        await client.execute(
            `INSERT INTO sessions (user_id, jwt_id, expires_at, user_agent, ip_address) 
			 VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), ?, ?)`,
            [
                user.id,
                jwtId,
                ctx.request.headers.get("user-agent") || "",
                ctx.request.ip,
            ],
        );

        // Set cookie
        ctx.cookies.set("refresh_token", refresh_token, {
            httpOnly: true,
            secure: DA_ISPROD,
            sameSite: DA_ISPROD ? "none" : "lax",
            domain: DA_ISPROD ? ".davidnet.net" : undefined,
            path: "/",
            maxAge: 7 * 24 * 60 * 60, // 7 days
        });

        ctx.response.status = 200;
        ctx.response.body = {
            message: "Login successful.",
            access_token,
            email_verified: user.email_verified,
            email: user.email,
            display_name: user.display_name,
        };
    } catch (error) {
        log_error("Login error:", error, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};

export default login;
