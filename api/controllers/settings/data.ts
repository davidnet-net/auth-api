import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../../lib/db.ts";
import { log, log_error } from "../../lib/logger.ts";
import { verifyJWT } from "../../lib/jwt.ts";
import { loadEmailTemplate, sendEmail } from "../../lib/mail.ts";

/**
 * Hash a string using SHA-256 and return a hex string
 * @param input The string to hash
 * @returns 64-character hex string
 */
export async function sha256Hash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, "0")).join("");
    return hashHex;
}

export const deleteaccount = async (ctx: Context) => {
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
        log_error("Delete account error: DATABASE CONNECTION ERR", ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database connection error." };
        return;
    }

    try {
        const user = await client.query(
            `SELECT *
            FROM users
            WHERE id = ?
            LIMIT 1`,
            [userId]
        );

        const complog = await client.execute(
            `INSERT INTO compliance_log (action, user_id, email_hash, username_hash) VALUES (?, ?, ?, ?)`,
            [
                "delete_account",
                userId,
                await sha256Hash(user[0].email),
                await sha256Hash(user[0].username),
            ],
        );
        const ReferenceID = complog.lastInsertId

        await sendEmail(
            user[0].email,
            "Davidnet Account Deletion",
            await loadEmailTemplate("email_templates/account_deletion.html", {
                username: user[0].username,
                user_id: String(userId),
                email_hash: await sha256Hash(user[0].email),
                username_hash: await sha256Hash(user[0].username),
                referenceID: String(ReferenceID),
            }),
        );

        //TODO Add an queue???
        await client.execute(
            `DELETE FROM users WHERE id = ?`,
            [
                userId,
            ],
        );

        //? Finish
        await client.query(
            `UPDATE compliance_log SET finished_at = CURRENT_TIMESTAMP WHERE user_id = ? LIMIT 1`,
            [userId],
        );

        log(ctx.state.correlationID, "Account deleted", "ReferenceID: " + ReferenceID)

        ctx.response.status = 200;
        ctx.response.body = { success: true };
    } catch (err) {
        log_error(`Delete Account DB ERR: ${err}`, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database update error." };
    }
};

export default deleteaccount;
