import { describe, it, expect } from 'vitest';
import { resolveVendor, cleanMerchantName, type VendorSpec } from './vendors';

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

describe('cleanMerchantName', () => {
	it('strips trailing store numbers', () => {
		expect(cleanMerchantName('TRADER JOE S #078')).toBe('Trader Joe S');
		expect(cleanMerchantName('SAFEWAY #1507')).toBe('Safeway');
	});
	it('strips trailing ref codes that contain a digit', () => {
		expect(cleanMerchantName('AMAZON MKTPL*567RG60C1')).toBe('Amazon Mktpl');
		expect(cleanMerchantName('AMAZON RETA* 5N60O69A2')).toBe('Amazon Reta');
		expect(cleanMerchantName('LYFT   *1 RIDE 08-02')).toBe('Lyft');
	});
	it('keeps word-y star suffixes intact', () => {
		expect(cleanMerchantName('UBER   *TRIP')).toBe('Uber *Trip');
		expect(cleanMerchantName('SQ *KANTINE')).toBe('Sq *Kantine');
	});
	it('title-cases plain names and normalizes whitespace and underscores', () => {
		expect(cleanMerchantName('CAPITAL ONE MOBILE PYMT')).toBe('Capital One Mobile Pymt');
		expect(cleanMerchantName('IKEA SAN FRAN')).toBe('Ikea San Fran');
		expect(cleanMerchantName('Vagaro_*Hair By Eva')).toBe('Vagaro *Hair By Eva');
	});
	it('does not strip a trailing possessive S', () => {
		expect(cleanMerchantName('WHOLE FOODS')).toBe('Whole Foods');
	});
	it('returns empty string when only a store number remains', () => {
		expect(cleanMerchantName('#078')).toBe('');
	});
});
