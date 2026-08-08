<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	let { data } = $props();

	let ownerId = $state('');
	let budgetName = $state('');
	let categoryBudgetId = $state('');
	let categoryName = $state('');
	let categoryLimit = $state('');
	let month = $state(data.month);

	const totals = $derived(
		data.months.reduce(
			(acc, m) => ({
				spentCents: acc.spentCents + m.spentCents,
				amountCents: acc.amountCents + m.amountCents,
			}),
			{ spentCents: 0, amountCents: 0 }
		)
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

	function changeMonth() {
		const url = new URL(window.location.href);
		url.searchParams.set('month', month);
		window.location.href = url.toString();
	}
</script>

<h1>Budgets</h1>

<form class="form-row" onsubmit={changeMonth}>
	<input class="control" type="month" bind:value={month} />
	<Button type="submit" variant="secondary">View month</Button>
</form>

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
			<th>Owner</th>
			<th>Budget</th>
			<th>Category</th>
			<th class="end">Spent</th>
			<th class="end">Limit</th>
			<th class="end">Remaining This Month</th>
			<th class="end">Set limit</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each data.months as m (m.id)}
			<tr>
				<td>{m.ownerName}</td>
				<td>{m.budgetName}</td>
				<td>{m.categoryName}</td>
				<td class="end">{centsToDollars(m.spentCents)}</td>
				<td class="end">{centsToDollars(m.amountCents)}</td>
				<td class="end">{centsToDollars(m.amountCents - m.spentCents)}</td>
				<td class="end">
					<input
						class="control numeric limit"
						type="number"
						step="0.01"
						value={centsToDollars(m.amountCents).replace(/[$,]/g, '')}
						onchange={(e) =>
							updateLimit(m.budgetCategoryId, (e.currentTarget as HTMLInputElement).value)}
					/>
				</td>
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
				<td class="end">{centsToDollars(totals.spentCents)}</td>
				<td class="end">{centsToDollars(totals.amountCents)}</td>
				<td class="end">{centsToDollars(totals.amountCents - totals.spentCents)}</td>
				<td colspan="2"></td>
			</tr>
		</tfoot>
	{/if}
</table>

<style>
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

	.limit {
		width: 10ch;
	}

	tfoot td {
		font-weight: 700;
		border-top: 1px solid var(--border-default);
	}
</style>
