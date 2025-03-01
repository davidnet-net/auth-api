//? Libraries
import { Application } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"; //compare
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
    if (ctx.request.method === "GET" && ctx.request.url.pathname === "/") {
        ctx.response.body = { message: "Access denied!" };
        return;
    }

    if (
        ctx.request.method === "POST" && ctx.request.url.pathname === "/signup"
    ) {
        try {
            // JSON body uitlezen en casten naar het juiste type
            const body = await ctx.request.body().value as {
                username?: string;
                email?: string;
                password?: string;
            };

            // Check of de velden correct zijn
            if (!body.username || !body.email || !body.password) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Missing fields" };
                return;
            }

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

            if (body.username.length > 50) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Too big username" };
                return;
            }

            if (body.email.length > 255) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Too big email" };
                return;
            }

            // Check if values already exist
            // Check if the username already exists
            const existingUsername = await db.query(
                "SELECT id FROM users WHERE username = ?",
                [body.username],
            );

            // Check if the email already exists
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

            // Created at time genereren in UTC
            const currentUTCDate = new Date();
            const year = currentUTCDate.getUTCFullYear();
            const month = String(currentUTCDate.getUTCMonth() + 1).padStart(
                2,
                "0",
            );
            const day = String(currentUTCDate.getUTCDate()).padStart(2, "0");
            const hours = String(currentUTCDate.getUTCHours()).padStart(2, "0");
            const minutes = String(currentUTCDate.getUTCMinutes()).padStart(
                2,
                "0",
            );
            const seconds = String(currentUTCDate.getUTCSeconds()).padStart(
                2,
                "0",
            );
            const created_at =
                `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

            // Other stuff
            const delete_token = generateRandomString(50);
            const email_token = generateRandomString(50);
            const password = await hash(body.password);

            // SQL Interaction
            try {
                await db.execute(
                    `
                    INSERT INTO users(username, password, email, created_at, delete_token, email_token) 
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
            } catch (error) {
                console.error(error);
                ctx.response.status = 500;
                ctx.response.body = { error: "db error" };
                return;
            }

            // Send mail
            const MailHtml = await Deno.readTextFile("mails/signupmail.html");

            // Replace tokens in the HTML template
            const Mailcontent = MailHtml
                .replace("{email_token}", email_token)
                .replace("{delete_token}", delete_token);

            // Send email data
            const emailData = {
                to: body.email,
                subject: "Davidnet account created!",
                message: Mailcontent,
                isHtml: true,
            };

            // Send the email
            const response = await sendEmail(emailData);
            if (!response.success) {
                console.error("Failed to send email:", response.message);
            }

            ctx.response.body = { message: "User created", email_token: email_token,};
        } catch (error) {
            console.error(error);
            ctx.response.status = 500;
            ctx.response.body = { error: "Unknown error" };
        }
    }

    if (
        ctx.request.method === "POST" && ctx.request.url.pathname === "/login"
    ) {
        try {
            // JSON body uitlezen en casten naar het juiste type
            const body = await ctx.request.body().value as {
                username?: string;
                password?: string;
            };

            // Check of de velden correct zijn
            if (!body.username || !body.password) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Missing fields" };
                return;
            }

            if (!/^[a-zA-Z0-9_]+$/.test(body.username)) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid username" };
                return;
            }

            if (body.username.length > 50) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid username" };
                return;
            }

            // Check if the username exists
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

            // Compare the provided password with the stored hash
            const passwordMatch = await compare(body.password, storedPassword);

            if (!passwordMatch) {
                ctx.response.status = 400;
                ctx.response.body = { error: "Invalid password" };
                return;
            }

            if (email_verified == 0) {
                ctx.response.body = {
                    message: "verify_email",
                    email_token: email_token,
                };
            } else {
                ctx.response.body = { message: "todo: give session!" }; //TODO
            }
        } catch (error) {
            console.error(error);
            ctx.response.status = 500;
            ctx.response.body = { error: "Unknown error" };
        }
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/new_email_code"
    ) {
        const body = await ctx.request.body().value as {
            token?: string;
        };

        // Check of de velden correct zijn
        if (!body.token) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing fields" };
            return;
        }

        // Check if the username exists
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

        if (email_verified == 1) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Already verified" };
            return;
        } else {
            // Send mail
            const MailHtml = await Deno.readTextFile("mails/emailverification_resend.html");

            // Replace tokens in the HTML template
            const Mailcontent = MailHtml
                .replace("{email_token}", body.token)
                .replace("{delete_token}", delete_token);

            // Send email data
            const emailData = {
                to: email,
                subject: "Davidnet email verification!",
                message: Mailcontent,
                isHtml: true,
            };

            // Send the email
            const response = await sendEmail(emailData);
            if (!response.success) {
                console.error("Failed to send email:", response.message);
            }

            ctx.response.body = { message: "sended!" };
        }
    }

    if (ctx.request.method === "POST" && ctx.request.url.pathname === "/email_status") {
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

    if (ctx.request.method === "POST" && ctx.request.url.pathname === "/verify_email") {
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
    
        ctx.response.body = { message: "ok"};
    }    

});

// Start de server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
