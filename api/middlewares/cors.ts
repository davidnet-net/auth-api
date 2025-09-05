import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
const allowedHostRegex = /^([a-z0-9-]+\.)*davidnet\.net$/i;

export const cors: Middleware = async (ctx, next) => {

  //! Temp secure cookie fix
  if (!ctx.request.secure) {
    const proto = ctx.request.headers.get("x-forwarded-proto");
    if (proto && proto.toLowerCase() === "https") {
      // @ts-ignore: Oak doesn't allow manually setting .secure, but this works
      ctx.request.secure = true;
    }
  }

  const origin = ctx.request.headers.get("origin")?.trim();

  if (origin) {
    try {
      const host = new URL(origin).hostname;

      if (!DA_ISPROD || allowedHostRegex.test(host)) {
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
      } else {
        ctx.response.headers.set("Access-Control-Allow-Origin", "*");
        ctx.response.status = 403; // Not allowed
        ctx.response.body = "Not allowed!";
        return;
      }
    } catch {
      ctx.response.headers.set("Access-Control-Allow-Origin", "*");
      ctx.response.status = 400; // Invalid origin
      ctx.response.body = "CORS origin header is invalid!";
      return;
    }
  } else {
    ctx.response.status = 403;
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.body = "CORS origin header is required!";
  }

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
};

export default cors;
