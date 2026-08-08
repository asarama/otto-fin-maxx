export const CATEGORY_COUNT = 3;

export type CategoryIndex = 1 | 2 | 3;
export type BudgetHealth = 'none' | 'ok' | 'near' | 'over';

export function categoryIndex(name: string): CategoryIndex {
	let hash = 0;
	for (const char of name) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	}
	return ((hash % CATEGORY_COUNT) + 1) as CategoryIndex;
}

export function budgetHealth(spentCents: number, limitCents: number): BudgetHealth {
	if (limitCents <= 0) return 'none';
	if (spentCents > limitCents) return 'over';
	if (spentCents >= limitCents * 0.8) return 'near';
	return 'ok';
}
