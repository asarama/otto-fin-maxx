import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
  listOwners, listBudgets, listBudgetCategories, ensureBudgetCategoryMonth
} from '$lib/server/repos/budgets';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ url }) => {
  const conn = await getDb();
  const month = url.searchParams.get('month') ?? currentMonth();

  const categories = await listBudgetCategories(conn);
  for (const cat of categories) {
    await ensureBudgetCategoryMonth(conn, cat.id, month);
  }

  const reader = await conn.runAndReadAll(
    `SELECT bcm.id, bcm.budget_category_id, bcm.amount_cents,
            bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
            COALESCE(SUM(-at.amount_cents), 0) AS spent_cents
     FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id
     JOIN budgets b ON b.id = bc.budget_id
     JOIN owners o ON o.id = b.owner_id
     LEFT JOIN account_transactions at ON at.budget_category_month_id = bcm.id
     WHERE bcm.month = ?
     GROUP BY bcm.id, bcm.budget_category_id, bcm.amount_cents, bc.name, b.name, o.name
     ORDER BY o.name, b.name, bc.name`,
    [month]
  );

  return {
    month,
    owners: await listOwners(conn),
    budgets: await listBudgets(conn),
    categories,
    months: reader.getRowObjects().map((r) => ({
      id: String(r.id),
      budgetCategoryId: String(r.budget_category_id),
      amountCents: Number(r.amount_cents),
      spentCents: Number(r.spent_cents),
      categoryName: String(r.category_name),
      budgetName: String(r.budget_name),
      ownerName: String(r.owner_name)
    }))
  };
};
