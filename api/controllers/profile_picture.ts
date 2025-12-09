import { RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { log, log_error } from "../lib/logger.ts";

const UPLOAD_DIR = "profile_pictures";
await Deno.mkdir(UPLOAD_DIR, { recursive: true });

const PLACEHOLDER_URL = "https://auth.davidnet.net/profile-picture/placeholder";

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
export const uploadProfilePicture = async (
    ctx: RouterContext<"/profile-picture">,
) => {
    const requestId = ctx.state.correlationID || crypto.randomUUID();
    log(`[${requestId}] Starting upload request...`);

    try {
        // --- 1. JWT Verification ---
        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            log(`[${requestId}] No auth header.`);
            ctx.response.status = 401;
            ctx.response.body = { error: "Missing authorization." };
            return;
        }

        let payload;
        try {
            payload = await verifyJWT(authHeader.slice(7));
        } catch (e) {
            log(`[${requestId}] JWT Invalid: ${e}`);
            ctx.response.status = 401;
            ctx.response.body = { error: "Invalid token." };
            return;
        }
        const userId = Number(payload.userId);
        
        // --- 2. Parse Body (The likely hang spot) ---
        log(`[${requestId}] User ${userId} authenticated. Starting body parse...`);
        
        let form;
        try {
            // Check Content-Type first
            const type = ctx.request.headers.get("content-type");
            log(`[${requestId}] Content-Type: ${type}`);
            
            const body = ctx.request.body({ type: "form-data" });
            
            // Log before the "Await" that might be hanging
            log(`[${requestId}] Reading stream (max 25MB)...`);
            
            // Oak saves large files to a temporary folder automatically here
            form = await body.value.read({ maxSize: 25_000_000 });
            
            log(`[${requestId}] Stream read complete.`);
        } catch (err) {
            log_error(`[${requestId}] Upload failed during read: ${err}`);
            ctx.response.status = 400;
            ctx.response.body = { error: "File too large or upload interrupted." };
            return;
        }

        // --- 3. Handle File (Memory vs Disk) ---
        const file = form.files?.find((f) => f.name === "file");
        
        if (!file) {
            log(`[${requestId}] No file found in form data.`);
            ctx.response.status = 400;
            ctx.response.body = { error: "Missing image file." };
            return;
        }

        log(`[${requestId}] File received. Memory: ${!!file.content}, DiskPath: ${file.filename}`);

        // FIX: Handle large files (which Oak puts in .filename, not .content)
        let fileContent: Uint8Array;

        if (file.content) {
            // Small files are kept in memory
            fileContent = file.content;
        } else if (file.filename) {
            // Large files are saved to a temp path
            log(`[${requestId}] Reading from temp path: ${file.filename}`);
            fileContent = await Deno.readFile(file.filename);
        } else {
            log(`[${requestId}] File object is empty/invalid.`);
            ctx.response.status = 400;
            ctx.response.body = { error: "Upload failed." };
            return;
        }

        // --- 4. Validation ---
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        const mime = (file.contentType || "").toLowerCase();
        
        if (!validTypes.some(t => mime.includes(t))) {
            log(`[${requestId}] Invalid mime: ${mime}`);
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid file type." };
            return;
        }

        // Determine extension
        let ext = "jpg";
        if (mime.includes("png")) ext = "png";
        else if (mime.includes("webp")) ext = "webp";
        else if (mime.includes("gif")) ext = "gif";

        // --- 5. Save to Final Destination ---
        const fileName = `${userId}_${crypto.randomUUID()}.${ext}`;
        const filePath = `${UPLOAD_DIR}/${fileName}`;
        
        log(`[${requestId}] Writing to final path: ${filePath}`);
        await Deno.writeFile(filePath, fileContent);

        // Cleanup temp file if it exists
        if (file.filename) {
            try { await Deno.remove(file.filename); } catch {}
        }

        // --- 6. DB Update ---
        const client = await getDBClient();
        if (client) {
            const baseUrl = Deno.env.get("DA_ISPROD") === "true" 
                ? "https://auth.davidnet.net" 
                : "http://localhost:1000";
            
            const publicUrl = `${baseUrl}/profile-picture/${encodeURIComponent(fileName)}?v=${Date.now()}`;
            
            await delete_profile_picture(userId, false); // clear old
            await client.execute(`UPDATE users SET avatar_url = ? WHERE id = ?`, [publicUrl, userId]);
            
            log(`[${requestId}] Success.`);
            ctx.response.status = 200;
            ctx.response.body = { message: "Updated", avatar_url: publicUrl };
        } else {
             ctx.response.status = 500;
             ctx.response.body = { error: "DB Error" };
        }

    } catch (err) {
        log_error(`[${requestId}] CRITICAL ERROR: ${err}`);
        ctx.response.status = 500;
        ctx.response.body = { error: "Server error." };
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
