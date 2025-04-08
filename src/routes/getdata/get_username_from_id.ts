//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_username_from_id(ctx: any) {
    const body = await ctx.request.body().value as { id?: string };

    if (!body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing userid" };
        return;
    }

    const sessionResult = await db.query(
        "SELECT username FROM users WHERE id = ?",
        [body.id],
    );

    if (sessionResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid userid" };
        return;
    }

    const username = sessionResult[0].username;

    ctx.response.body = { message: "ok", username: username };
}
