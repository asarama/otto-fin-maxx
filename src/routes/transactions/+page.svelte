<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import Button from '$lib/components/Button.svelte';
	let { data } = $props();

	let account = $state(data.filters.accountId ?? '');
	let month = $state(data.filters.month ?? '');
	let status = $state(data.filters.status ?? '');
	let search = $state(data.filters.search ?? '');

	let importAccountId = $state('');
	let importing = $state(false);

	const importAccount = $derived(data.accounts.find((a) => a.id === importAccountId) ?? null);
	type ImportResult = {
		imported: number;
		duplicates: number;
		errors: unknown[];
		categorized: number;
		parseErrors: string[];
	};
	let importStatus = $state<
		| {
				kind: 'ok';
				imported: number;
				duplicates: number;
				categorized: number;
				parseErrors: string[];
		  }
		| { kind: 'error'; message: string }
		| null
	>(null);

	async function importCsv(file: File) {
		if (!importAccountId) {
			importStatus = { kind: 'error', message: 'Pick an account to import into first.' };
			return;
		}
		importing = true;
		importStatus = null;
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(`/api/accounts/${importAccountId}/import`, {
				method: 'POST',
				body: form,
			});
			if (!res.ok) {
				importStatus = { kind: 'error', message: (await res.text()).replace(/^\d+:\s*/, '') };
				return;
			}
			const result = (await res.json()) as ImportResult;
			importStatus = {
				kind: 'ok',
				imported: result.imported,
				duplicates: result.duplicates,
				categorized: result.categorized,
				parseErrors: result.parseErrors ?? [],
			};
			await invalidateAll();
		} catch (err) {
			importStatus = { kind: 'error', message: (err as Error).message };
		} finally {
			importing = false;
		}
	}

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

<section class="import-panel">
	<h2>Import CSV</h2>
	<div class="form-row">
		<select class="control" bind:value={importAccountId} aria-label="Account to import into">
			<option value="" disabled>Choose account…</option>
			{#each data.accounts as a (a.id)}
				<option value={a.id}
					>{a.name}, {a.bank === 'capital_one' ? 'Capital One' : 'BMO'}, {a.type === 'credit'
						? 'Credit'
						: 'Debit'}</option
				>
			{/each}
		</select>
		<input
			class="control file"
			type="file"
			accept=".csv"
			disabled={importing || !data.accounts.length}
			aria-label="CSV file to import"
			onchange={(e) => {
				const input = e.currentTarget as HTMLInputElement;
				const file = input.files?.[0];
				if (file) importCsv(file);
				input.value = '';
			}}
		/>
		{#if importing}
			<span class="importing">Importing…</span>
		{/if}
	</div>
	{#if importStatus?.kind === 'ok'}
		<div class="result ok" role="status">
			<div class="pills">
				{#if importAccount}
					<span class="pill pill-account">{importAccount.name}</span>
					<span class="pill pill-type">{importAccount.type}</span>
				{/if}
				<span class="pill">
					{importStatus.imported} imported
				</span>
				<span class="pill">
					{importStatus.duplicates} duplicate{importStatus.duplicates === 1 ? '' : 's'} skipped
				</span>
				<span class="pill">{importStatus.categorized} auto-categorized</span>
			</div>
			{#each importStatus.parseErrors as pe, i (i)}
				<p class="result-detail">{pe}</p>
			{/each}
		</div>
	{:else if importStatus?.kind === 'error'}
		<p class="result error" role="alert">{importStatus.message}</p>
	{/if}
</section>

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

	.import-panel {
		margin-bottom: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.import-panel h2 {
		font-size: var(--text-md);
		margin: 0 0 var(--space-2);
	}

	.import-panel .form-row {
		margin-bottom: 0;
	}

	.file {
		max-width: 260px;
		font-size: var(--text-sm);
	}

	.importing {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.result {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		background: var(--surface-hover);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.pill {
		display: inline-block;
		padding: calc(var(--space-1) / 2) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		background: var(--surface-secondary);
		border: 1px solid var(--border-default);
		color: var(--text-primary);
	}

	.pill-account {
		background: var(--category-1-surface);
		color: var(--category-1-text);
		border-color: transparent;
	}

	.pill-type {
		background: var(--category-4-surface);
		color: var(--category-4-text);
		border-color: transparent;
		text-transform: capitalize;
	}

	.result.ok .result-detail {
		margin: var(--space-1) 0 0;
		color: #b00020;
	}

	.result.error {
		color: #b00020;
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
