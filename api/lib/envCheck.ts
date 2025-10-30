import { log } from "./logger.ts";

export function envCheck() {
	//? MISC
	const DA_ISPROD = Deno.env.get("DA_ISPROD");
	const DA_JWT_SECRET = Deno.env.get("DA_JWT_SECRET");
	const INTERNAL_TOKEN = Deno.env.get("DA_INTERNAL_TOKEN");

	if (!DA_ISPROD || !typeof Boolean) return "DA_ISPROD";
	if (!DA_JWT_SECRET || !typeof String || DA_JWT_SECRET.length < 64) { return "DA_JWT_SECRET"; }
	if (!INTERNAL_TOKEN || !typeof String || INTERNAL_TOKEN.length < 64) { return "INTERNAL_TOKEN"; }

	//? Database
	const DA_DB_HOST = Deno.env.get("DA_DB_HOST");
	const DA_DB_USER = Deno.env.get("DA_DB_USER");
	const DA_DB_PASS = Deno.env.get("DA_DB_PASS");
	const DB_NAME = Deno.env.get("DA_DB_NAME");

	if (!DA_DB_HOST || !typeof String) return "DA_DB_HOST";
	if (!DA_DB_USER || !typeof String) return "DA_DB_USER";
	if (!DA_DB_PASS || !typeof String) return "DA_DB_PASS";
	if (!DB_NAME || !typeof String) return "DA_DB_NAME";

	//? Logging
	const DA_LOG_DIR = Deno.env.get("DA_LOG_DIR");
	const DA_KEEP_LOG_DAYS = Deno.env.get("DA_KEEP_LOG_DAYS");
	const DA_LOG_TO_TERMINAL = Deno.env.get("DA_LOG_TO_TERMINAL");

	if (!DA_LOG_DIR || !typeof String) return "DA_LOG_DIR";
	if (!DA_KEEP_LOG_DAYS || !typeof Number) return "DA_KEEP_LOG_DAYS";
	if (!DA_LOG_TO_TERMINAL || !typeof Boolean) return "DA_LOG_TO_TERMINAL";

	//? EMail
	const DA_EMAIL = Deno.env.get("DA_EMAIL");
	const DA_EMAIL_PASSWORD = Deno.env.get("DA_EMAIL_PASSWORD");

	if (!DA_EMAIL || !typeof String) return "DA_EMAIL";
	if (!DA_EMAIL_PASSWORD || !typeof String) return "DA_EMAIL_PASSWORD";

	log("Env variables OK");
}

export default envCheck;
