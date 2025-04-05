//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_account_logs(ctx: any) {
    const body = await ctx.request.body().value as {
        token?: string;
    };

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    // Haal de gebruiker op die hoort bij het huidige token
    const userSession = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );

    if (userSession.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid session token" };
        return;
    }

    const userId = userSession[0].userid;

    const logsselect = await db.query(
        "SELECT id, userid, title, message, date FROM accountlogs WHERE userid = ?",
        [userId],
    );

    if (logsselect.length === 0) {
        ctx.response.status = 200;
        ctx.response.body = { message: "ok", logs: [] };
        return;
    }

    ctx.response.status = 200;
    ctx.response.body = { message: "ok", logs: logsselect };
}