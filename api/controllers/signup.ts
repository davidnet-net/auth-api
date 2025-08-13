import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { hash } from "https://deno.land/x/bcrypt/mod.ts";
import { log_error } from "../lib/logger.ts";
import { randomHex } from "../lib/random.ts";
import { createAccessToken, createRefreshToken } from "../lib/jwt.ts";
import { loadEmailTemplate, sendEmail } from "../lib/mail.ts";
import { formatDateWithUTCOffset } from "../lib/time.ts";

const AVATAR_PLACEHOLDER =
	"http://localhost:5173/placeholder.png";
const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
if (typeof DA_ISPROD !== "boolean") {
	throw new Error("Invalid env: DA_ISPRO");
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email) && email.length <= 254;
}

export const signup = async (ctx: Context) => {
	try {
		const body = await ctx.request.body({ type: "json" }).value;
		const { email, username, password } = body;

		// Email Validation
		if (
			!email || typeof email !== "string" ||
			!isValidEmail(email)
		) {
			ctx.response.status = 400;
			ctx.response.body = {
				error: "Email is invalid or too long (max 254 characters).",
			};
			return;
		}

		// Username validation
		if (
			!username || typeof username !== "string" ||
			username.length < 3 || username.length > 20
		) {
			ctx.response.status = 400;
			ctx.response.body = {
				error: "Username must be between 3 and 20 characters.",
			};
			return;
		}

		// Password Validation
		if (
			!password || typeof password !== "string" ||
			password.length === 0
		) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Password is required." };
			return;
		}

		// Get the DB after validating
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

		// Check if username or email already exists
		const existingUsers = await client.query(
			`SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1`,
			[username, email],
		);

		if (existingUsers.length > 0) {
			// Check if fields arent taken yet.
			const conflict = existingUsers[0];
			if (conflict.username === username && conflict.email === email) {
				ctx.response.status = 400;
				ctx.response.body = {
					error: "Username and email are already taken.",
				};
			} else if (conflict.username === username) {
				ctx.response.status = 400;
				ctx.response.body = { error: "Username is already taken." };
			} else if (conflict.email === email) {
				ctx.response.status = 400;
				ctx.response.body = { error: "Email is already registered." };
			}
			return;
		}

		const hashedPassword = await hash(password);
		const email_verification_token = randomHex();

		// Insert the user.
		const result = await client.execute(
			`INSERT INTO users (username, email, email_verification_token, email_verification_expires, password, display_name, avatar_url) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), ?, ?, ?)`,
			[
				username,
				email,
				email_verification_token,
				hashedPassword,
				username,
				AVATAR_PLACEHOLDER,
			],
		);
		const user_id: number | undefined = result.lastInsertId;

		//? Session stuff
		// Generate JWT
		let jwtId: string = "";
		let exists = true;

		while (exists) {
			jwtId = crypto.randomUUID();
			const rows = await client.query(
				`SELECT 1 FROM sessions WHERE jwt_id = ? LIMIT 1`,
				[jwtId],
			);
			exists = rows.length > 0;
		}

		const refresh_token = await createRefreshToken({
			userId: user_id,
			username,
			display_name: username,
			profilePicture: AVATAR_PLACEHOLDER,
			email_verified: 0,
			email,
			jti: jwtId,
		});
		const access_token = await createAccessToken({
			userId: user_id,
			username,
			display_name: username,
			profilePicture: AVATAR_PLACEHOLDER,
			email_verified: 0,
			email,
			jti: jwtId,
		});

		// Store session in DB
		await client.execute(
			`INSERT INTO sessions (user_id, jwt_id, expires_at, user_agent, ip_address) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), ?, ?)`,
			[
				user_id,
				jwtId,
				ctx.request.headers.get("user-agent") || "",
				ctx.request.ip,
			],
		);

		ctx.cookies.set(
			"refresh_token",
			refresh_token,
			{
				httpOnly: true,
				secure: DA_ISPROD,
				sameSite: DA_ISPROD ? "none" : "lax",
				domain: DA_ISPROD ? ".davidnet.net" : undefined,
				path: "/",
				maxAge: 7 * 24 * 60 * 60, // 7 days
			},
		);

		await sendEmail(
			email,
			"Welcome to Davidnet - Email Verification",
			await loadEmailTemplate("email_templates/account_creation.html", {
				username: username,
				verifyemail_url: (DA_ISPROD
					? "https://account.davidnet.net"
					: "http://localhost:5173") +
					"/verify/email/" + email_verification_token,
				expiry_date: formatDateWithUTCOffset(
					new Date(Date.now() + 24 * 60 * 60 * 1000),
				),
			}),
		);

		ctx.response.status = 201;
		ctx.response.body = {
			message: "User created successfully.",
			access_token: access_token
		};
	} catch (error) {
		log_error("Signup error:", error, ctx.state.correlationID);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error." };
	}
};

export default signup;
