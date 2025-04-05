//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function verify_recovery(ctx: any) {
    const body = await ctx.request.body().value as {
        token?: string;
    };

    const userResult = await db.query(
        "SELECT id, recovery_token, recovery_verified FROM users WHERE recovery_token = ?",
        [body.token],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const userid = userResult[0].userid;
    const email_verified = userResult[0].recovery_verified;
    if (email_verified == 1) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Already verified" };
        return;
    }

    await db.query(
        "UPDATE users SET recovery_verified = 1 WHERE recovery_token = ?",
        [body.token],
    );

    addaccountlog(
        db,
        userid,
        "Account Recovery",
        "Account recovery verified!",
    );

    ctx.response.body = { message: "ok" };
}