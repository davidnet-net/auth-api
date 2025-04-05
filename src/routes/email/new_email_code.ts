//? Modules
import { sendEmail } from "../../email.ts";
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function new_email_code(ctx: any) {
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