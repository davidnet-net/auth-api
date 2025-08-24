import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { verifyJWT } from "../lib/jwt.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
    throw new Error("Invalid env: DA_ISPROD");
}

export const logout = async (ctx: Context) => {
    try {
        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized" };
            return;
        }

        let userId: number;
        let jwtID: string;
        try {
            const token = authHeader.slice(7);
            const payload = await verifyJWT(token);
            console.log(payload);
            console.log(payload.jti);
            userId = Number(payload.userId);
            jwtID = String(payload.jti);
        } catch {
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid token" };
            return;
        }

        // Get the DB after validating
        const client = await getDBClient();
        if (!client) {
            log_error(
                "Logout error: DATABASE CONNECTION ERR",
                ctx.state.correlationID,
            );
            ctx.response.status = 500;
            ctx.response.body = { error: "Database connection error." };
            return;
        }

        const session = await client.execute(
            `SELECT id FROM sessions WHERE user_id = ? AND jwt_id = ?`,
            [userId, jwtID],
        );


        if (!session.rows || session.rows.length < 1) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Session NOT found." };
        }

        await client.execute(
            `DELETE FROM sessions WHERE user_id = ? AND jwt_id = ?`,
            [userId, jwtID],
        );

        ctx.cookies.set("refresh_token", "", {
            httpOnly: true,
            secure: DA_ISPROD,
            sameSite: DA_ISPROD ? "none" : "lax",
            domain: DA_ISPROD ? ".davidnet.net" : undefined,
            path: "/",
            maxAge: 0, // Delete the refresh token cookie
        });

        ctx.response.status = 204;
    } catch (error) {
        log_error("Logout error:", error, ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error." };
    }
};

export default logout;