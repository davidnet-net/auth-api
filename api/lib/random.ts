/**
 * @returns an 64 charcters long token
 * (Antropy 256 bits )
 */
export function randomHex(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
