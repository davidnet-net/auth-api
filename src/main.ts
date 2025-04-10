//? Libraries
import { Application, Context } from "https://deno.land/x/oak@v12.1.0/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

//? Routes
//? ./
import { signup } from "./routes/signup.ts";
import { login } from "./routes/login.ts";
import { is_valid_early_login_token } from "./routes/is_valid_early_login_token.ts";

//? Sessions
import { get_session } from "./routes/sessions/get_session.ts";
import { delete_session } from "./routes/sessions/delete_session.ts";
import { get_sessions } from "./routes/sessions/get_sessions.ts";

//? Misc Settings
import { set_profile_picture } from "./routes/misc_settings/set_profile_picture.ts";
import { delete_account } from "./routes/misc_settings/delete_account.ts";
import { set_desc } from "./routes/misc_settings/set_desc.ts";

//? Email
import { email_status } from "./routes/email/email_status.ts";
import { new_email_code } from "./routes/email/new_email_code.ts";
import { verify_email } from "./routes/email/verify_email.ts";

//? 2FA
import { verify_totp } from "./routes/2fa/verify_totp.ts";
import { disable_totp } from "./routes/2fa/disable_totp.ts";
import { set_up_totp } from "./routes/2fa/set_up_totp.ts";
import { get_2fa_information } from "./routes/2fa/get_2fa_information.ts";

//? GetData
import { get_userdata_from_token } from "./routes/getdata/get_userdata_from_token.ts";
import { get_id } from "./routes/getdata/get_id.ts";
import { get_username } from "./routes/getdata/get_username.ts";
import { get_email } from "./routes/getdata/get_email.ts";
import { get_created_at } from "./routes/getdata/get_created_at.ts";
import { get_profile_picture } from "./routes/getdata/get_profile_picture.ts";
import { get_delete_token } from "./routes/getdata/get_delete_token.ts";
import { get_account_logs } from "./routes/getdata/get_account_logs.ts";
import { get_desc } from "./routes/getdata/get_desc.ts";
import { does_user_exists } from "./routes/getdata/does_user_exists.ts";
import { get_username_from_id } from "./routes/getdata/get_username_from_id.ts";
import { get_created_at_from_id } from "./routes/getdata/get_created_at_from_id.ts";

//? Recovery
import { start_recovery } from "./routes/recovery/start_recovery.ts";
import { verify_recovery } from "./routes/recovery/verify_recovery.ts";
import { recovery_status } from "./routes/recovery/recovery_status.ts";
import { recover_password } from "./routes/recovery/recover_password.ts";

//? Objects
const app = new Application();
const environment = config();
const port = Number(environment.API_PORT);

//? CORS
app.use(oakCors({
    origin: ["https://account.davidnet.net", "https://davidnet.net"],
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
}));

//? Routes
app.use(async (ctx: Context) => {
    //? General
    if (
        ctx.request.method === "GET" &&
        ctx.request.url.pathname === "/"
    ) {
        ctx.response.body = { message: "Access denied!" };
        return;
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/signup"
    ) {
        await signup(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/login"
    ) {
        await login(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/is_valid_early_login_token"
    ) {
        await is_valid_early_login_token(ctx);
    }

    //? Sessions
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_session"
    ) {
        await get_session(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/delete_session"
    ) {
        await delete_session(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_sessions"
    ) {
        await get_sessions(ctx);
    }

    //? Misc Settings
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/delete_account"
    ) {
        await delete_account(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/set_profile_picture"
    ) {
        await set_profile_picture(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/set_desc"
    ) {
        await set_desc(ctx);
    }

    //? Email
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/email_status"
    ) {
        await email_status(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/new_email_code"
    ) {
        await new_email_code(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_email"
    ) {
        await verify_email(ctx);
    }

    //? 2FA
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_totp"
    ) {
        await verify_totp(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/disable_totp"
    ) {
        await disable_totp(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/set_up_totp"
    ) {
        await set_up_totp(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_2fa_information"
    ) {
        await get_2fa_information(ctx);
    }

    //? GetData
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_userdata_from_token"
    ) {
        await get_userdata_from_token(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_id"
    ) {
        await get_id(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_username"
    ) {
        await get_username(ctx);
    }
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_email"
    ) {
        await get_email(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_created_at"
    ) {
        await get_created_at(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_profile_picture"
    ) {
        await get_profile_picture(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_delete_token"
    ) {
        await get_delete_token(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_account_logs"
    ) {
        await get_account_logs(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_desc"
    ) {
        await get_desc(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/does_user_exists"
    ) {
        await does_user_exists(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_username_from_id"
    ) {
        await get_username_from_id(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/get_created_at_from_id"
    ) {
        await get_created_at_from_id(ctx);
    }

    //? Recovery
    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/start_recovery"
    ) {
        await start_recovery(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/verify_recovery"
    ) {
        await verify_recovery(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/recovery_status"
    ) {
        await recovery_status(ctx);
    }

    if (
        ctx.request.method === "POST" &&
        ctx.request.url.pathname === "/recover_password"
    ) {
        await recover_password(ctx);
    }
});

// Start the server
console.log(`Server running at http://localhost:${port}`);
await app.listen({ port: port });
