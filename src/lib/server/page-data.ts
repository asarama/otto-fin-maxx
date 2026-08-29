import type { DuckDBConnection } from '@duckdb/node-api';
import { addMonths, currentMonth, isMonth } from '$lib/month';
import {
	ensureBudgetCategoryMonth,
	listBudgetCategories,
	listBudgets,
	listOwners,
} from './repos/budgets';
import {
	countUnreviewed,
	getUnreviewed,
	listTransactions,
	type TransactionFilters,
} from './repos/transactions';
import { listAccounts } from './repos/accounts';
import { listVendors } from './repos/vendors';

export interface DashboardData {
	month: string;
	categories: {
		id: string;
		budgetCategoryId: string;
		categoryName: string;
		budgetName: string;
		ownerName: string;
		amountCents: number;
		spentCents: number;
	}[];
	unreviewed: number;
	totalLimit: number;
	totalSpent: number;
}

async function categoryMonthRows(conn: DuckDBConnection, month: string) {
	const reader = await conn.runAndReadAll(
		`SELECT bcm.id, bcm.budget_category_id, bcm.amount_cents,
            bc.name AS category_name, b.name AS budget_name, o.name AS owner_name,
            COALESCE(SUM(-tx.amount_cents), 0) AS spent_cents
     FROM budget_category_months bcm
     JOIN budget_categories bc ON bc.id = bcm.budget_category_id
     JOIN budgets b ON b.id = bc.budget_id
     JOIN owners o ON o.id = b.owner_id
     LEFT JOIN account_transactions tx ON tx.budget_category_month_id = bcm.id
     WHERE bcm.month = ?
     GROUP BY bcm.id, bcm.budget_category_id, bcm.amount_cents, bc.name, b.name, o.name`,
		[month]
	);
	return reader.getRowObjects().map((r) => ({
		id: String(r.id),
		budgetCategoryId: String(r.budget_category_id),
		categoryName: String(r.category_name),
		budgetName: String(r.budget_name),
		ownerName: String(r.owner_name),
		amountCents: Number(r.amount_cents),
		spentCents: Number(r.spent_cents),
	}));
}

export async function dashboardData(
	conn: DuckDBConnection,
	requestedMonth?: string | null
): Promise<DashboardData> {
	const month = requestedMonth && isMonth(requestedMonth) ? requestedMonth : currentMonth();

	const cats = await conn.runAndReadAll('SELECT id FROM budget_categories');
	for (const row of cats.getRowObjects()) {
		await ensureBudgetCategoryMonth(conn, String(row.id), month);
	}

	const categories = await categoryMonthRows(conn, month);
	categories.sort((a, b) => b.spentCents - b.amountCents - (a.spentCents - a.amountCents));

	const unreviewed = await countUnreviewed(conn);
	const totalLimit = categories.reduce((sum, r) => sum + r.amountCents, 0);
	const totalSpent = categories.reduce((sum, r) => sum + r.spentCents, 0);

	return { month, categories, unreviewed, totalLimit, totalSpent };
}

export interface BudgetsData {
	month: string;
	thisMonth: string;
	owners: { id: string; name: string }[];
	budgets: { id: string; name: string; owner_id: string }[];
	categories: { id: string; budget_id: string; name: string; monthly_limit_cents: number }[];
	months: {
		id: string;
		budgetCategoryId: string;
		amountCents: number;
		spentCents: number;
		categoryName: string;
		budgetName: string;
		ownerName: string;
		thisMonthAmountCents: number;
		thisMonthSpentCents: number;
	}[];
}

export async function budgetsData(conn: DuckDBConnection): Promise<BudgetsData> {
	const month = addMonths(currentMonth(), -1);
	const thisMonth = currentMonth();

	const categories = await listBudgetCategories(conn);
	for (const cat of categories) {
		await ensureBudgetCategoryMonth(conn, cat.id, month);
		await ensureBudgetCategoryMonth(conn, cat.id, thisMonth);
	}

	const lastRows = await categoryMonthRows(conn, month);
	lastRows.sort(
		(a, b) =>
			a.ownerName.localeCompare(b.ownerName) ||
			a.budgetName.localeCompare(b.budgetName) ||
			a.categoryName.localeCompare(b.categoryName)
	);
	const thisRows = new Map(
		(await categoryMonthRows(conn, thisMonth)).map((r) => [r.budgetCategoryId, r])
	);
	const months = lastRows.map((r) => {
		const t = thisRows.get(r.budgetCategoryId);
		return {
			...r,
			thisMonthAmountCents: t?.amountCents ?? 0,
			thisMonthSpentCents: t?.spentCents ?? 0,
		};
	});

	return {
		month,
		thisMonth,
		owners: await listOwners(conn),
		budgets: await listBudgets(conn),
		categories,
		months,
	};
}

export interface TransactionsPageData {
	filters: TransactionFilters;
	accounts: Awaited<ReturnType<typeof listAccounts>>;
	budgetCategories: Awaited<ReturnType<typeof listBudgetCategories>>;
	transactions: (Awaited<ReturnType<typeof listTransactions>>[number] & {
		accountName: string;
		vendorName: string | null;
		categoryName: string | null;
	})[];
}

export async function transactionsData(
	conn: DuckDBConnection,
	filters: TransactionFilters
): Promise<TransactionsPageData> {
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
}

export interface ReviewData {
	transactions: (Awaited<ReturnType<typeof getUnreviewed>>[number] & {
		accountName: string;
		vendorName: string | null;
	})[];
	vendors: Awaited<ReturnType<typeof listVendors>>;
	categories: (Awaited<ReturnType<typeof listBudgetCategories>>[number] & {
		budgetName: string;
		ownerName: string;
	})[];
}

export async function reviewData(conn: DuckDBConnection): Promise<ReviewData> {
	const txs = await getUnreviewed(conn);
	const accounts = new Map((await listAccounts(conn)).map((a) => [a.id, a.name]));
	const vendors = await listVendors(conn);
	const vendorNames = new Map(vendors.map((v) => [v.id, v.name]));
	const budgets = new Map((await listBudgets(conn)).map((b) => [b.id, b]));
	const owners = new Map((await listOwners(conn)).map((o) => [o.id, o.name]));
	return {
		transactions: txs.map((t) => ({
			...t,
			accountName: accounts.get(t.accountId) ?? '?',
			vendorName: t.vendorId ? (vendorNames.get(t.vendorId) ?? null) : null,
		})),
		vendors,
		categories: (await listBudgetCategories(conn)).map((c) => {
			const budget = budgets.get(c.budget_id);
			return {
				...c,
				budgetName: budget?.name ?? '?',
				ownerName: budget ? (owners.get(budget.owner_id) ?? '?') : '?',
			};
		}),
	};
}
