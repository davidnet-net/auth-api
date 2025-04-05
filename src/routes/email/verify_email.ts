//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function verify_email(ctx: any) {
    const body = await ctx.request.body().value as {
        token?: string;
    };
    
    const userResult = await db.query(
        "SELECT email_verified FROM users WHERE email_token = ?",
        [body.token],
    );
    
    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }
    
    const email_verified = userResult[0].email_verified;
    if (email_verified == 1) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Already verified" };
        return;
    }
    
    const userid = userResult[0].id;
    const email = userResult[0].email;

    addaccountlog(
        db,
        userid,
        "Email verification",
        "Email " + email + " verified!"
    );

    await db.query(
        "UPDATE users SET email_verified = 1 WHERE email_token = ?",
        [body.token],
    );
    
    ctx.response.body = { message: "ok" };
}