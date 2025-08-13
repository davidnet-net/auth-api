import { Client } from "https://deno.land/x/mysql/mod.ts";
import { log, log_error } from "./logger.ts";

let dbClient: Client | null = null;
let initialConnectionSucceeded = false;

async function connectToDB(): Promise<Client | null> {
	try {
		const client = await new Client().connect({
			hostname: Deno.env.get("DA_DB_HOST"),
			username: Deno.env.get("DA_DB_USER"),
			password: Deno.env.get("DA_DB_PASS"),
			db: Deno.env.get("DA_DB_NAME"),
			port: 3306,
		});

		if (await ensureDBStructure(client)) {
			log("Initial Connection SUCCESS");
			initialConnectionSucceeded = true;
			dbClient = client;
			return client;
		} else {
			throw ("Invalid Initial DB connection? (Maybe DB is starting?)");
		}
	} catch (err) {
		log_error("FAILED TO CONNECT TO DB!");
		log_error(err); // Log error details
		return null;
	}
}

/**
 * Safely gets a healthy DB client.
 * If already connected, returns the existing one.
 * If not, attempts to reconnect.
 */
export async function getDBClient(): Promise<Client | null> {
	// If we already have a client, test it
	if (dbClient) {
		try {
			await dbClient.execute("SELECT 1");
			return dbClient;
		} catch (err) {
			log_error("DB client exists but failed SELECT 1 — reconnecting.");
			log_error(err);
			// Try to reconnect
			dbClient = null;
		}
	}

	if (!initialConnectionSucceeded || !dbClient) {
		log("Trying inital connection");
		const client = await connectToDB();
		return client;
	}

	return dbClient;
}

//? DB initlization
async function ensureDBStructure(client: Client) {
	log("Ensuring DB Structure.");
	try {
		await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(20) NOT NULL UNIQUE,
      password CHAR(60) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      email_verified BOOLEAN DEFAULT FALSE,
      email_verification_token CHAR(64),
      email_verification_expires DATETIME NOT NULL,
      twofa_email_enabled BOOLEAN DEFAULT FALSE,
      twofa_totp_enabled BOOLEAN DEFAULT FALSE,
      twofa_totp_seed VARCHAR(255),
      password_reset_token VARCHAR(60) UNIQUE,
      password_reset_token_expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
      display_name VARCHAR(20) NOT NULL,
      avatar_url VARCHAR(255) NOT NULL,
      description TEXT
    )
  `);

		await client.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      url VARCHAR(2048) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      name VARCHAR(2048),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

		await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      log VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

		await client.execute(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      hash VARCHAR(255) NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

		await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      user_agent VARCHAR(255),
      ip_address VARCHAR(45) NOT NULL,
      jwt_id VARCHAR(36) NOT NULL UNIQUE,
      revoked BOOLEAN DEFAULT FALSE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
		log("Ensured DB Structure.");
		return true;
	} catch (err) {
		log_error("DB structure creation failed!");
		log_error(err);
		return false;
	}
}

export default getDBClient;
