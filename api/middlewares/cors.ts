import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";

export const cors: Middleware = async (ctx, next) => {
  const origin = ctx.request.headers.get("origin");

  // Only allow your domains
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      if (!DA_ISPROD || host === "davidnet.net" || host.endsWith(".davidnet.net")) {
        ctx.response.headers.set("Access-Control-Allow-Origin", origin);
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
    } catch (_err) {
      // ignore invalid origin
    }
  }

  // Respond immediately to preflight OPTIONS
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
};

export default cors;
