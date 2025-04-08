//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_delete_token(ctx: Context) {
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
        "SELECT delete_token FROM users WHERE id = ?",
        [userid],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "User not found" };
        return;
    }

    const delete_token = userResult[0].delete_token;

    ctx.response.body = { message: "ok", delete_token: delete_token };
}
