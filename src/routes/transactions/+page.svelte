<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import Button from '$lib/components/Button.svelte';
	let { data } = $props();

	let account = $state(data.filters.accountId ?? '');
	let month = $state(data.filters.month ?? '');
	let status = $state(data.filters.status ?? '');
	let search = $state(data.filters.search ?? '');

	const totals = $derived(
		data.transactions.reduce(
			(acc, tx) => ({
				debits: acc.debits + (tx.amountCents < 0 ? -tx.amountCents : 0),
				credits: acc.credits + (tx.amountCents > 0 ? tx.amountCents : 0),
				net: acc.net + tx.amountCents,
			}),
			{ debits: 0, credits: 0, net: 0 }
		)
	);

	function applyFilters() {
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries({ account, month, status, search })) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		window.location.href = url.toString();
	}

	async function assign(txId: string, budgetCategoryId: string, txMonth: string) {
		if (!budgetCategoryId) return;
		await fetch(`/api/transactions/${txId}/assign`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ budgetCategoryId, month: txMonth }),
		});
		invalidateAll();
	}
</script>

<h1>Transactions</h1>

<form
	class="form-row"
	onsubmit={(e) => {
		e.preventDefault();
		applyFilters();
	}}
>
	<input class="control" bind:value={search} placeholder="Search description" />
	<input class="control" type="month" bind:value={month} />
	<select class="control" bind:value={account}>
		<option value="">All accounts</option>
		{#each data.accounts as a (a.id)}
			<option value={a.id}>{a.name}</option>
		{/each}
	</select>
	<select class="control" bind:value={status}>
		<option value="">All statuses</option>
		<option value="unreviewed">unreviewed</option>
		<option value="auto">auto</option>
		<option value="manual">manual</option>
	</select>
	<Button type="submit" variant="primary">Filter</Button>
</form>

<table>
	<thead>
		<tr>
			<th>Date</th>
			<th>Description</th>
			<th>Account</th>
			<th>Vendor</th>
			<th class="end">Amount</th>
			<th>Category</th>
			<th>Status</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each data.transactions as tx (tx.id)}
			<tr>
				<td>{tx.postedDate}</td>
				<td>{tx.description}</td>
				<td>{tx.accountName}</td>
				<td>{tx.vendorName ?? tx.rawVendorName}</td>
				<td class="end">{centsToDollars(tx.amountCents)}</td>
				<td>{tx.categoryName ?? '—'}</td>
				<td>{tx.assignmentStatus}</td>
				<td>
					<select
						class="control"
						aria-label="Assign category for {tx.description}"
						onchange={(e) =>
							assign(
								tx.id,
								(e.currentTarget as HTMLSelectElement).value,
								tx.postedDate.slice(0, 7)
							)}
					>
						<option value="">assign category</option>
						{#each data.budgetCategories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
				</td>
			</tr>
		{/each}
	</tbody>
	{#if data.transactions.length > 0}
		<tfoot>
			<tr>
				<td colspan="4">
					Total &middot; {data.transactions.length} transactions
					<span class="split">
						out {centsToDollars(totals.debits)} &middot; in {centsToDollars(totals.credits)}
					</span>
				</td>
				<td class="end">{centsToDollars(totals.net)}</td>
				<td colspan="3"></td>
			</tr>
		</tfoot>
	{/if}
</table>

<style>
	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
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

	.split {
		color: var(--text-secondary);
		font-weight: 400;
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	tfoot td {
		font-weight: 700;
		border-top: 1px solid var(--border-default);
	}
</style>
