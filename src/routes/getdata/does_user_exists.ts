//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function does_user_exists(ctx: any) {
    const body = await ctx.request.body().value as { id?: string };

    if (!body.id) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing userid" };
        return;
    }

    const sessionResult = await db.query(
        "SELECT id FROM users WHERE id = ?",
        [body.id],
    );

    if (sessionResult.length === 0) {
        ctx.response.body = { message: "ok", exists: false };
    }

    ctx.response.body = { message: "ok", exists: true };
}