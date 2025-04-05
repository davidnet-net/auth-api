//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function recovery_status(ctx: any) {
    const body = await ctx.request.body().value as {
        ticket?: string;
    };

    const userResult = await db.query(
        "SELECT recovery_verified, recovery_token FROM users WHERE recovery_ticket = ?",
        [body.ticket],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const recovery_verified = userResult[0].recovery_verified;

    if (recovery_verified == 1) {
        const token = userResult[0].recovery_token;
        ctx.response.body = {
            message: "ok",
            status: recovery_verified,
            token: token,
        };
    } else {
        ctx.response.body = {
            message: "ok",
            status: recovery_verified,
            token: 0,
        };
    }
}
