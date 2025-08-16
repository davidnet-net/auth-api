import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../../lib/db.ts";
import { hash } from "https://deno.land/x/bcrypt/mod.ts";
import { log_error } from "../../lib/logger.ts";
import { loadEmailTemplate, sendEmail } from "../../lib/mail.ts";
import { formatDate_PREFERREDTIME } from "../../lib/time.ts";
import { verifyJWT } from "../../lib/jwt.ts";

export const change_password = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const { password } = body;

        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized" };
            return;
        }

        let userId: number;
        let email: string;
        try {
            const token = authHeader.slice(7);
            const payload = await verifyJWT(token);
            userId = Number(payload.userId);
            email = String(payload.email);
        } catch {
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        if (
            !password || typeof password !== "string" ||
            password.length <6
        ) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Password is required." };
            return;
        }

        // Get the DB after validating
        const client = await getDBClient();
        if (!client) {
            log_error(
                "change password error: DATABASE CONNECTION ERR",
                ctx.state.correlationID,
            );
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        const hashedPassword = await hash(password);

        await client.execute(
            `UPDATE users SET password = ? WHERE id = ?`,
            [
                hashedPassword, userId
            ],
        );

        await sendEmail(
            email,
            "Davidnet Security - Password Changed",
            await loadEmailTemplate("email_templates/password_changed.html", {
                date: formatDate_PREFERREDTIME((new Date).toISOString(), await verifyJWT(authHeader.slice(7)))
            }),
        );

        ctx.response.status = 204;
    } catch (error) {
        log_error("Change password error:", error, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};

export const loadSecurity = async (ctx: Context) => {
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized" };
        return;
    }

    let userId: number;
    try {
        const token = authHeader.slice(7);
        const payload = await verifyJWT(token);
        userId = Number(payload.userId);
    } catch {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const client = await getDBClient();
    if (!client) {
        log_error("loadPreferences error: DATABASE CONNECTION ERR", ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database connection error." };
        return;
    }

    try {
        const result = await client.execute(
            `SELECT twofa_email_enabled, twofa_totp_enabled FROM users WHERE id = ?`,
            [userId]
        );

        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0]
            ctx.response.status = 200;
            ctx.response.body = {
                twofa_email_enabled: row.twofa_email_enabled,
                twofa_totp_enabled: row.twofa_totp_enabled,
            };
        }
    } catch (err) {
        log_error(`loadPreferences DB ERR: ${err}`, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database query failed." };
    }
};

export const set_twofa_email_enabled = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const { twofa_email_enabled } = body;

        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized" };
            return;
        }

        let userId: number;
        let email: string;
        try {
            const token = authHeader.slice(7);
            const payload = await verifyJWT(token);
            userId = Number(payload.userId);
            email = String(payload.email);
        } catch {
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        if (
            twofa_email_enabled !== 0 && twofa_email_enabled !== 1
        ) {
            ctx.response.status = 400;
            ctx.response.body = { error: "twofa_email_enabled is required." };
            return;
        }

        // Get the DB after validating
        const client = await getDBClient();
        if (!client) {
            log_error(
                "change twofa_email_enabled error: DATABASE CONNECTION ERR",
                ctx.state.correlationID,
            );
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        await client.execute(
            `UPDATE users SET twofa_email_enabled = ? WHERE id = ?`,
            [
                twofa_email_enabled, userId
            ],
        );

        await sendEmail(
            email,
            "Davidnet Security - 2FA Changed",
            await loadEmailTemplate("email_templates/twofa_changed.html", {
                date: formatDate_PREFERREDTIME((new Date).toISOString(), await verifyJWT(authHeader.slice(7)))
            }),
        );

        ctx.response.status = 204;
    } catch (error) {
        log_error("Change twofa_email_enabled error:", error, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};

export const set_twofa_totp_enabled = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const { twofa_totp_enabled, seed } = body;

        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized" };
            return;
        }

        let userId: number;
        let email: string;
        try {
            const token = authHeader.slice(7);
            const payload = await verifyJWT(token);
            userId = Number(payload.userId);
            email = String(payload.email);
        } catch {
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        if (
            twofa_totp_enabled !== 0 && twofa_totp_enabled !== 1
        ) {
            ctx.response.status = 400;
            ctx.response.body = { error: "twofa_totp_enabled is required." };
            return;
        }

        // Get the DB after validating
        const client = await getDBClient();
        if (!client) {
            log_error(
                "change twofa_totp_enabled error: DATABASE CONNECTION ERR",
                ctx.state.correlationID,
            );
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        if (seed) {
            await client.execute(
                `UPDATE users SET twofa_totp_enabled = ?, twofa_totp_seed = ? WHERE id = ?`,
                [
                    twofa_totp_enabled, seed, userId
                ],
            );
        } else {
        await client.execute(
            `UPDATE users SET twofa_totp_enabled = ? WHERE id = ?`,
                [
                    twofa_totp_enabled, userId
                ],
            );
        }


        await sendEmail(
            email,
            "Davidnet Security - 2FA Changed",
            await loadEmailTemplate("email_templates/twofa_changed.html", {
                date: formatDate_PREFERREDTIME((new Date).toISOString(), await verifyJWT(authHeader.slice(7)))
            }),
        );

        ctx.response.status = 204;
    } catch (error) {
        log_error("Change twofa_email_enabled error:", error, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};
