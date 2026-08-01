import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { ensureBudgetCategoryMonth } from '$lib/server/repos/budgets';
import { countUnreviewed } from '$lib/server/repos/transactions';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async () => {
  const conn = await getDb();
  const month = currentMonth();

  const cats = await conn.runAndReadAll('SELECT id FROM budget_categories');
  for (const row of cats.getRowObjects()) {
    await ensureBudgetCategoryMonth(conn, String(row.id), month);
  }

  const reader = await conn.runAndReadAll(
    `SELECT bcm.id, bcm.amount_cents,
            bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
            COALESCE(SUM(-tx.amount_cents), 0) AS spent_cents
     FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id
     JOIN budgets b ON b.id = bc.budget_id
     JOIN owners o ON o.id = b.owner_id
     LEFT JOIN account_transactions tx ON tx.budget_category_month_id = bcm.id
     WHERE bcm.month = ?
     GROUP BY bcm.id, bcm.amount_cents, bc.name, b.name, o.name
     ORDER BY spent_cents - bcm.amount_cents DESC`,
    [month]
  );

  const categories = reader.getRowObjects().map((r) => ({
    id: String(r.id),
    categoryName: String(r.category_name),
    budgetName: String(r.budget_name),
    ownerName: String(r.owner_name),
    amountCents: Number(r.amount_cents),
    spentCents: Number(r.spent_cents)
  }));

  const unreviewed = await countUnreviewed(conn);
  const totalLimit = categories.reduce((sum, r) => sum + r.amountCents, 0);
  const totalSpent = categories.reduce((sum, r) => sum + r.spentCents, 0);

  return { month, categories, unreviewed, totalLimit, totalSpent };
};
