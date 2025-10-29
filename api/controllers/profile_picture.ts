import { RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { log, log_error } from "../lib/logger.ts";

const UPLOAD_DIR = "profile_pictures";
await Deno.mkdir(UPLOAD_DIR, { recursive: true });

const PLACEHOLDER_URL = "https://account.davidnet.net/placeholder.png";

/**
 * Deletes the old profile picture for a user and optionally resets to placeholder
 */
export async function delete_profile_picture(
	userId: number,
	resettoplaceholder = false,
) {
	try {
		const client = await getDBClient();
		if (!client) {
			log_error(
				"delete_profile_picture: DATABASE CONNECTION ERR",
				userId.toString(),
			);
			return;
		}

		const result = await client.query(
			`SELECT avatar_url FROM users WHERE id = ? LIMIT 1`,
			[userId],
		);

		if (result.length === 0) return;

		const oldUrl = result[0].avatar_url as string;

		if (oldUrl && !oldUrl.endsWith("placeholder.png")) {
			const match = oldUrl.match(
				/\/profile-picture\/(\d+)_([a-z0-9\-]+)\.(\w+)/i,
			);
			if (match) {
				const oldFileName = match[0].split("/").pop();
				if (oldFileName) {
					try {
						await Deno.remove(`${UPLOAD_DIR}/${oldFileName}`);
					} catch {
						// Ignore missing old file
					}
				}
			}
		}

		if (resettoplaceholder) {
			await client.execute(
				`UPDATE users SET avatar_url = ? WHERE id = ?`,
				[PLACEHOLDER_URL, userId],
			);
		}
	} catch (err) {
		log_error(
			"delete_profile_picture error: " + String(err),
			userId.toString(),
		);
	}
}

/**
 * POST /profile-picture
 * Uploads and sets the profile picture for the authenticated user.
 */
export const uploadProfilePicture = async (
	ctx: RouterContext<"/profile-picture">,
) => {
	try {
		// Verify JWT
		const authHeader = ctx.request.headers.get("authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			ctx.response.status = 401;
			ctx.response.body = {
				error: "Missing or invalid authorization header.",
			};
			return;
		}

		let payload;
		try {
			payload = await verifyJWT(authHeader.slice(7));
		} catch {
			ctx.response.status = 401;
			ctx.response.body = { error: "Invalid or expired token." };
			return;
		}

		const userId = Number(payload.userId);
		if (!userId) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Invalid user." };
			return;
		}

		// Parse multipart/form-data
		const body = await ctx.request.body({ type: "form-data" });
		const form = await body.value.read({ maxSize: 5_000_000 }); // 5 MB limit
		const file = form.files?.find((f) => f.name === "file");

		if (!file || !file.content) {
			ctx.response.status = 400;
			ctx.response.body = { error: "Missing image file." };
			return;
		}

		// Accept common safe image formats
		const validTypes = [
			"image/jpeg",
			"image/pjpeg",
			"image/jfif",
			"image/jiff",
			"image/png",
			"image/webp",
			"image/gif",
		];

		const mime = (file.contentType || "").toLowerCase();
		if (!validTypes.includes(mime)) {
			ctx.response.status = 400;
			ctx.response.body = {
				error:
					"Only JPEG, JFIF, PNG, WEBP, and GIF formats are allowed.",
			};
			return;
		}

		// Determine file extension safely
		let ext = "jpg";
		if (mime.includes("png")) ext = "png";
		else if (mime.includes("webp")) ext = "webp";
		else if (mime.includes("gif")) ext = "gif";
		else if (mime.includes("jfif") || mime.includes("jiff")) ext = "jfif";

		// Prepare DB client
		const client = await getDBClient();
		if (!client) {
			log_error(
				"uploadProfilePicture error: DATABASE CONNECTION ERR",
				ctx.state.correlationID,
			);
			ctx.response.status = 500;
			ctx.response.body = { error: "Database connection error." };
			return;
		}

		// Save new file
		const fileName = `${userId}_${crypto.randomUUID()}.${ext}`;
		const filePath = `${UPLOAD_DIR}/${fileName}`;
		await Deno.writeFile(filePath, file.content);

		await delete_profile_picture(userId, false);

		// Public URL to serve, encode filename and add ?v=
		const baseUrl = Deno.env.get("DA_ISPROD") === "true"
			? "https://auth.davidnet.net"
			: "http://localhost:1000";
		const encodedFileName = encodeURIComponent(fileName);
		const publicUrl =
			`${baseUrl}/profile-picture/${encodedFileName}?v=${Date.now()}`;

		// Update DB
		await client.execute(
			`UPDATE users SET avatar_url = ? WHERE id = ?`,
			[publicUrl, userId],
		);

		ctx.response.status = 200;
		ctx.response.body = {
			message: "Profile picture updated successfully.",
			avatar_url: publicUrl,
		};
	} catch (err) {
		log_error(
			"uploadProfilePicture error: " + String(err),
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error." };
	}
};

/**
 * GET /profile-picture/:filename
 * Returns the user's profile picture file as an image response.
 */
export const getProfilePicture = async (
	ctx: RouterContext<"/profile-picture/:filename">,
) => {
	try {
		let filename = ctx.params.filename;
		log(`getProfilePicture requested: ${filename}, correlationID=${ctx.state.correlationID}`);

		if (!filename) {
			log_error("No filename provided", ctx.state.correlationID);
			ctx.response.status = 400;
			ctx.response.body = { error: "Invalid filename." };
			return;
		}

		// Strip query parameters to handle cache-busting
		if (filename.includes("?")) {
			log(`Stripping query params from filename: ${filename}`);
			filename = filename.split("?")[0];
		}

		// If filename is 'placeholder', serve the placeholder image directly
		if (filename === "placeholder") {
			const placeholderPath = "./placeholder.png";
			try {
				const file = await Deno.readFile(placeholderPath);
				ctx.response.headers.set("Content-Type", "image/png");
				ctx.response.body = file;
				return;
			} catch (err) {
				log_error(
					`Placeholder file not found: ${placeholderPath}`,
					ctx.state.correlationID,
					err,
				);
				ctx.response.status = 500;
				ctx.response.body = { error: "Internal server error." };
				return;
			}
		}

		const filePath = `${UPLOAD_DIR}/${filename}`;
		log(`Resolved file path: ${filePath}`);

		try {
			const file = await Deno.readFile(filePath);
			const ext = filename.split(".").pop()?.toLowerCase();

			let contentType = "image/jpeg";
			if (ext === "png") contentType = "image/png";
			else if (ext === "webp") contentType = "image/webp";
			else if (ext === "gif") contentType = "image/gif";
			else if (ext === "jfif" || ext === "jiff") {
				contentType = "image/jpeg";
			}

			log(`Serving file ${filename} with Content-Type ${contentType}`);
			ctx.response.headers.set("Content-Type", contentType);
			ctx.response.body = file;
		} catch (err) {
			log_error(
				`File not found: ${filePath}`,
				ctx.state.correlationID,
				err,
			);
			ctx.response.status = 404;
			ctx.response.body = { error: "Profile picture not found." };
		}
	} catch (err) {
		log_error(
			"getProfilePicture unexpected error: " + String(err),
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Internal server error." };
	}
};
