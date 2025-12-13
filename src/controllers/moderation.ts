import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log, log_error } from "../lib/logger.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { loadEmailTemplate, sendEmail } from "../lib/mail.ts";
import { delete_profile_picture } from "./profile_picture.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
	throw new Error("Invalid env: DA_ISPROD");
}

/**
 * Hash a string using SHA-256 and return a hex string
 * @param input The string to hash
 * @returns 64-character hex string
 */
export async function sha256Hash(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return hashHex;
}

export const moderate_DELETE_account = async (ctx: Context) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	const body = await ctx.request.body({ type: "json" }).value;
	const { id } = body;

	// Basic validation
	if (!id) {
		ctx.response.status = 400;
		ctx.response.body = { error: "id required." };
		return;
	}

	const userId: number = id;
	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		if (!payload.admin) {
			ctx.response.status = 401;
			ctx.response.body = { error: "Not admin" };
			return;
		}
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	const client = await getDBClient();
	if (!client) {
		log_error(
			"MODERATE: Delete account error: DATABASE CONNECTION ERR",
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database connection error." };
		return;
	}

	try {
		const user = await client.query(
			`SELECT *
            FROM users
            WHERE id = ?
            LIMIT 1`,
			[userId],
		);

		const complog = await client.execute(
			`INSERT INTO compliance_log (action, user_id, email_hash, username_hash) VALUES (?, ?, ?, ?)`,
			[
				"delete_account",
				userId,
				await sha256Hash(user[0].email),
				await sha256Hash(user[0].username),
			],
		);
		const ReferenceID = complog.lastInsertId;

		await delete_profile_picture(userId, true);

		await sendEmail(
			user[0].email,
			"Davidnet Account Deletion",
			await loadEmailTemplate("email_templates/account_deletion.html", {
				username: user[0].username,
				user_id: String(userId),
				email_hash: await sha256Hash(user[0].email),
				username_hash: await sha256Hash(user[0].username),
				referenceID: String(ReferenceID),
			}),
		);

		await sendEmail(
			user[0].email,
			"Davidnet Account Moderation",
			await loadEmailTemplate(
				"email_templates/account_moderate_deletion.html",
				{
					username: user[0].username,
					referenceID: String(ReferenceID),
				},
			),
		);

		//TODO Add an queue???
		await client.execute(
			`DELETE FROM users WHERE id = ?`,
			[
				userId,
			],
		);

		//? Finish
		await client.query(
			`UPDATE compliance_log SET finished_at = CURRENT_TIMESTAMP WHERE user_id = ? LIMIT 1`,
			[userId],
		);

		log(
			ctx.state.correlationID,
			"MODERATE: Account deleted",
			"ReferenceID: " + ReferenceID,
		);

		ctx.response.status = 200;
		ctx.response.body = { success: true };

		// Internal
		// Internal
		if (DA_ISPROD) {
			const jwt_to = Deno.env.get("DA_JWT_SECRET"); //TODO Make an better way of internal auth.
			const kanban = await fetch(
				"https://kanban-api.davidnet.net/internal/user_deletion",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						user_id: userId,
						jwt_token: jwt_to,
					}),
				},
			);

			if (!kanban.ok) {
				log_error(
					"MODERATE:  error: Couldnt connect to kanban api",
					kanban.statusText,
				);
			}
		} else {
			const jwt_to = Deno.env.get("DA_JWT_SECRET"); //TODO Make an better way of internal auth.
			const kanban = await fetch(
				"http://localhost:1001/internal/user_deletion",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						user_id: userId,
						jwt_token: jwt_to,
					}),
				},
			);

			if (!kanban.ok) {
				log_error(
					"MODERATE: : up error: Couldnt connect to kanban api",
					kanban.statusText,
				);
			}
		}
	} catch (err) {
		log_error(
			`MODERATE: Delete Account DB ERR: ${err}`,
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database update error." };
	}
};

export const moderate_PROFILE_PICTURE_RESET = async (ctx: Context) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	const body = await ctx.request.body({ type: "json" }).value;
	const { id } = body;

	// Basic validation
	if (!id) {
		ctx.response.status = 400;
		ctx.response.body = { error: "id required." };
		return;
	}

	const userId: number = id;
	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		if (!payload.admin) {
			ctx.response.status = 401;
			ctx.response.body = { error: "Not admin" };
			return;
		}
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	try {
		await delete_profile_picture(userId, true); // Reset to placeholder

		ctx.response.status = 200;
		ctx.response.body = {
			success: true,
			message: "Profile picture reset to placeholder.",
		};

		log(
			ctx.state.correlationID,
			`MODERATE: Profile picture reset for user ${userId}`,
		);
	} catch (err) {
		log_error(
			`MODERATE: Reset profile picture DB ERR: ${err}`,
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Failed to reset profile picture." };
	}
};
