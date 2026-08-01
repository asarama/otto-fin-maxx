import { describe, it, expect } from 'vitest';
import { ruleMatches, firstMatchingRule, isValidRegex, type RuleSpec } from './rules';

const tx = { description: 'AMZN MKTP US', vendorId: 'v1', amountCents: -4567 };

describe('ruleMatches', () => {
  it('matches an empty rule', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('matches on description regex', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '^AMZN', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('rejects when description regex does not match', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '^NETFLIX', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
  it('requires one of the listed vendors when present', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: ['v2'] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
  it('compares debit magnitude against lt', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'lt', amountCents: 5000, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
    const big: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'lt', amountCents: 1000, vendorIds: [] };
    expect(ruleMatches(big, tx)).toBe(false);
  });
  it('compares debit magnitude against gte', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: null, amountOperator: 'gte', amountCents: 4567, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(true);
  });
  it('returns false for an invalid regex', () => {
    const rule: RuleSpec = { id: 'r', descriptionMatcher: '(', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(ruleMatches(rule, tx)).toBe(false);
  });
});

describe('firstMatchingRule', () => {
  it('returns the first matching rule by list order', () => {
    const a: RuleSpec = { id: 'a', descriptionMatcher: '^AMZN', amountOperator: 'any', amountCents: null, vendorIds: [] };
    const b: RuleSpec = { id: 'b', descriptionMatcher: null, amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(firstMatchingRule([a, b], tx)?.id).toBe('a');
    expect(firstMatchingRule([b, a], tx)?.id).toBe('b');
  });
  it('returns null when nothing matches', () => {
    const a: RuleSpec = { id: 'a', descriptionMatcher: '^NETFLIX', amountOperator: 'any', amountCents: null, vendorIds: [] };
    expect(firstMatchingRule([a], tx)).toBeNull();
  });
});

describe('isValidRegex', () => {
  it('accepts a valid pattern', () => {
    expect(isValidRegex('^AMZN')).toBe(true);
  });
  it('rejects a malformed pattern', () => {
    expect(isValidRegex('(')).toBe(false);
  });
});
