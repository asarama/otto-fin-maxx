<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import { monthLabel } from '$lib/month';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import MoneyText from '$lib/components/MoneyText.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	let { data } = $props();

	let ownerId = $state('');
	let budgetName = $state('');
	let categoryBudgetId = $state('');
	let categoryName = $state('');
	let categoryLimit = $state('');

	const totals = $derived(
		data.months.reduce(
			(acc, m) => ({
				thisMonthSpentCents: acc.thisMonthSpentCents + m.thisMonthSpentCents,
				thisMonthAmountCents: acc.thisMonthAmountCents + m.thisMonthAmountCents,
				lastMonthSpentCents: acc.lastMonthSpentCents + m.spentCents,
				overCents: acc.overCents + Math.max(0, m.spentCents - m.amountCents),
			}),
			{
				thisMonthSpentCents: 0,
				thisMonthAmountCents: 0,
				lastMonthSpentCents: 0,
				overCents: 0,
			}
		)
	);

	const thisMonthRemainingCents = $derived(
		totals.thisMonthAmountCents - totals.thisMonthSpentCents
	);

	async function addBudget(e: SubmitEvent) {
		e.preventDefault();
		await fetch('/api/budgets', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ownerId, name: budgetName }),
		});
		budgetName = '';
		invalidateAll();
	}

	async function addCategory(e: SubmitEvent) {
		e.preventDefault();
		await fetch(`/api/budgets/${categoryBudgetId}/categories`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: categoryName, monthlyLimitCents: categoryLimit }),
		});
		categoryName = '';
		categoryLimit = '';
		invalidateAll();
	}

	async function updateLimit(catId: string, monthlyLimitCents: string) {
		await fetch(`/api/budget-categories/${catId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ monthlyLimitCents }),
		});
		invalidateAll();
	}

	async function removeCategory(catId: string) {
		await fetch(`/api/budget-categories/${catId}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<PageHeader title="Budgets" subtitle={`${monthLabel(data.month)} · previous month`} />

<div class="stats">
	<Card>
		<StatTile label="Spent this month" sub={monthLabel(data.thisMonth)}>
			<MoneyText cents={totals.thisMonthSpentCents} tone="spend" size="xl" />
		</StatTile>
	</Card>
	<Card>
		<StatTile label="Remaining this month" sub={monthLabel(data.thisMonth)}>
			<MoneyText cents={thisMonthRemainingCents} size="xl" />
		</StatTile>
	</Card>
	<Card>
		<StatTile label="Spent last month" sub={monthLabel(data.month)}>
			<MoneyText cents={totals.lastMonthSpentCents} tone="spend" size="xl" />
		</StatTile>
	</Card>
	<Card>
		<StatTile label="Over last month" sub={monthLabel(data.month)}>
			<MoneyText cents={totals.overCents} size="xl" />
		</StatTile>
	</Card>
</div>

<h2>Add budget</h2>
<form class="form-row" onsubmit={addBudget}>
	<select class="control" bind:value={ownerId}>
		<option value="" disabled>Owner</option>
		{#each data.owners as owner (owner.id)}
			<option value={owner.id}>{owner.name}</option>
		{/each}
	</select>
	<input class="control" bind:value={budgetName} placeholder="Budget name" />
	<Button type="submit" variant="primary">Add budget</Button>
</form>

<h2>Add category</h2>
<form class="form-row" onsubmit={addCategory}>
	<select class="control" bind:value={categoryBudgetId}>
		<option value="" disabled>Budget</option>
		{#each data.budgets as budget (budget.id)}
			<option value={budget.id}>{budget.name}</option>
		{/each}
	</select>
	<input class="control" bind:value={categoryName} placeholder="Category name" />
	<input
		class="control numeric"
		bind:value={categoryLimit}
		placeholder="Monthly limit ($)"
		type="number"
		step="0.01"
	/>
	<Button type="submit" variant="primary">Add category</Button>
</form>

<h2>Categories</h2>
<table>
	<thead>
		<tr>
			<th rowspan="2">Owner</th>
			<th rowspan="2">Budget</th>
			<th rowspan="2">Category</th>
			<th rowspan="2" class="center num">Limit</th>
			<th colspan="2" class="center this-month">This month</th>
			<th colspan="2" class="center last-month">Last month</th>
			<th rowspan="2"></th>
		</tr>
		<tr>
			<th class="center num this-month">Spent</th>
			<th class="center num this-month">Remaining</th>
			<th class="center num last-month">Spent</th>
			<th class="center num last-month">Over</th>
		</tr>
	</thead>
	<tbody>
		{#each data.months as m (m.id)}
			<tr>
				<td>{m.ownerName}</td>
				<td>{m.budgetName}</td>
				<td>{m.categoryName}</td>
				<td class="end num">
					<input
						class="control numeric limit"
						type="number"
						step="0.01"
						value={centsToDollars(m.thisMonthAmountCents).replace(/[$,]/g, '')}
						onchange={(e) =>
							updateLimit(m.budgetCategoryId, (e.currentTarget as HTMLInputElement).value)}
					/>
				</td>
				<td class="end num this-month">{centsToDollars(m.thisMonthSpentCents)}</td>
				<td class="end num this-month"
					>{centsToDollars(m.thisMonthAmountCents - m.thisMonthSpentCents)}</td
				>
				<td class="end num last-month">{centsToDollars(m.spentCents)}</td>
				<td class="end num last-month"
					>{centsToDollars(Math.max(0, m.spentCents - m.amountCents))}</td
				>
				<td class="end">
					<ConfirmDelete
						label="Delete category {m.categoryName}"
						confirmLabel="Delete and unassign transactions"
						onconfirm={() => removeCategory(m.budgetCategoryId)}
					/>
				</td>
			</tr>
		{/each}
	</tbody>
	{#if data.months.length > 0}
		<tfoot>
			<tr>
				<td colspan="3">Total &middot; {data.months.length} categories</td>
				<td class="end num">{centsToDollars(totals.thisMonthAmountCents)}</td>
				<td class="end num this-month">{centsToDollars(totals.thisMonthSpentCents)}</td>
				<td class="end num this-month">{centsToDollars(thisMonthRemainingCents)}</td>
				<td class="end num last-month">{centsToDollars(totals.lastMonthSpentCents)}</td>
				<td class="end num last-month">{centsToDollars(totals.overCents)}</td>
				<td></td>
			</tr>
		</tfoot>
	{/if}
</table>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	h2 {
		margin-top: var(--space-6);
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
	}

	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		text-align: left;
		padding: var(--space-2) var(--space-3);
	}

	td {
		padding: var(--space-2) var(--space-3);
		vertical-align: middle;
	}

	.end {
		text-align: right;
	}

	.center {
		text-align: center;
	}

	.num {
		width: 11ch;
		min-width: 11ch;
		font-variant-numeric: tabular-nums;
	}

	.this-month {
		background: var(--alpha-accent-10);
	}

	.last-month {
		background: var(--alpha-ink-10);
	}

	.limit {
		width: 10ch;
	}

	tfoot td {
		font-weight: 700;
		border-top: 1px solid var(--border-default);
	}
</style>
