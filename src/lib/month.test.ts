import { describe, it, expect } from 'vitest';
import {
	addMonths,
	currentMonth,
	daysRemainingInMonth,
	isMonth,
	monthLabel,
	monthOf,
} from './month';

describe('isMonth', () => {
	it('accepts a well-formed month', () => {
		expect(isMonth('2026-07')).toBe(true);
	});
	it('rejects a bad month number', () => {
		expect(isMonth('2026-13')).toBe(false);
		expect(isMonth('2026-00')).toBe(false);
	});
	it('rejects a full date', () => {
		expect(isMonth('2026-07-01')).toBe(false);
	});
});

describe('currentMonth', () => {
	it('formats the given date as YYYY-MM', () => {
		expect(currentMonth(new Date(2026, 0, 15))).toBe('2026-01');
		expect(currentMonth(new Date(2026, 11, 1))).toBe('2026-12');
	});
});

describe('monthOf', () => {
	it('takes the month from a posted date', () => {
		expect(monthOf('2026-07-14')).toBe('2026-07');
	});
});

describe('addMonths', () => {
	it('steps forward within a year', () => {
		expect(addMonths('2026-07', 1)).toBe('2026-08');
	});
	it('rolls over the year boundary', () => {
		expect(addMonths('2026-12', 1)).toBe('2027-01');
	});
	it('steps backward across the year boundary', () => {
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});
	it('handles multi-year deltas in both directions', () => {
		expect(addMonths('2026-07', 18)).toBe('2028-01');
		expect(addMonths('2026-07', -18)).toBe('2025-01');
	});
	it('rejects a malformed month', () => {
		expect(() => addMonths('nope', 1)).toThrow();
	});
});

describe('monthLabel', () => {
	it('renders a short human label', () => {
		expect(monthLabel('2026-08')).toBe('Aug 2026');
	});
	it('rejects a malformed month', () => {
		expect(() => monthLabel('2026-99')).toThrow();
	});
});

describe('daysRemainingInMonth', () => {
	it('counts the days left', () => {
		expect(daysRemainingInMonth(new Date(2026, 6, 20))).toBe(11);
	});
	it('is zero on the last day', () => {
		expect(daysRemainingInMonth(new Date(2026, 6, 31))).toBe(0);
	});
	it('handles a leap February', () => {
		expect(daysRemainingInMonth(new Date(2028, 1, 1))).toBe(28);
	});
});
