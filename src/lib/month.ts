const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];

export function isMonth(value: string): boolean {
	return MONTH_RE.test(value);
}

export function currentMonth(now: Date = new Date()): string {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthOf(postedDate: string): string {
	return postedDate.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
	if (!isMonth(month)) throw new Error(`Invalid month: ${month}`);
	const year = Number(month.slice(0, 4));
	const index = Number(month.slice(5, 7)) - 1 + delta;
	const nextYear = year + Math.floor(index / 12);
	const nextIndex = ((index % 12) + 12) % 12;
	return `${nextYear}-${String(nextIndex + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
	if (!isMonth(month)) throw new Error(`Invalid month: ${month}`);
	return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function daysRemainingInMonth(now: Date = new Date()): number {
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
	return lastDay - now.getDate();
}
