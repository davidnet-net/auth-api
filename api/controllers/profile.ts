import { RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { isConnection } from "../lib/connections.ts";

export const profile = async (ctx: RouterContext<"/profile/:id">) => {
    const profileId = parseInt(ctx.params.id as string, 10);

    const client = await getDBClient();
    if (!client) {
        log_error("profile error: DATABASE CONNECTION ERR", ctx.state.correlationID);
        ctx.response.status = 500;
        ctx.response.body = { error: "Database connection error." };
        return;
    }

    let requesterId: number | null = null;
    const authHeader = ctx.request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        try {
            const payload = await verifyJWT(token);
            requesterId = Number(payload.userId);
        } catch {
            // Invalid token --> treat as no login so public
        }
    }

    const profiles = await client.query(
        `SELECT id, username, email, email_visible, display_name, avatar_url, description, admin, internal, created_at, timezone_visible
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [profileId]
    );

    if (profiles.length < 1) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Profile doesn't exist!" };
        return;
    }

    const users_settings = await client.query(
        `SELECT id, timezone
         FROM user_settings
         WHERE user_id = ?
         LIMIT 1`,
        [profileId]
    );

    const profile = { ...profiles[0] };
    const user_settings = { ...users_settings[0] };

    const isSelf = requesterId === profileId;
    let isFriend = false;
    let isPending = false;

    if (!isSelf && requesterId) {
        isFriend = await isConnection(client, requesterId, profileId);

        // Check pending connection
        const pending = await client.query(
            `SELECT 1 FROM connections
             WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
               AND status = 'pending'
             LIMIT 1`,
            [requesterId, profileId, profileId, requesterId]
        );

        isPending = pending.length > 0;
    }

    function filterField<T>(value: T, visibility: string, isFriend: boolean, isSelf: boolean): T | null {
        if (isSelf) return value;
        if (visibility === "public") return value;
        if (visibility === "connections" && isFriend) return value;
        return null;
    }

    profile.email = filterField(profile.email, profile.email_visible, isFriend, isSelf);
    user_settings.timezone = filterField(user_settings.timezone, profile.timezone_visible, isFriend, isSelf);

    ctx.response.status = 200;
    ctx.response.body = { profile: { ...profile, ...user_settings }, isFriend, isSelf, isPending };
};

export default profile;
