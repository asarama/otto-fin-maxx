<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	let { data } = $props();

	let account = $state(data.filters.accountId ?? '');
	let month = $state(data.filters.month ?? '');
	let status = $state(data.filters.status ?? '');
	let search = $state(data.filters.search ?? '');

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
	onsubmit={(e) => {
		e.preventDefault();
		applyFilters();
	}}
>
	<input bind:value={search} placeholder="Search description" />
	<input type="month" bind:value={month} />
	<select bind:value={account}>
		<option value="">All accounts</option>
		{#each data.accounts as a (a.id)}
			<option value={a.id}>{a.name}</option>
		{/each}
	</select>
	<select bind:value={status}>
		<option value="">All statuses</option>
		<option value="unreviewed">unreviewed</option>
		<option value="auto">auto</option>
		<option value="manual">manual</option>
	</select>
	<button type="submit">Filter</button>
</form>

<table>
	<thead>
		<tr>
			<th>Date</th>
			<th>Description</th>
			<th>Account</th>
			<th>Vendor</th>
			<th>Amount</th>
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
				<td>{centsToDollars(tx.amountCents)}</td>
				<td>{tx.categoryName ?? '—'}</td>
				<td>{tx.assignmentStatus}</td>
				<td>
					<select
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
</table>
