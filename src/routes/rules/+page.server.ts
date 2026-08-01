import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listRules } from '$lib/server/repos/rules';
import { listBudgetCategories } from '$lib/server/repos/budgets';
import { listVendors } from '$lib/server/repos/vendors';

export const load: PageServerLoad = async () => {
	const conn = await getDb();
	return {
		rules: await listRules(conn),
		categories: await listBudgetCategories(conn),
		vendors: await listVendors(conn),
	};
};
