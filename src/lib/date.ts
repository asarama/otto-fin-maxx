export function normalizeDate(raw: string): string {
	const s = raw.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (m) {
		return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
	}
	throw new Error(`Unrecognized date: ${raw}`);
}
