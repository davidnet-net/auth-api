import { Client } from "https://deno.land/x/mysql/mod.ts";

/**
 * Checks if two users are connected (accepted friends).
 * @param client MySQL client
 * @param userId Requesting user's ID
 * @param targetId Target user's ID
 * @returns true if they are friends, false otherwise
 */
export async function isConnection(
	client: Client,
	userId: number,
	targetId: number,
): Promise<boolean> {
	if (userId === targetId) return true; // self always counts

	const result = await client.query(
		`SELECT 1
         FROM connections 
         WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
           AND status = 'accepted'
         LIMIT 1`,
		[userId, targetId, targetId, userId],
	);

	return result.length > 0;
}
