import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { sendEmail, loadEmailTemplate } from "../lib/mail.ts";
import { log_error } from "../lib/logger.ts";
import { verifyJWT } from "../lib/jwt.ts";

const INTERNAL_TOKEN = Deno.env.get("DA_INTERNAL_TOKEN")!;
const POLICY_LINK = "https://davidnet.net/legal/";
const ACCEPT_BASE_LINK = "https://davidnet.net/legal/accept";

/**
 * Extracts the userId from JWT in the Authorization header.
 */
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

/**
 * POST /api/policy/change
 * Triggered when the policy is updated.
 * Updates latest policy hash, resets acceptances, and sends emails.
 */
export const policy_change = async (ctx: Context) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { token, hash } = body;

    if (token !== INTERNAL_TOKEN) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized." };
      return;
    }

    const client = await getDBClient();
    if (!client) throw new Error("DB connection failed");

    // Update latest policy hash
    await client.execute("UPDATE policy_version SET hash = ? WHERE id = 1", [hash]);

    // Reset all user acceptances
    await client.execute("DELETE FROM user_policy_acceptance");

    // Notify all users via email
    const users = await client.query("SELECT id, username, email FROM users");
    for (const user of users) {
      try {
        const acceptLink = `${ACCEPT_BASE_LINK}`;
        const html = await loadEmailTemplate("email_templates/policy_update.html", {
          username: user.username,
          policyLink: POLICY_LINK,
          acceptLink,
        });
        await sendEmail(user.email, "Please accept the updated policies", html);
      } catch (e) {
        log_error(`Failed to send email to ${user.email}`, e);
      }
    }

    ctx.response.status = 204;
  } catch (err) {
    log_error("policy_change error", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
};

/**
 * GET /api/policy/check
 * Checks if the current user (from JWT) has accepted the latest policy.
 */
export const check_policy = async (ctx: Context) => {
  try {
    const userId = await getUserIdFromJWT(ctx);
    if (!userId) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized." };
      return;
    }

    const client = await getDBClient();
    if (!client) throw new Error("DB connection failed");

    const res = await client.query(
      "SELECT 1 FROM user_policy_acceptance WHERE user_id = ? LIMIT 1",
      [userId]
    );

    ctx.response.body = { accepted: res.length > 0 };
  } catch (err) {
    log_error("check_policy error", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
};

/**
 * POST /api/policy/accept
 * Marks the current user (from JWT) as having accepted the latest policy.
 */
export const accept_policy = async (ctx: Context) => {
  try {
    const userId = await getUserIdFromJWT(ctx);
    if (!userId) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized." };
      return;
    }

    const client = await getDBClient();
    if (!client) throw new Error("DB connection failed");

    // Insert if not exists
    await client.execute(
      "INSERT IGNORE INTO user_policy_acceptance (user_id) VALUES (?)",
      [userId]
    );

    ctx.response.body = { success: true };
  } catch (err) {
    log_error("accept_policy error", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
};