//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function get_2fa_information(ctx: any) {
    const body = await ctx.request.body().value as { token?: string };
    //* token can be an early_token or an session_token

    if (!body.token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing token" };
        return;
    }

    const sessionResult = await db.query(
        "SELECT userid FROM sessions WHERE token = ?",
        [body.token],
    );
    const earlyResult = await db.query(
        "SELECT id FROM users WHERE early_login_token = ?",
        [body.token],
    );

    let session_token = true;
    let early_token = true;
    if (sessionResult.length === 0) {
        session_token = false;
    }
    if (earlyResult.length === 0) {
        early_token = false;
    }
    if (!session_token && !early_token) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    let userid = 0;
    if (session_token) {
        userid = sessionResult[0].userid;
    }
    if (early_token) {
        userid = earlyResult[0].id;
    }

    const userResult = await db.query(
        "SELECT totp_enabled FROM users WHERE id = ?",
        [userid],
    );

    let totp = false;
    if (userResult[0].totp_enabled == "1") {
        totp = true;
    }

    ctx.response.body = { message: "ok", totp: totp };
}