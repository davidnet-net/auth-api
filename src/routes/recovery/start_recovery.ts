//? Modules
import { sendEmail } from "../../email.ts";
import { getdb } from "../../sql.ts";
import { generateRandomString } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function start_recovery(ctx: any) {
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
