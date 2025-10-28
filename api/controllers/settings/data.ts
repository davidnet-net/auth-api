import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient, DBVersion } from "../../lib/db.ts";
import { log, log_error } from "../../lib/logger.ts";
import { verifyJWT } from "../../lib/jwt.ts";
import { loadEmailTemplate, sendEmail } from "../../lib/mail.ts";
import { randomHex } from "../../lib/random.ts";
import { delete_profile_picture } from "../profile_picture.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
    throw new Error("Invalid env: DA_ISPROD");
}

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

        await delete_profile_picture(userId, true);

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

        // Internal
        // Internal
        if (DA_ISPROD) {
            const jwt_to = Deno.env.get("DA_JWT_SECRET"); //TODO Make an better way of internal auth.
            const kanban = await fetch("https://kanban-api.davidnet.net/internal/user_deletion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, jwt_token: jwt_to })
            });

            if (!kanban.ok) {
                log_error("Signup error: Couldnt connect to kanban api", kanban.statusText);
            }
        } else {
            const jwt_to = Deno.env.get("DA_JWT_SECRET"); //TODO Make an better way of internal auth.
            const kanban = await fetch("http://localhost:1001/internal/user_deletion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, jwt_token: jwt_to })
            });

            if (!kanban.ok) {
                log_error("Signup error: Couldnt connect to kanban api", kanban.statusText);
            }
        }
    } catch (err) {
        log_error(`Delete Account DB ERR: ${err}`, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database update error." };
    }
};

export const requestdata = async (ctx: Context) => {
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
        log_error("Request data error: DATABASE CONNECTION ERR", ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database connection error." };
        return;
    }

    try {
        // Check last request
        const lastReq = await client.query(
            `SELECT created_at FROM compliance_log
             WHERE user_id = ? AND action = 'request_data'
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId]
        );

        if (lastReq.length > 0) {
            const lastTime = new Date(lastReq[0].created_at).getTime();
            const now = Date.now();
            const diffMs = now - lastTime;
            const limitMs = 24 * 60 * 60 * 1000; // 24 hours

            if (diffMs < limitMs) {
                const retryDate = new Date(lastTime + limitMs).toISOString();
                ctx.response.status = 429;
                ctx.response.body = {
                    error: "You can only request your data once every 24 hours.",
                    retry_at: retryDate
                };
                return;
            }
        }

        // Get user info
        const user = await client.query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [userId]);
        if (!user || user.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "User not found" };
            return;
        }

        // Insert compliance log first
        const complog = await client.execute(
            `INSERT INTO compliance_log (action, user_id, email_hash, username_hash) VALUES (?, ?, ?, ?)`,
            [
                "request_data",
                userId,
                await sha256Hash(user[0].email),
                await sha256Hash(user[0].username),
            ]
        );
        const ReferenceID = complog.lastInsertId;

        // Respond immediately
        ctx.response.status = 204;

        // Collect data asynchronously
        (async () => {
            try {
                const dataExport: Record<string, unknown> = {
                    meta: {
                        version: DBVersion,
                        exported_at: new Date().toISOString(),
                        reference_id: ReferenceID,
                        user_id: userId
                    },
                };
                dataExport.user = user[0];

                const [settings, files, audits, recovs, sessions, connsUser, connsFriend, complogs] = await Promise.all([
                    client.query(`SELECT * FROM user_settings WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM files WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM audit_logs WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM recovery_codes WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM sessions WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM connections WHERE user_id = ?`, [userId]),
                    client.query(`SELECT * FROM connections WHERE friend_id = ?`, [userId]),
                    client.query(`SELECT * FROM compliance_log WHERE user_id = ?`, [userId]),
                ]);

                dataExport.user_settings = settings;
                dataExport.files = files;
                dataExport.audit_logs = audits;
                dataExport.recovery_codes = recovs;
                dataExport.sessions = sessions;
                dataExport.connections_as_user = connsUser;
                dataExport.connections_as_friend = connsFriend;
                dataExport.compliance_logs = complogs;

                const token = randomHex();
                const exportDir = "./exports";
                await Deno.mkdir(exportDir, { recursive: true });

                const filePath = `${exportDir}/${token}.json`;
                await Deno.writeTextFile(filePath, JSON.stringify(dataExport, null, 2));

                const downloadUrl = `${DA_ISPROD
                    ? "https://account.davidnet.net"
                    : "http://localhost:5173"}/verify/export/${token}`;

                await sendEmail(
                    user[0].email,
                    "Davidnet Data Export Ready",
                    await loadEmailTemplate("email_templates/data_export.html", {
                        username: user[0].username,
                        referenceID: String(ReferenceID),
                        download_url: downloadUrl,
                    })
                );

                await client.query(
                    `UPDATE compliance_log SET finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [ReferenceID],
                );

                log(ctx.state.correlationID, "Data export generated", "ReferenceID: " + ReferenceID);
            } catch (err) {
                log_error(`Async Request Data DB ERR: ${err}`, ctx.state.correlationID);
            }
        })();

    } catch (err) {
        log_error(`Request Data DB ERR: ${err}`, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};



export const downloadExport = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const { token } = body;

    if (!token || typeof token !== "string" || token.length !== 64) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const filePath = `./exports/${token}.json`;

    try {
        const fileInfo = await Deno.stat(filePath);

        // Check if file is older than 24 hours
        const ageMs = Date.now() - fileInfo.mtime!.getTime();
        const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

        if (ageMs > maxAgeMs) {
            // Delete expired file
            await Deno.remove(filePath);
            ctx.response.status = 400;
            ctx.response.body = { error: "Export expired" };
            return;
        }

        // Serve file
        ctx.response.headers.set(
            "Content-Disposition",
            `attachment; filename="export-${token}.json"`
        );
        ctx.response.headers.set("Content-Type", "application/json");
        ctx.response.body = await Deno.readFile(filePath);

    } catch {
        ctx.response.status = 404;
        ctx.response.body = { error: "Export not found" };
    }
};
