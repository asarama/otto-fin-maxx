<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	let { data } = $props();

	let ownerId = $state('');
	let budgetName = $state('');
	let categoryBudgetId = $state('');
	let categoryName = $state('');
	let categoryLimit = $state('');
	let month = $state(data.month);

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

	function changeMonth() {
		const url = new URL(window.location.href);
		url.searchParams.set('month', month);
		window.location.href = url.toString();
	}
</script>

<h1>Budgets</h1>

<form onsubmit={changeMonth}>
	<input type="month" bind:value={month} />
	<button type="submit">View month</button>
</form>

<h2>Add budget</h2>
<form onsubmit={addBudget}>
	<select bind:value={ownerId}>
		<option value="" disabled>Owner</option>
		{#each data.owners as owner (owner.id)}
			<option value={owner.id}>{owner.name}</option>
		{/each}
	</select>
	<input bind:value={budgetName} placeholder="Budget name" />
	<button type="submit">Add budget</button>
</form>

<h2>Add category</h2>
<form onsubmit={addCategory}>
	<select bind:value={categoryBudgetId}>
		<option value="" disabled>Budget</option>
		{#each data.budgets as budget (budget.id)}
			<option value={budget.id}>{budget.name}</option>
		{/each}
	</select>
	<input bind:value={categoryName} placeholder="Category name" />
	<input bind:value={categoryLimit} placeholder="Monthly limit ($)" type="number" step="0.01" />
	<button type="submit">Add category</button>
</form>

<table>
	<thead>
		<tr>
			<th>Owner</th>
			<th>Budget</th>
			<th>Category</th>
			<th>Spent</th>
			<th>Limit</th>
			<th>Remaining</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each data.months as m (m.id)}
			<tr>
				<td>{m.ownerName}</td>
				<td>{m.budgetName}</td>
				<td>{m.categoryName}</td>
				<td>{centsToDollars(m.spentCents)}</td>
				<td>{centsToDollars(m.amountCents)}</td>
				<td>{centsToDollars(m.amountCents - m.spentCents)}</td>
				<td>
					<input
						type="number"
						step="0.01"
						value={centsToDollars(m.amountCents).replace(/[$,]/g, '')}
						onchange={(e) =>
							updateLimit(m.budgetCategoryId, (e.currentTarget as HTMLInputElement).value)}
					/>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
