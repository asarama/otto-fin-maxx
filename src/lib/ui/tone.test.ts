import { describe, it, expect } from 'vitest';
import { budgetHealth, categoryIndex, CATEGORY_COUNT } from './tone';

describe('categoryIndex', () => {
	it('is deterministic for the same name', () => {
		expect(categoryIndex('Groceries')).toBe(categoryIndex('Groceries'));
	});
	it('stays inside the rotation, never reaching the reserved income index', () => {
		const names = ['Groceries', 'Gaming', 'Dining out', 'Transport', 'General', 'Rent', 'Pets'];
		for (const name of names) {
			const index = categoryIndex(name);
			expect(index).toBeGreaterThanOrEqual(1);
			expect(index).toBeLessThanOrEqual(CATEGORY_COUNT);
		}
	});
	it('handles an empty name', () => {
		expect(categoryIndex('')).toBe(1);
	});
	it('spreads a realistic set across more than one tone', () => {
		const indexes = new Set(['Groceries', 'Gaming', 'Dining out'].map(categoryIndex));
		expect(indexes.size).toBeGreaterThan(1);
	});
});

describe('budgetHealth', () => {
	it('reports no limit when the limit is zero or negative', () => {
		expect(budgetHealth(500, 0)).toBe('none');
		expect(budgetHealth(0, -100)).toBe('none');
	});
	it('reports ok below eighty percent', () => {
		expect(budgetHealth(7900, 10000)).toBe('ok');
	});
	it('reports near from eighty percent up to the limit', () => {
		expect(budgetHealth(8000, 10000)).toBe('near');
		expect(budgetHealth(10000, 10000)).toBe('near');
	});
	it('reports over only past the limit', () => {
		expect(budgetHealth(10001, 10000)).toBe('over');
	});
});
