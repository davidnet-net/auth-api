import { RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { log, log_error } from "../lib/logger.ts";

const UPLOAD_DIR = "profile_pictures";
await Deno.mkdir(UPLOAD_DIR, { recursive: true });

const PLACEHOLDER_URL =
  "https://auth.davidnet.net/profile-picture/placeholder";

const MAX_UPLOAD_SIZE = 25_000_000; // 25MB
const UPLOAD_TIMEOUT_MS = 10_000; // 10 seconds

/* -------------------------------------------------- */
/* Utils                                              */
/* -------------------------------------------------- */

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Upload timeout")), ms)
    ),
  ]);
}

function getExtensionFromMime(mime: string): string {
  mime = mime.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/* -------------------------------------------------- */
/* Delete old profile picture                          */
/* -------------------------------------------------- */

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

    if (
      oldFileName &&
      !oldFileName.includes("placeholder")
    ) {
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

/* -------------------------------------------------- */
/* POST /profile-picture                               */
/* -------------------------------------------------- */

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

    /* ---------- Content-Length Guard ---------- */
    const contentLength = Number(
      ctx.request.headers.get("content-length") || 0,
    );

    if (!contentLength || contentLength > MAX_UPLOAD_SIZE) {
      ctx.response.status = 413;
      ctx.response.body = { error: "File too large" };
      return;
    }

    /* ---------- Abort handling ---------- */
    ctx.request.originalRequest.request.signal.addEventListener(
      "abort",
      () => log(`[${requestId}] Client aborted upload`),
    );

    /* ---------- Multipart parse (WITH TIMEOUT) ---------- */
    const body = ctx.request.body({ type: "form-data" });

    let form;
    try {
      form = await withTimeout(
        body.value.read({ maxSize: MAX_UPLOAD_SIZE }),
        UPLOAD_TIMEOUT_MS,
      );
    } catch (err) {
      log_error(`[${requestId}] Upload parse failed`, String(err));
      ctx.response.status = 408;
      ctx.response.body = { error: "Upload timeout" };
      return;
    }

    const file = form.files?.find((f) => f.name === "file");
    if (!file) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing file" };
      return;
    }

    /* ---------- Validate MIME ---------- */
    const mime = (file.contentType || "").toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!allowed.some((t) => mime.includes(t))) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid file type" };
      return;
    }

    /* ---------- Read file content ---------- */
    let fileContent: Uint8Array;
    let tempPath: string | undefined;

    try {
      if (file.content) {
        fileContent = file.content;
      } else if (file.filename) {
        tempPath = file.filename;
        fileContent = await Deno.readFile(file.filename);
      } else {
        throw new Error("Invalid file object");
      }
    } finally {
      if (tempPath) {
        try {
          await Deno.remove(tempPath);
        } catch {
          /* ignore */
        }
      }
    }

    /* ---------- Save ---------- */
    const ext = getExtensionFromMime(mime);
    const fileName = `${userId}_${crypto.randomUUID()}.${ext}`;
    const finalPath = `${UPLOAD_DIR}/${fileName}`;

    await Deno.writeFile(finalPath, fileContent);

    /* ---------- DB update ---------- */
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

    await delete_profile_picture(userId);
    await client.execute(
      `UPDATE users SET avatar_url = ? WHERE id = ?`,
      [publicUrl, userId],
    );

    ctx.response.status = 200;
    ctx.response.body = { avatar_url: publicUrl };
    log(`[${requestId}] Upload success`);
  } catch (err) {
    log_error(`[${requestId}] CRITICAL`, String(err));
    ctx.response.status = 500;
    ctx.response.body = { error: "Server error" };
  }
};

/* -------------------------------------------------- */
/* GET /profile-picture/:filename                      */
/* -------------------------------------------------- */

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
