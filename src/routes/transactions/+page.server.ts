import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listTransactions } from '$lib/server/repos/transactions';
import { listAccounts } from '$lib/server/repos/accounts';
import { listVendors } from '$lib/server/repos/vendors';
import { listBudgetCategories } from '$lib/server/repos/budgets';

export const load: PageServerLoad = async ({ url }) => {
	const conn = await getDb();
	const filters = {
		accountId: url.searchParams.get('account') ?? undefined,
		month: url.searchParams.get('month') ?? undefined,
		status: url.searchParams.get('status') ?? undefined,
		search: url.searchParams.get('search') ?? undefined,
	};

	const txs = await listTransactions(conn, filters);
	const accounts = await listAccounts(conn);
	const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
	const vendors = new Map((await listVendors(conn)).map((v) => [v.id, v.name]));
	const monthCats = await conn.runAndReadAll(
		`SELECT bcm.id, bc.name AS category_name FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id`
	);
	const categories = new Map(
		monthCats.getRowObjects().map((r) => [String(r.id), String(r.category_name)])
	);

	return {
		filters,
		accounts,
		budgetCategories: await listBudgetCategories(conn),
		transactions: txs.map((t) => ({
			...t,
			accountName: accountNames.get(t.accountId) ?? '?',
			vendorName: t.vendorId ? (vendors.get(t.vendorId) ?? '?') : null,
			categoryName: t.budgetCategoryMonthId
				? (categories.get(t.budgetCategoryMonthId) ?? '?')
				: null,
		})),
	};
};
