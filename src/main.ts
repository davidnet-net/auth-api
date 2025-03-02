//? Libraries
import { Application } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { TOTP } from "https://deno.land/x/totp@1.0.1/mod.ts";

//? Modules
import { connectdb } from "./sql.ts";
import { generateRandomString, sendEmail, getCryptoKey } from "./utils.ts";

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
    if (ctx.request.method === "POST" && ctx.request.url.pathname === "/login") {
        try {
            const body = await ctx.request.body().value as {
                username?: string;
                password?: string;
                totp_token?: string; // Optional TOTP token for validation
            };
    
            // Check if username and password are provided
            if (!body.username || !body.password) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Missing fields" };
                return;
            }
    
            // Query the database for the user
            const userResult = await db.query(
                "SELECT id, password, email_verified, email_token, totp_enabled, totp_seed FROM users WHERE username = ?",
                [body.username],
            );
    
            // Check if the user exists
            if (userResult.length === 0) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid username" };
                return;
            }
    
            const storedPassword = userResult[0].password;
            const email_verified = userResult[0].email_verified;
            const email_token = userResult[0].email_token;
            const totp_enabled = userResult[0].totp_enabled;
            const totp_seed = userResult[0].totp_seed;
    
            // Check if the password matches
            const passwordMatch = await compare(body.password, storedPassword);
            if (!passwordMatch) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid password" };
                return;
            }
    
            let totpvalid = true;
            // If TOTP is enabled and a TOTP token is provided, validate it
            if (totp_enabled === "1") {
                if (!body.totp_token) {
                    ctx.response.status = 400;
                    ctx.response.body = { error: "TOTP token is required" };
                    return;
                }
    
                const key = await getCryptoKey(totp_seed); // Convert the TOTP seed to a CryptoKey
                totpvalid = await TOTP.verifyTOTP(key, body.totp_token, {
                    interval: 30,  // Time interval (default is 30 seconds)
                    digits: 6,     // Number of digits in the code (default is 6)
                    forward: 2,    // Tolerance in the future (number of intervals)
                    backward: 2    // Tolerance in the past (number of intervals)
                });
            }
    
            // Email verification required
            if (email_verified === 0) {
                ctx.response.body = {
                    message: "verify_email",
                    email_token: email_token,
                };
            } 
            // If TOTP is required and invalid
            else if (totp_enabled === "1" && !totpvalid) {
                ctx.response.body = {
                    message: "give_totp",
                    session_token: "0",
                };
            } 
            // Successful login, create session token
            else {
                const session_token = generateRandomString(50);
                const userid = userResult[0].id;
                const ip = ctx.request.headers.get("X-Forwarded-For");
                const useragent = ctx.request.headers.get("user-agent");
    
                const currentUTCDate = new Date();
                const created_at = currentUTCDate.toISOString().slice(0, 19)
                    .replace("T", " ");
    
                // Insert the session into the database
                await db.execute(
                    `INSERT INTO sessions(userid, ip, token, created_at, useragent) VALUES(?, ?, ?, ?, ?)`,
                    [userid, ip, session_token, created_at, useragent],
                );
    
                // Return the session token
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
            "SELECT recovery_token, recovery_verified FROM users WHERE recovery_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        const email_verified = userResult[0].recovery_verified;
        if (email_verified == 1) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Already verified" };
            return;
        }

        // Update email_verified to 1
        await db.query(
            "UPDATE users SET recovery_verified = 1 WHERE recovery_token = ?",
            [body.token],
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
            "SELECT email FROM users WHERE recovery_token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid" };
            return;
        }

        const email = userResult[0].email;
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
    
            // Daarna de gebruiker verwijderen
            const deleteResult = await db.query(
                "DELETE FROM users WHERE delete_token = ?",
                [body.token],
            );
    
            if (deleteResult.affectedRows === 0) {
                throw new Error("Failed to delete user");
            }
    
            // Mail pas versturen als alles succesvol is
            const MailHtml = await Deno.readTextFile("mails/account_deleted.html");
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
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
