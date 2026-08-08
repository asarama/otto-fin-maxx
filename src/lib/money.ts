export function parseAmountToCents(input: string): number {
	const cleaned = input.replace(/[,$\s]/g, '');
	if (!cleaned) throw new Error(`Empty amount: ${input}`);
	const value = Number(cleaned);
	if (Number.isNaN(value)) throw new Error(`Invalid amount: ${input}`);
	return Math.round(value * 100);
}

export function dollarsToCents(input: string): number | null {
	const cleaned = input.replace(/[,$\s]/g, '');
	if (!cleaned) return null;
	const value = Number(cleaned);
	if (Number.isNaN(value)) throw new Error(`Invalid amount: ${input}`);
	return Math.sign(value) * Math.round(Math.abs(value) * 100);
}

export function centsToDollarString(cents: number): string {
	return (cents / 100).toFixed(2);
}

export function centsToDollars(cents: number): string {
	const sign = cents < 0 ? '-' : '';
	const abs = (Math.abs(cents) / 100).toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${sign}$${abs}`;
}
