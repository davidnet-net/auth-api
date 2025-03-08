//? Libraries
import { Application } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { TOTP } from "https://deno.land/x/totp@1.0.1/mod.ts";

//? Modules
import { connectdb } from "./sql.ts";
import { addaccountlog, generateRandomString } from "./utils.ts";
import { sendEmail } from "./email.ts";

//? Objects
const app = new Application();
const environment = config();
const port = Number(environment.API_PORT);
const db = await connectdb(environment);

//? CORS
app.use(oakCors({
    origin: "https://account.davidnet.net", // Only allow this origin
    methods: ["POST"], // Allow only POST requests
    allowedHeaders: ["Content-Type"], // Allow the Content-Type header
    credentials: true, // Allow credentials (cookies, etc.)
}));

//? Routes
app.use(async (ctx) => {
    // Root
    if (ctx.request.method === "GET" && ctx.request.url.pathname === "/") {
        ctx.response.body = { message: "Access denied!" };
        return;
    }

    // Signup
    if (
        ctx.request.method === "POST" && ctx.request.url.pathname === "/signup"
    ) {
        try {
            const body = await ctx.request.body().value as {
                username?: string;
                email?: string;
                password?: string;
            };

            if (!body.username || !body.email || !body.password) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Missing fields" };
                return;
            }

            // Validate username and email
            if (!/^[a-zA-Z0-9_]+$/.test(body.username)) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid username" };
                return;
            }

            if (
                !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
                    body.email,
                )
            ) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid email" };
                return;
            }

            if (body.username.length > 50 || body.email.length > 255) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Too big username or email" };
                return;
            }

            // Check if username or email exists
            const existingUsername = await db.query(
                "SELECT id FROM users WHERE username = ?",
                [body.username],
            );
            const existingEmail = await db.query(
                "SELECT id FROM users WHERE email = ?",
                [body.email],
            );

            if (existingUsername.length > 0) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Username taken" };
                return;
            }

            if (existingEmail.length > 0) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Email taken" };
                return;
            }

            const currentUTCDate = new Date();
            const created_at = currentUTCDate.toISOString().slice(0, 19)
                .replace("T", " ");

            const delete_token = generateRandomString(50);
            const email_token = generateRandomString(50);
            const password = await hash(body.password);

            // Insert user into database
            await db.execute(
                `INSERT INTO users(username, password, email, created_at, delete_token, email_token) 
                VALUES(?, ?, ?, ?, ?, ?)`,
                [
                    body.username,
                    password,
                    body.email,
                    created_at,
                    delete_token,
                    email_token,
                ],
            );

            // Send verification email
            const MailHtml = await Deno.readTextFile("mails/signupmail.html");
            const Mailcontent = MailHtml.replace("{email_token}", email_token)
                .replace("{delete_token}", delete_token);
            const emailData = {
                to: body.email,
                subject: "Davidnet account created!",
                message: Mailcontent,
                isHtml: true,
            };
            const response = await sendEmail(emailData);

            if (!response.success) {
                console.error("Failed to send email:", response.message);
            }

            ctx.response.body = {
                message: "User created",
                email_token: email_token,
            };
        } catch (error) {
            console.error(error);
            ctx.response.status = 500;
            ctx.response.body = { error: "Unknown error" };
        }
    }

    // Login
    if (
        ctx.request.method === "POST" && ctx.request.url.pathname === "/login"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/email_status"
    ) {
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

        ctx.response.body = { message: "ok", status: email_verified };
    }

    // New email code
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/new_email_code"
    ) {
        const body = await ctx.request.body().value as { token?: string };

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing fields" };
            return;
        }

        const userResult = await db.query(
            "SELECT email_verified, email, delete_token FROM users WHERE email_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        const email_verified = userResult[0].email_verified;
        const delete_token = userResult[0].delete_token;
        const email = userResult[0].email;

        if (email_verified === 1) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Already verified" };
            return;
        }

        const MailHtml = await Deno.readTextFile(
            "mails/emailverification_resend.html",
        );
        const Mailcontent = MailHtml.replace("{email_token}", body.token)
            .replace("{delete_token}", delete_token);
        const emailData = {
            to: email,
            subject: "Davidnet email verification!",
            message: Mailcontent,
            isHtml: true,
        };
        const response = await sendEmail(emailData);

        if (!response.success) {
            console.error("Failed to send email:", response.message);
        }

        ctx.response.body = { message: "sended!" };
    }

    // Verify email
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_email"
    ) {
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

        // Update email_verified to 1
        await db.query(
            "UPDATE users SET email_verified = 1 WHERE email_token = ?",
            [body.token],
        );

        ctx.response.body = { message: "ok" };
    }

    // Get session
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_session"
    ) {
        const body = await ctx.request.body().value as { token?: string };

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing token" };
            return;
        }

        const userResult = await db.query(
            "SELECT id, userid, ip, created_at, useragent FROM sessions WHERE token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid session" };
            return;
        }

        const { id, userid, ip, created_at, useragent } = userResult[0];

        ctx.response.body = {
            message: "ok",
            id,
            userid,
            ip,
            created_at,
            useragent,
        };
    }

    // Get email by token
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_email"
    ) {
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
        const userResult = await db.query(
            "SELECT email FROM users WHERE id = ?",
            [userid],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "User not found" };
            return;
        }

        const email = userResult[0].email;

        ctx.response.body = { message: "ok", email: email };
    }

    // Get sessions by user ID
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_sessions"
    ) {
        const body = await ctx.request.body().value as {
            token?: string;
            userid?: string;
        };

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

        const sessionsResult = await db.query(
            "SELECT id, userid, ip, created_at, useragent FROM sessions WHERE userid = ?",
            [body.userid],
        );

        if (sessionsResult.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "No sessions found for this user" };
            return;
        }

        ctx.response.body = { message: "ok", sessions: sessionsResult };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_created_at"
    ) {
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
        const userResult = await db.query(
            "SELECT created_at FROM users WHERE id = ?",
            [userid],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "User not found" };
            return;
        }

        const created_at = userResult[0].created_at;

        ctx.response.body = { message: "ok", created_at: created_at };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/delete_session"
    ) {
        const body = await ctx.request.body().value as {
            token?: string;
            session_id?: string;
        };

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing token" };
            return;
        }

        if (!body.session_id) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing session_id" };
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

        // Controleer of de sessie die verwijderd moet worden van dezelfde gebruiker is
        const sessionCheck = await db.query(
            "SELECT id FROM sessions WHERE id = ? AND userid = ?",
            [body.session_id, userId],
        );

        if (sessionCheck.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "unauthorized" };
            return;
        }

        // Verwijder de sessie
        await db.execute("DELETE FROM sessions WHERE id = ?", [
            body.session_id,
        ]);

        ctx.response.status = 200;
        ctx.response.body = { message: "ok" };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_username"
    ) {
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
        const userResult = await db.query(
            "SELECT username FROM users WHERE id = ?",
            [userid],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "User not found" };
            return;
        }

        const username = userResult[0].username;

        ctx.response.body = { message: "ok", username: username };
    }

    // New email code
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/start_recovery"
    ) {
        const body = await ctx.request.body().value as { email?: string };

        if (!body.email) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid email" };
            return;
        }

        const userResult = await db.query(
            "SELECT email_verified FROM users WHERE email = ?",
            [body.email],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid email" };
            return;
        }

        const email_verified = userResult[0].email_verified;

        if (email_verified === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Not verified" };
            return;
        }

        const recovery_token = generateRandomString(50);
        const recovery_ticket = generateRandomString(50);
        const recovery_verified = 0;

        // Update recovery_verified, recovery_token, and recovery_ticket in one query or separately
        await db.query(
            "UPDATE users SET recovery_verified = ?, recovery_token = ?, recovery_ticket = ? WHERE email = ?",
            [recovery_verified, recovery_token, recovery_ticket, body.email],
        );

        const MailHtml = await Deno.readTextFile(
            "mails/verify_recovery.html",
        );
        const Mailcontent = MailHtml.replace(
            "{recovery_token}",
            recovery_token,
        );
        const emailData = {
            to: body.email,
            subject: "Davidnet recovery verification!",
            message: Mailcontent,
            isHtml: true,
        };
        const response = await sendEmail(emailData);

        if (!response.success) {
            console.error("Failed to send email:", response.message);
        }

        ctx.response.body = {
            message: "Email sent!",
            recovery_ticket: recovery_ticket,
        };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_recovery"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/recovery_status"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/recover_password"
    ) {
        const body = await ctx.request.body().value as {
            password?: string;
            token?: string;
        };

        if (!body.password) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid password" };
            return;
        }

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid" };
            return;
        }

        const userResult = await db.query(
            "SELECT id, email FROM users WHERE recovery_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid" };
            return;
        }

        const email = userResult[0].email;
        const userid = userResult[0].userid;
        const password = await hash(body.password);

        await db.query(
            "UPDATE users SET password = ?, recovery_token = ?, recovery_ticket = ?, recovery_verified = ? WHERE recovery_token = ?",
            [password, 0, 0, 0, body.token],
        );

        const MailHtml = await Deno.readTextFile(
            "mails/password_changed.html",
        );

        const emailData = {
            to: email,
            subject: "Davidnet account security!",
            message: MailHtml,
            isHtml: true,
        };
        const response = await sendEmail(emailData);

        if (!response.success) {
            console.error("Failed to send email:", response.message);
        }

        addaccountlog(
            db,
            userid,
            "Account Recovery",
            "Account password reset!",
        );

        ctx.response.body = { message: "Password reset" };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_delete_token"
    ) {
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
        const userResult = await db.query(
            "SELECT delete_token FROM users WHERE id = ?",
            [userid],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "User not found" };
            return;
        }

        const delete_token = userResult[0].delete_token;

        ctx.response.body = { message: "ok", delete_token: delete_token };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/delete_account"
    ) {
        const body = await ctx.request.body().value as { token?: string };

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid" };
            return;
        }

        const userResult = await db.query(
            "SELECT email, id FROM users WHERE delete_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid" };
            return;
        }

        const { email, id } = userResult[0];

        try {
            // Verwijder sessies eerst
            await db.query("DELETE FROM sessions WHERE userid = ?", [id]);
            await db.query("DELETE FROM accountlogs WHERE userid = ?", [id]);

            //! Delete user content

            // ✅ Haal alle content op die bij de gebruiker hoort
            const contentResult = await db.query(
                "SELECT id, path FROM usercontent WHERE userid = ?",
                [id],
            );

            if (contentResult.length === 0) {
                ctx.response.body = { message: "No content to delete." };
                return;
            }

            // ✅ Verwijder elk bestand van de schijf
            let deletedFiles = 0;
            for (const content of contentResult) {
                try {
                    await Deno.remove(content.path);
                    deletedFiles++;
                    // deno-lint-ignore no-explicit-any
                } catch (_error: any) {
                    console.warn(`Failed to delete file: ${content.path}`);
                }
            }

            // ✅ Verwijder alle database records van deze gebruiker
            await db.execute("DELETE FROM usercontent WHERE userid = ?", [
                id,
            ]);

            // Daarna de gebruiker verwijderen
            const deleteResult = await db.query(
                "DELETE FROM users WHERE delete_token = ?",
                [body.token],
            );

            if (deleteResult.affectedRows === 0) {
                throw new Error("Failed to delete user");
            }

            // Mail pas versturen als alles succesvol is
            const MailHtml = await Deno.readTextFile(
                "mails/account_deleted.html",
            );
            const emailData = {
                to: email,
                subject: "Davidnet account deleted!",
                message: MailHtml,
                isHtml: true,
            };

            const response = await sendEmail(emailData);

            if (!response.success) {
                console.error("Failed to send email:", response.message);
            }

            ctx.response.body = { message: "Account deleted" };
        } catch (error) {
            console.error("Error deleting account:", error);
            ctx.response.status = 500;
            ctx.response.body = { error: "Internal server error" };
        }
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/is_valid_early_login_token"
    ) {
        const body = await ctx.request.body().value as { token?: string };

        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing token" };
            return;
        }

        const userResult = await db.query(
            "SELECT id FROM users WHERE early_login_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        ctx.response.body = {
            message: "ok",
        };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_totp"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_2fa_information"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/disable_totp"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/set_up_totp"
    ) {
        const body = await ctx.request.body().value as {
            token?: string;
            secret?: string;
        };

        if (!body.token || !body.secret) {
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
            "UPDATE users SET totp_seed = ?, totp_enabled = 1 WHERE id = ?",
            [body.secret, userid],
        );

        addaccountlog(db, userid, "Account 2FA", "TOTP - Enabled!");

        ctx.response.body = {
            message: "ok",
        };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_account_logs"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_profile_picture"
    ) {
        const body = await ctx.request.body().value as { id?: string };

        if (!body.id) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing userid" };
            return;
        }

        const sessionResult = await db.query(
            "SELECT profile_picture FROM users WHERE id = ?",
            [body.id],
        );

        if (sessionResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid userid" };
            return;
        }

        const profile_picture = sessionResult[0].profile_picture;

        ctx.response.body = { message: "ok", profile_picture: profile_picture };
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/set_profile_picture"
    ) {
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

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_id"
    ) {
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

        ctx.response.body = { message: "ok", id: userid };
    }
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
