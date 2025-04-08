//? Modules
import { sendEmail } from "../../email.ts";
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function delete_account(ctx: any) {
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
        await db.execute("START TRANSACTION");

        // Verwijder sessies en logs
        await db.query("DELETE FROM sessions WHERE userid = ?", [id]);
        await db.query("DELETE FROM accountlogs WHERE userid = ?", [id]);

        // Haal usercontent op
        const contentResult = await db.query(
            "SELECT path FROM usercontent WHERE userid = ?",
            [id],
        );

        // Verwijder bestanden van schijf
        let deletedFiles = 0;
        for (const content of contentResult) {
            try {
                await Deno.remove(content.path);
                deletedFiles++;
            } catch (_error) {
                console.warn(`Failed to delete file: ${content.path}`);
            }
        }

        // Verwijder usercontent records
        await db.query("DELETE FROM usercontent WHERE userid = ?", [id]);

        // Verwijder gebruiker
        const deleteResult = await db.query(
            "DELETE FROM users WHERE delete_token = ?",
            [body.token],
        );

        if (deleteResult.affectedRows === 0) {
            throw new Error("Failed to delete user");
        }

        await db.execute("COMMIT");

        // Verstuur de mail pas als alles succesvol is
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
        await db.execute("ROLLBACK");
        console.error("Error deleting account:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
}
