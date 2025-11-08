import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../../lib/db.ts";
import { log_error } from "../../lib/logger.ts";
import { verifyJWT } from "../../lib/jwt.ts";

// Load preferences
export const loadPreferences = async (ctx: Context) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	let userId: number;
	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		userId = Number(payload.userId);
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	const client = await getDBClient();
	if (!client) {
		log_error(
			"loadPreferences error: DATABASE CONNECTION ERR",
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database connection error." };
		return;
	}

	try {
		const result = await client.execute(
			`SELECT timezone, dateFormat, firstDay FROM user_settings WHERE user_id = ?`,
			[userId],
		);

		if (result.rows && result.rows.length > 0) {
			const row = result.rows[0] as Record<string, string>;
			ctx.response.status = 200;
			ctx.response.body = {
				timezone: row.timezone,
				dateFormat: row.dateFormat,
				firstDay: row.firstDay,
				language: row.language
			};
		} else {
			// No settings yet → return defaults
			ctx.response.status = 200;
			ctx.response.body = {
				timezone: "UTC",
				dateFormat: "DD-MM-YYYY HH:mm",
				firstDay: "monday",
				language: "en"
			};
		}
	} catch (err) {
		log_error(`loadPreferences DB ERR: ${err}`, ctx.state.correlationID);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database query failed." };
	}
};

// Save preferences
export const savePreferences = async (ctx: Context) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	let userId: number;
	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		userId = Number(payload.userId);
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	const body = await ctx.request.body({ type: "json" }).value;
	const { timezone, dateFormat, firstDay, language } = body;

	if (
		typeof timezone !== "string" ||
		typeof dateFormat !== "string" ||
		typeof firstDay !== "string" ||
		typeof language !== "string" 
	) {
		ctx.response.status = 400;
		ctx.response.body = { error: "Invalid input" };
		return;
	}

	const client = await getDBClient();
	if (!client) {
		log_error(
			"savePreferences error: DATABASE CONNECTION ERR",
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database connection error." };
		return;
	}

	try {
		await client.execute(
			`UPDATE user_settings 
     SET timezone = ?, dateFormat = ?, firstDay = ?, language = ?,
     WHERE user_id = ?`,
			[timezone, dateFormat, firstDay, language, userId],
		);

		ctx.response.status = 200;
		ctx.response.body = { success: true };
	} catch (err) {
		log_error(`savePreferences DB ERR: ${err}`, ctx.state.correlationID);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database update failed." };
	}
};

export default { loadPreferences, savePreferences };
