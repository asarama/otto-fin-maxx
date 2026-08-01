import { describe, it, expect } from 'vitest';
import { externalId } from './externalId';

describe('externalId', () => {
  const base = { accountId: 'a', postedDate: '2026-07-01', description: 'COFFEE', rawVendorName: 'COFFEE', amountCents: -500 };
  it('is deterministic', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)).toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
  it('differs when amount changes', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, -600)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, -500)
    );
  });
  it('differs when the raw vendor name changes', () => {
    expect(externalId(base.accountId, base.postedDate, base.description, 'AMZN MKTP US', base.amountCents)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
  it('differs across accounts', () => {
    expect(externalId('b', base.postedDate, base.description, base.rawVendorName, base.amountCents)).not.toBe(
      externalId(base.accountId, base.postedDate, base.description, base.rawVendorName, base.amountCents)
    );
  });
});
