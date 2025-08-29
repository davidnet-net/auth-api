import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";

export const cors: Middleware = async (ctx, next) => {
  const requestOrigin = ctx.request.headers.get("origin");

  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      const hostname = url.hostname;

      if (!DA_ISPROD || hostname === "davidnet.net" || hostname.endsWith(".davidnet.net")) {
        ctx.response.headers.set("Access-Control-Allow-Origin", requestOrigin);
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
      // Invalid origin URL; just ignore
    }
  }

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
};

export default cors;
