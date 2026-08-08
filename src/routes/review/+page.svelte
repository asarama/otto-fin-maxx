<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '$lib/components/Button.svelte';
	let { data } = $props();

	let selected = new SvelteSet<string>();
	let batchCategoryId = $state('');
	let ruleCategoryId = $state('');
	let ruleVendorId = $state('');
	let ruleName = $state('');

	const totalCents = $derived(data.transactions.reduce((sum, tx) => sum + tx.amountCents, 0));

	function toggle(txId: string) {
		if (selected.has(txId)) selected.delete(txId);
		else selected.add(txId);
	}

	async function batchAssign() {
		if (!batchCategoryId || selected.size === 0) return;
		const txIds = [...selected];
		await fetch('/api/review/batch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ txIds, budgetCategoryId: batchCategoryId }),
		});
		selected.clear();
		invalidateAll();
	}

	async function createRuleFrom(tx: { id: string; description: string; vendorId: string | null }) {
		await fetch('/api/review/create-rule', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: ruleName || tx.description.slice(0, 40),
				description: tx.description,
				vendorId: ruleVendorId || tx.vendorId,
				budgetCategoryId: ruleCategoryId,
			}),
		});
		invalidateAll();
	}
</script>

<h1>Review queue</h1>

{#if data.transactions.length === 0}
	<p class="empty">Nothing to review.</p>
{:else}
	<p class="summary">
		{data.transactions.length} uncategorized &middot; {centsToDollars(totalCents)} total
	</p>
{/if}

<form
	class="form-row"
	onsubmit={(e) => {
		e.preventDefault();
		batchAssign();
	}}
>
	<select class="control" bind:value={batchCategoryId}>
		<option value="" disabled>Assign selected to category</option>
		{#each data.categories as cat (cat.id)}
			<option value={cat.id}>{cat.name}</option>
		{/each}
	</select>
	<Button type="submit" variant="primary" disabled={selected.size === 0}>
		Assign {selected.size} selected
	</Button>
</form>

<ul class="rows">
	{#each data.transactions as tx (tx.id)}
		<li>
			<label class="row">
				<input type="checkbox" checked={selected.has(tx.id)} onchange={() => toggle(tx.id)} />
				<span class="date">{tx.postedDate}</span>
				<span class="amount">{centsToDollars(tx.amountCents)}</span>
				<span class="desc">
					<strong>{tx.description}</strong>
					<em>({tx.accountName}{tx.vendorName ? `, ${tx.vendorName}` : ''})</em>
				</span>
			</label>

			<details>
				<summary>Create rule</summary>
				<div class="form-row">
					<input class="control" bind:value={ruleName} placeholder="Rule name" />
					<select class="control" bind:value={ruleVendorId}>
						<option value="">No vendor</option>
						{#each data.vendors as v (v.id)}
							<option value={v.id}>{v.name}</option>
						{/each}
					</select>
					<select class="control" bind:value={ruleCategoryId}>
						<option value="" disabled>Category</option>
						{#each data.categories as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
					<Button variant="secondary" size="sm" onclick={() => createRuleFrom(tx)}>
						Create rule
					</Button>
				</div>
			</details>
		</li>
	{/each}
</ul>

<style>
	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.empty,
	.summary {
		margin: var(--space-3) 0;
		color: var(--text-secondary);
	}

	.rows {
		list-style: none;
		margin: var(--space-5) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rows > li {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.rows > li:hover {
		background: var(--surface-hover);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		cursor: pointer;
	}

	.date {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.amount {
		min-width: 10ch;
		text-align: right;
		white-space: nowrap;
	}

	.desc em {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-style: normal;
	}

	summary {
		margin-top: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		cursor: pointer;
	}

	details[open] summary {
		margin-bottom: var(--space-2);
	}
</style>
