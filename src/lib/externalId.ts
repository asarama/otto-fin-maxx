import { createHash } from 'node:crypto';

export function externalId(accountId: string, postedDate: string, description: string, rawVendorName: string, amountCents: number): string {
  const raw = [accountId, postedDate, description, rawVendorName, amountCents].join('|');
  return createHash('sha1').update(raw).digest('hex');
}
