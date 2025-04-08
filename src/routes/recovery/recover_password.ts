//? Libaries
import { hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

//? Modules
import { sendEmail } from "../../email.ts";
import { getdb } from "../../sql.ts";
import { addaccountlog } from "../../utils.ts";

//? Objects
const db = await getdb();

export async function recover_password(ctx: any) {
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
    const userid = userResult[0].id;
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
