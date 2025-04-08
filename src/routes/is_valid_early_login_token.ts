//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../sql.ts";

//? Objects
const db = await getdb();

export async function is_valid_early_login_token(ctx: Context) {
    const body = await ctx.request.body().value as { token?: string };

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    const userResult = await db.query(
        "SELECT id FROM users WHERE early_login_token = ?",
        [body.token],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    ctx.response.body = {
        message: "ok",
    };
}
