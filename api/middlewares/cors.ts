import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
    throw new Error("Invalid env: DA_ISPROD");
}

export const cors: Middleware = async (ctx, next) => {
    const requestOrigin = ctx.request.headers.get("origin");

    if (requestOrigin && DA_ISPROD) {
        const url = new URL(requestOrigin);
        const hostname = url.hostname;

        if (hostname === "davidnet.net" || hostname.endsWith(".davidnet.net")) {
            ctx.response.headers = new Headers({
            "Access-Control-Allow-Origin": requestOrigin,
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, x-correlation-id",
            "Access-Control-Allow-Credentials": "true"
            });
        }
    }

    if (ctx.request.method === "OPTIONS") {
        ctx.response.status = 204;
        return;
    }

    await next();
};

export default cors;
