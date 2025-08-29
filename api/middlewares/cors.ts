import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { log_error } from "../lib/logger.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";

export const cors: Middleware = async (ctx, next) => {
  const requestOrigin = ctx.request.headers.get("origin");

  let allowOrigin: string | null = null;

  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      const hostname = url.hostname;

      if (!DA_ISPROD || hostname === "davidnet.net" || hostname.endsWith(".davidnet.net")) {
        allowOrigin = requestOrigin;
      }
    } catch (_err) {
      // Invalid origin; allowOrigin stays null
    }
  }

  // Always set CORS headers if allowOrigin is set
  if (allowOrigin) {
    ctx.response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    ctx.response.headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );
    ctx.response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-correlation-id"
    );
    ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  // OPTIONS preflight
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  try {
    await next();
  } catch (err) {
    // Ensure CORS headers are still set on errors
    if (allowOrigin) {
      ctx.response.headers.set("Access-Control-Allow-Origin", allowOrigin);
      ctx.response.headers.set(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,DELETE,OPTIONS"
      );
      ctx.response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-correlation-id"
      );
      ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    ctx.response.status = 500;
    ctx.response.body = { error: "Unknown CORS error." };
    log_error(err, "CORS middleware error");
  }
};

export default cors;
