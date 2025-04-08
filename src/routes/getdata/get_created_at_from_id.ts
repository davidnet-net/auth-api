//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_created_at_from_id(ctx: Context) {
    const body = await ctx.request.body().value as { id?: string };

    if (!body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing userid" };
        return;
    }

    const userResult = await db.query(
        "SELECT created_at FROM users WHERE id = ?",
        [body.id],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "User not found" };
        return;
    }

    const created_at = userResult[0].created_at;

    ctx.response.body = { message: "ok", created_at: created_at };
}
