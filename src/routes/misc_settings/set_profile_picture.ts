//? Libaries
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function set_profile_picture(ctx: Context) {
    const body = await ctx.request.body().value as {
        token?: string;
        url?: string;
    };

    if (!body.token || !body.url) {
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
        "UPDATE users SET profile_picture = ? WHERE id = ?",
        [body.url, userid],
    );

    addaccountlog(
        db,
        userid,
        "Profile",
        "Profile picture updated! \n \n to url: " + body.url,
    );

    ctx.response.body = {
        message: "ok",
    };
}
