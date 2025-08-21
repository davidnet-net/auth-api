import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { verifyJWT } from "../lib/jwt.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
  throw new Error("Invalid env: DA_ISPROD");
}

// --- Helper ---
async function getUserIdFromJWT(ctx: Context): Promise<number | null> {
  const authHeader = ctx.request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = await verifyJWT(token);
    return Number(payload.userId);
  } catch {
    return null;
  }
}

// --- Send connection request ---
export const sendConnectionRequest = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const { id: targetId } = await ctx.request.body({ type: "json" }).value;
  if (typeof targetId !== "number" || targetId === userId) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid target ID" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    // Does target user exist?
    const [user] = await client.query("SELECT id FROM users WHERE id = ? LIMIT 1", [targetId]);
    if (!user) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Target user not found" };
      return;
    }

    // Check if a connection already exists
    const existing = await client.query(
      `SELECT * FROM connections 
       WHERE (user_id = ? AND friend_id = ?) 
          OR (user_id = ? AND friend_id = ?) 
       LIMIT 1`,
      [userId, targetId, targetId, userId],
    );

    if (existing.length > 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Connection already exists" };
      return;
    }

    await client.execute(
      `INSERT INTO connections (user_id, friend_id, status) VALUES (?, ?, 'pending')`,
      [userId, targetId],
    );

    ctx.response.body = { message: "Connection request sent" };
  } catch (e) {
    log_error("sendConnectionRequest", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};

// --- Cancel a sent request ---
export const cancelConnectionRequest = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const { id: targetId } = await ctx.request.body({ type: "json" }).value;
  if (typeof targetId !== "number") {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid target ID" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    await client.execute(
      `DELETE FROM connections WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
      [userId, targetId],
    );
    ctx.response.body = { message: "Connection request cancelled" };
  } catch (e) {
    log_error("cancelConnectionRequest", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};

// --- Accept request ---
export const acceptConnectionRequest = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const { id: requesterId } = await ctx.request.body({ type: "json" }).value;
  if (typeof requesterId !== "number") {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid requester ID" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    const pending = await client.query(
      `SELECT * FROM connections WHERE user_id = ? AND friend_id = ? AND status = 'pending' LIMIT 1`,
      [requesterId, userId],
    );

    if (pending.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "No pending request found" };
      return;
    }

    await client.execute(
      `UPDATE connections SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`,
      [requesterId, userId],
    );

    ctx.response.body = { message: "Connection accepted" };
  } catch (e) {
    log_error("acceptConnectionRequest", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};

// --- Remove connection ---
export const removeConnection = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const { id: targetId } = await ctx.request.body({ type: "json" }).value;
  if (typeof targetId !== "number") {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid target ID" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    await client.execute(
      `DELETE FROM connections 
       WHERE (user_id = ? AND friend_id = ? AND status = 'accepted')
          OR (user_id = ? AND friend_id = ? AND status = 'accepted')`,
      [userId, targetId, targetId, userId],
    );

    ctx.response.body = { message: "Connection removed" };
  } catch (e) {
    log_error("removeConnection", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};

// --- Get pending requests ---
export const getPendingConnections = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    const rows = await client.query(
      `SELECT c.id, u.id as userId, u.username, u.display_name, u.avatar_url, c.user_id, c.friend_id, c.status, c.created_at
       FROM connections c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending' AND (c.friend_id = ? OR c.user_id = ?)`,
      [userId, userId],
    );

    // Split into incoming (friend_id = me) and outgoing (user_id = me)
    const incoming = rows.filter((r: { friend_id: number; }) => r.friend_id === userId).map((r: { userId: number; username: string; display_name: string; avatar_url: string; }) => ({
      id: r.userId,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url
    }));

    const outgoing = rows.filter((r: { user_id: number; }) => r.user_id === userId).map((r: { friend_id: number; username: string; display_name: string; avatar_url: string; }) => ({
      id: r.friend_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url
    }));

    ctx.response.body = { incoming, outgoing };
  } catch (e) {
    log_error("getPendingConnections", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};


// --- Get accepted connections ---
export const getConnections = async (ctx: Context) => {
  const userId = await getUserIdFromJWT(ctx);
  if (!userId) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  const client = await getDBClient();
  if (!client) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Database error" };
    return;
  }

  try {
    const connections = await client.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM users u
       JOIN connections c ON (u.id = c.friend_id AND c.user_id = ?) OR (u.id = c.user_id AND c.friend_id = ?)
       WHERE c.status = 'accepted'`,
      [userId, userId],
    );

    ctx.response.body = { connections };
  } catch (e) {
    log_error("getConnections", ctx.state.correlationID, e);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal error" };
  }
};
