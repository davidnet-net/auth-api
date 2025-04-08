//? Libaries
import { compare } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

//? Modules
import { addaccountlog, generateRandomString } from "../utils.ts";
import { getdb } from "../sql.ts";

//? Objects
const db = await getdb();

export async function login(ctx: any) {
    try {
        const body = await ctx.request.body().value as {
            username?: string;
            password?: string;
        };

        if (!body.username || !body.password) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing fields" };
            return;
        }

        const userResult = await db.query(
            "SELECT id, password, email_verified, email_token, totp_enabled FROM users WHERE username = ?",
            [body.username],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid username" };
            return;
        }

        const storedPassword = userResult[0].password;
        const email_verified = userResult[0].email_verified;
        const email_token = userResult[0].email_token;
        const totp_enabled = userResult[0].totp_enabled;

        const passwordMatch = await compare(body.password, storedPassword);
        const early_login_token = generateRandomString(50);

        if (!passwordMatch) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid password" };
            return;
        }

        if (email_verified === 0) {
            ctx.response.body = {
                message: "verify_email",
                email_token: email_token,
            };
        } else if (totp_enabled === 1) { // if (totp_enabled === 1 || somethingelse === 1 )
            await db.query(
                "UPDATE users SET early_login_token = ? WHERE username = ?",
                [early_login_token, body.username],
            );
            ctx.response.body = {
                message: "2fa",
                early_login_token: early_login_token,
            };
        } else {
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
                "Account login",
                "User with ip: " + ip + ". Logged in! \n \n Useragent: " +
                    useragent,
            );

            ctx.response.body = {
                message: "ok",
                session_token: session_token,
            };
        }
    } catch (error) {
        console.error(error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Unknown error" };
    }
}
