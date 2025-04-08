//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function disable_totp(ctx: any) {
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

    await db.query(
        "UPDATE users SET totp_enabled = 0 WHERE id = ?",
        [userid],
    );

    addaccountlog(db, userid, "Account 2FA", "TOTP - Disabled!");

    ctx.response.body = { message: "ok" };
}
