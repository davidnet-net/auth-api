export function formatDateWithUTCOffset(date: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");

	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());

	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	const seconds = pad(date.getSeconds());

	// timezone offset in minutes
	const offsetMinutes = date.getTimezoneOffset();
	const sign = offsetMinutes > 0 ? "-" : "+";
	const absOffset = Math.abs(offsetMinutes);
	const offsetHours = pad(Math.floor(absOffset / 60));
	const offsetMins = pad(absOffset % 60);

	return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC${sign}${offsetHours}:${offsetMins}`;
}
