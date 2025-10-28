import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { log_error } from "../lib/logger.ts";
import { loadEmailTemplate, sendEmail } from "../lib/mail.ts";
import { formatDateWithUTCOffset } from "../lib/time.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
	throw new Error("Invalid env: DA_ISPRO");
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email) && email.length <= 254;
}

export const verify_email = async (ctx: Context) => {
	try {
		const body = await ctx.request.body({ type: "json" }).value;
		const { token } = body;

		// Is Valid Token
		if (
			!token || typeof token !== "string" || token.length !== 64
		) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Token Invalid" };
			return;
		}

		const client = await getDBClient();
		if (!client) {
			log_error(
				"signup error: DATABASE CONNECTION ERR",
				ctx.state.correlationID,
			);
			ctx.response.status = 500;
			ctx.response.body = { error: "Database connection error." };
			return;
		}
		const user = await client.query(
			`SELECT id, email_verified, email_verification_token, email_verification_expires FROM users WHERE email_verification_token = ? LIMIT 1`,
			[token],
		);

		if (user.length < 1) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Token Expired" };
			return;
		}

		const expires = new Date(user[0].email_verification_expires);
		const nowUtc = new Date();

		if (expires < nowUtc) {
			await client.query(
				`DELETE FROM users WHERE email_verification_token = ?`,
				[token],
			);
			ctx.response.status = 400;
			ctx.response.body = { error: "Token Expired" };
			return;
		}

		await client.query(
			`UPDATE users SET email_verified = TRUE WHERE email_verification_token = ? LIMIT 1`,
			[token],
		);

		ctx.response.status = 204;
		return;
	} catch {
		ctx.response.status = 500;
		ctx.response.body = { error: "Catch Error" };
		return;
	}
};

export const check_verify_email = async (ctx: Context) => {
	try {
		const body = await ctx.request.body({ type: "json" }).value;
		const { email } = body;

		if (!email || typeof email !== "string" || !isValidEmail(email)) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Invalid email" };
			return;
		}

		const client = await getDBClient();
		if (!client) {
			ctx.response.status = 500;
			ctx.response.body = { error: "Database connection error" };
			return;
		}

		const timeoutMs = 60000;
		const pollIntervalMs = 5000;
		const start = Date.now();

		while (Date.now() - start < timeoutMs) {
			const user = await client.query(
				`SELECT email_verified, email_verification_expires FROM users WHERE email = ? LIMIT 1`,
				[email],
			);

			if (user.length === 0) {
				ctx.response.status = 400;
				ctx.response.body = { error: "Token expired" };
				return;
			}

			if (user[0].email_verified === 1) {
				ctx.response.status = 200;
				ctx.response.body = { email_verified: true };
				return;
			}

			const expires = new Date(user[0].email_verification_expires);
			if (expires < new Date()) {
				await client.query(`DELETE FROM users WHERE email = ?`, [
					email,
				]);
				ctx.response.status = 400;
				ctx.response.body = { error: "Token expired" };
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}

		ctx.response.status = 200;
		ctx.response.body = { email_verified: false };
	} catch (err) {
		log_error(err, ctx.state.correlationID);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error" };
	}
};

export const resend_verification_email = async (ctx: Context) => {
	try {
		const body = await ctx.request.body({ type: "json" }).value;
		const { email } = body;

		// Validate email format
		if (
			!email || typeof email !== "string" ||
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
		) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Invalid email." };
			return;
		}

		const client = await getDBClient();
		if (!client) {
			log_error(
				"resend_verification_email: DATABASE CONNECTION ERR",
				ctx.state.correlationID,
			);
			ctx.response.status = 500;
			ctx.response.body = { error: "Database connection error." };
			return;
		}

		// Find the user and their token
		const users = await client.query(
			`SELECT id, username, email_verified, email_verification_token, email_verification_expires 
			 FROM users WHERE email = ? LIMIT 1`,
			[email],
		);

		if (users.length < 1) {
			ctx.response.status = 404;
			ctx.response.body = { error: "User not found." };
			return;
		}

		const user = users[0];

		if (user.email_verified === 1) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Email is already verified." };
			return;
		}

		// Check if the token is expired
		const expires = new Date(user.email_verification_expires);
		if (expires < new Date()) {
			ctx.response.status = 400;
			ctx.response.body = {
				error: "Verification token expired. Please request a new one.",
			};
			return;
		}

		// Send email with the existing token
		await sendEmail(
			email,
			"Davidnet - Email Verification",
			await loadEmailTemplate("email_templates/email_verification.html", {
				username: user.username,
				verifyemail_url: (DA_ISPROD
					? "https://account.davidnet.net"
					: "http://localhost:5173") +
					"/verify/email/" + user.email_verification_token,
				expiry_date: formatDateWithUTCOffset(
					new Date(user.email_verification_expires),
				),
			}),
		);

		ctx.response.status = 200;
		ctx.response.body = {
			message: "Verification email resent successfully.",
		};
	} catch (err) {
		log_error(
			"resend_verification_email error:",
			err,
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error." };
	}
};
