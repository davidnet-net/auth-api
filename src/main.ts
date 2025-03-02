//? Libraries
import { Application } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

//? Modules
import { connectdb } from "./sql.ts";
import { generateRandomString, sendEmail } from "./utils.ts";

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
                "SELECT id, password, email_verified, email_token FROM users WHERE username = ?",
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

            const passwordMatch = await compare(body.password, storedPassword);

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
            } else {
                const session_token = generateRandomString(50);
                const userid = userResult[0].id;
                const ip = ctx.request.headers.get("X-Forwarded-For");

                const currentUTCDate = new Date();
                const created_at = currentUTCDate.toISOString().slice(0, 19)
                    .replace("T", " ");

                await db.execute(
                    `INSERT INTO sessions(userid, ip, token, created_at) VALUES(?, ?, ?, ?)`,
                    [userid, ip, session_token, created_at],
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
            "SELECT id, userid, ip, created_at FROM sessions WHERE token = ?",
            [body.token],
        );

        if (userResult.length === 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid session" };
            return;
        }

        const { id, userid, ip, created_at } = userResult[0];

        ctx.response.body = { message: "ok", id, userid, ip, created_at };
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
            "SELECT id, userid, ip, created_at FROM sessions WHERE userid = ?",
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
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
