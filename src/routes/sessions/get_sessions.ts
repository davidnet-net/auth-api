//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_sessions(ctx: any) {
    const body = await ctx.request.body().value as {
        token?: string;
        userid?: string;
    };

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }

    const sessionsResult = await db.query(
        "SELECT id, userid, ip, created_at, useragent FROM sessions WHERE userid = ?",
        [body.userid],
    );

    if (sessionsResult.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "No sessions found for this user" };
        return;
    }

    ctx.response.body = { message: "ok", sessions: sessionsResult };
}
