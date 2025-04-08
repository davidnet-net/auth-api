//? Libaries
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";
//? Modules
import { generateRandomString } from "../utils.ts";
import { sendEmail } from "../email.ts";
import { getdb } from "../sql.ts";

//? Objects
const db = await getdb();

export async function signup(ctx: Context) {
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
