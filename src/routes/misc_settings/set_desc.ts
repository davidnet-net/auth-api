//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function set_desc(ctx: Context) {
    const body = await ctx.request.body().value as {
        token?: string;
        description?: string;
    };

    if (!body.token || !body.description) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing fields" };
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

    await db.query(
        "UPDATE users SET description = ? WHERE id = ?",
        [body.description, userid],
    );

    addaccountlog(
        db,
        userid,
        "Profile",
        "Profile description updated!",
    );

    ctx.response.body = {
        message: "ok",
    };
}
