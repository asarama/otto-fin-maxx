import { describe, it, expect } from 'vitest';
import { resolveVendor, type VendorSpec } from './vendors';

const vendors: VendorSpec[] = [
	{ id: 'v1', name: 'Amazon', aliases: ['AMZN MKTP US', 'AMAZON.COM'] },
	{ id: 'v2', name: 'Uber', aliases: ['UBER *TRIP'] },
];

describe('resolveVendor', () => {
	it('matches the main name case-insensitively', () => {
		expect(resolveVendor('amazon', vendors)).toBe('v1');
	});
	it('matches an alias', () => {
		expect(resolveVendor('AMZN MKTP US', vendors)).toBe('v1');
		expect(resolveVendor('UBER *TRIP', vendors)).toBe('v2');
	});
	it('collapses whitespace before matching', () => {
		expect(resolveVendor('  UBER   *TRIP  ', vendors)).toBe('v2');
	});
	it('returns null when nothing matches', () => {
		expect(resolveVendor('SOME OTHER STORE', vendors)).toBeNull();
	});
});
