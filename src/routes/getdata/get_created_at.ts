//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_created_at(ctx: any) {
    const body = await ctx.request.body().value as { token?: string };

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

    const userid = sessionResult[0].userid;
    const userResult = await db.query(
        "SELECT created_at FROM users WHERE id = ?",
        [userid],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "User not found" };
        return;
    }

    const created_at = userResult[0].created_at;

    ctx.response.body = { message: "ok", created_at: created_at };
}
