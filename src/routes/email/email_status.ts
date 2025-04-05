//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function email_status(ctx: any) {
    const body = await ctx.request.body().value as {
        token?: string; //! email_token
    };

    const userResult = await db.query(
        "SELECT id, email_verified, email FROM users WHERE email_token = ?",
        [body.token],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const email_verified = userResult[0].email_verified;

    ctx.response.body = { message: "ok", status: email_verified };
}
