export type AmountOperator = 'any' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

export interface RuleSpec {
  id: string;
  descriptionMatcher: string | null;
  amountOperator: AmountOperator;
  amountCents: number | null;
  vendorIds: string[];
}

export interface TransactionCandidate {
  description: string;
  vendorId: string | null;
  amountCents: number;
}

export function ruleMatches(rule: RuleSpec, tx: TransactionCandidate): boolean {
  if (rule.descriptionMatcher) {
    let re: RegExp;
    try {
      re = new RegExp(rule.descriptionMatcher, 'i');
    } catch {
      return false;
    }
    if (!re.test(tx.description)) return false;
  }
  if (rule.vendorIds.length > 0) {
    if (!tx.vendorId || !rule.vendorIds.includes(tx.vendorId)) return false;
  }
  if (rule.amountOperator !== 'any' && rule.amountCents !== null) {
    const a = Math.abs(tx.amountCents);
    switch (rule.amountOperator) {
      case 'eq': if (a !== rule.amountCents) return false; break;
      case 'lt': if (!(a < rule.amountCents)) return false; break;
      case 'lte': if (!(a <= rule.amountCents)) return false; break;
      case 'gt': if (!(a > rule.amountCents)) return false; break;
      case 'gte': if (!(a >= rule.amountCents)) return false; break;
    }
  }
  return true;
}

export function firstMatchingRule<T extends RuleSpec>(rules: T[], tx: TransactionCandidate): T | null {
  for (const rule of rules) {
    if (ruleMatches(rule, tx)) return rule;
  }
  return null;
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
