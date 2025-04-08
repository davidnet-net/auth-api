//? Libraries
import { TOTP } from "https://deno.land/x/totp@1.0.1/mod.ts";
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";

//? Modules
import { getdb } from "../../sql.ts";
import { addaccountlog, generateRandomString } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function verify_totp(ctx: Context) {
    const body = await ctx.request.body().value as {
        token?: string;
        code: string;
    };

    if (!body.token || !body.code) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing fields" };
        return;
    }

    const userResult = await db.query(
        "SELECT id, totp_seed, totp_enabled FROM users WHERE early_login_token = ?",
        [body.token],
    );

    if (userResult.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const totp_seed = userResult[0].totp_seed;
    const totp_enabled = userResult[0].totp_enabled;

    if (totp_enabled == "0") {
        ctx.response.status = 400;
        ctx.response.body = { error: "totp not enabled!" };
        return;
    }

    const key = await TOTP.importKey(totp_seed);

    const isValid = await TOTP.verifyTOTP(key, body.code, {
        interval: 30, // Time interval (default is 30 seconds)
        digits: 6, // Number of digits in the code (default is 6)
        forward: 2, // Tolerance in the future (number of intervals)
        backward: 2, // Tolerance in the past (number of intervals)
    });

    console.log("Is the TOTP code valid?", isValid);

    if (!isValid) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid code" };
        return;
    }

    const session_token = generateRandomString(50);
    const userid = userResult[0].id;
    const ip = ctx.request.headers.get("X-Forwarded-For");
    const useragent = ctx.request.headers.get("user-agent");

    const currentUTCDate = new Date();
    const created_at = currentUTCDate.toISOString().slice(0, 19)
        .replace("T", " ");

    await db.execute(
        `INSERT INTO sessions(userid, ip, token, created_at, useragent) VALUES(?, ?, ?, ?, ?)`,
        [userid, ip, session_token, created_at, useragent],
    );

    addaccountlog(
        db,
        userid,
        "Account login - TOTP",
        "User with ip: " + ip + ". Logged in! \n \n Useragent: " +
            useragent,
    );

    ctx.response.body = {
        message: "ok",
        session_token: session_token,
    };
}
