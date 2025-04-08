//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_desc(ctx: Context) {
    const body = await ctx.request.body().value as { id?: string };

    if (!body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing userid" };
        return;
    }

    const sessionResult = await db.query(
        "SELECT description FROM users WHERE id = ?",
        [body.id],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid userid" };
        return;
    }

    const description = sessionResult[0].description;

    ctx.response.body = { message: "ok", description: description };
}
