import { RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { log, log_error } from "../lib/logger.ts";

const UPLOAD_DIR = "profile_pictures";
await Deno.mkdir(UPLOAD_DIR, { recursive: true });

const PLACEHOLDER_URL =
  "https://auth.davidnet.net/profile-picture/placeholder";

const MAX_UPLOAD_SIZE = 25_000_000; // 25MB

/* ----------------------------- */
/* Delete old profile picture     */
/* ----------------------------- */
export async function delete_profile_picture(
  userId: number,
  resetToPlaceholder = false,
) {
  try {
    const client = await getDBClient();
    if (!client) return;

    const result = await client.query(
      `SELECT avatar_url FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );

    if (!result.length) return;

    const oldUrl = result[0].avatar_url as string;
    const oldFileName = oldUrl?.split("/").pop()?.split("?")[0];

    if (oldFileName && !oldFileName.includes("placeholder")) {
      try {
        await Deno.remove(`${UPLOAD_DIR}/${oldFileName}`);
      } catch {
        /* ignore */
      }
    }

    if (resetToPlaceholder) {
      await client.execute(
        `UPDATE users SET avatar_url = ? WHERE id = ?`,
        [PLACEHOLDER_URL, userId],
      );
    }
  } catch (err) {
    log_error("delete_profile_picture error", String(err));
  }
}

/* ----------------------------- */
/* PUT /profile-picture           */
/* Accept raw binary (image)     */
/* ----------------------------- */
export const uploadProfilePicture = async (
  ctx: RouterContext<"/profile-picture">,
) => {
  const requestId = ctx.state.correlationID || crypto.randomUUID();
  log(`[${requestId}] Upload start`);

  try {
    /* ---------- Auth ---------- */
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
    }

    let payload;
    try {
      payload = await verifyJWT(authHeader.slice(7));
    } catch {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid token" };
      return;
    }

    const userId = Number(payload.userId);

    /* ---------- Content-Length Check ---------- */
    const contentLength = Number(
      ctx.request.headers.get("content-length") || 0,
    );

    if (!contentLength || contentLength > MAX_UPLOAD_SIZE) {
      ctx.response.status = 413;
      ctx.response.body = { error: "File too large" };
      return;
    }

    /* ---------- Determine MIME ---------- */
    const contentType = (ctx.request.headers.get("content-type") || "").toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(contentType)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid file type" };
      return;
    }

    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
        ? "webp"
        : contentType === "image/gif"
        ? "gif"
        : "jpg";

    /* ---------- Read raw bytes ---------- */
    const body = ctx.request.body({ type: "bytes" });
    const fileContent: Uint8Array = await body.value;

    /* ---------- Save to disk ---------- */
    const fileName = `${userId}_${crypto.randomUUID()}.${ext}`;
    const filePath = `${UPLOAD_DIR}/${fileName}`;
    await Deno.writeFile(filePath, fileContent);

    /* ---------- Delete old avatar ---------- */
    await delete_profile_picture(userId);

    /* ---------- Update DB ---------- */
    const client = await getDBClient();
    if (!client) {
      ctx.response.status = 500;
      ctx.response.body = { error: "Database error" };
      return;
    }

    const baseUrl = Deno.env.get("DA_ISPROD") === "true"
      ? "https://auth.davidnet.net"
      : "http://localhost:1000";

    const publicUrl =
      `${baseUrl}/profile-picture/${encodeURIComponent(fileName)}?v=${Date.now()}`;

    await client.execute(
      `UPDATE users SET avatar_url = ? WHERE id = ?`,
      [publicUrl, userId],
    );

    /* ---------- Success ---------- */
    ctx.response.status = 200;
    ctx.response.body = { avatar_url: publicUrl };
    log(`[${requestId}] Upload success`);

  } catch (err) {
    log_error(`[${requestId}] CRITICAL ERROR: ${err}`);
    ctx.response.status = 500;
    ctx.response.body = { error: "Server error." };
  }
};

/* ----------------------------- */
/* GET /profile-picture/:filename */
/* Serve the image file           */
/* ----------------------------- */
export const getProfilePicture = async (
  ctx: RouterContext<"/profile-picture/:filename">,
) => {
  try {
    let filename = ctx.params.filename;
    if (!filename) {
      ctx.response.status = 400;
      return;
    }

    filename = filename.split("?")[0];

    if (filename === "placeholder") {
      const file = await Deno.readFile("./placeholder.png");
      ctx.response.headers.set("Content-Type", "image/png");
      ctx.response.body = file;
      return;
    }

    const filePath = `${UPLOAD_DIR}/${filename}`;
    const file = await Deno.readFile(filePath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "gif"
        ? "image/gif"
        : "image/jpeg";

    ctx.response.headers.set("Content-Type", type);
    ctx.response.body = file;
  } catch {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
  }
};
