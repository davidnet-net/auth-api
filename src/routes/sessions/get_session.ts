//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_session( ctx: any ) {
    const body = await ctx.request.body().value as { token?: string };

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    const userResult = await db.query(
        "SELECT id, userid, ip, created_at, useragent FROM sessions WHERE token = ?",
        [body.token],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session" };
        return;
    }

    const { id, userid, ip, created_at, useragent } = userResult[0];

    ctx.response.body = {
        message: "ok",
        id,
        userid,
        ip,
        created_at,
        useragent,
    };
}