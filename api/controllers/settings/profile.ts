import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../../lib/db.ts";
import { log_error } from "../../lib/logger.ts";
import { verifyJWT } from "../../lib/jwt.ts";

export const saveprofile = async (ctx: Context) => {
    // Check authentication
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized" };
        return;
    }

    let userId: number;
    try {
        const token = authHeader.slice(7);
        const payload = await verifyJWT(token);
        userId = Number(payload.userId);
    } catch {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const body = await ctx.request.body({ type: "json" }).value;
    const { display_name, description, email_visible } = body;

    if (typeof display_name !== "string" || typeof description !== "string" || typeof email_visible !== "string" || description.length > 500) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid input" };
        return;
    }

    const client = await getDBClient();
    if (!client) {
        log_error("updateProfileMe error: DATABASE CONNECTION ERR", ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database connection error." };
        return;
    }

    try {
        await client.execute(
            `UPDATE users SET display_name = ?, description = ?, email_visible = ? WHERE id = ?`,
            [display_name, description, email_visible, userId]
        );

        ctx.response.status = 200;
        ctx.response.body = { success: true };
    } catch (err) {
        log_error(`updateProfileMe DB ERR: ${err}`, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database update error." };
    }
};

export default saveprofile;
