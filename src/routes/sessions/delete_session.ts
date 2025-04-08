//? Modules
import { getdb } from "../../sql.ts";

//? Objects
const db = await getdb();

export async function delete_session(ctx: any) {
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
