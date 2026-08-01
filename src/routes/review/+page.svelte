<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import { SvelteSet } from 'svelte/reactivity';
	let { data } = $props();

	let selected = new SvelteSet<string>();
	let batchCategoryId = $state('');
	let ruleCategoryId = $state('');
	let ruleVendorId = $state('');
	let ruleName = $state('');

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
	<p>Nothing to review.</p>
{/if}

<form
	onsubmit={(e) => {
		e.preventDefault();
		batchAssign();
	}}
>
	<select bind:value={batchCategoryId}>
		<option value="" disabled>Assign selected to category</option>
		{#each data.categories as cat (cat.id)}
			<option value={cat.id}>{cat.name}</option>
		{/each}
	</select>
	<button type="submit" disabled={selected.size === 0}>Assign {selected.size} selected</button>
</form>

<ul>
	{#each data.transactions as tx (tx.id)}
		<li>
			<input type="checkbox" checked={selected.has(tx.id)} onchange={() => toggle(tx.id)} />
			{tx.postedDate} &middot; {centsToDollars(tx.amountCents)} &middot;
			<strong>{tx.description}</strong>
			({tx.accountName}{tx.vendorName ? `, ${tx.vendorName}` : ''})

			<details>
				<summary>Create rule</summary>
				<input bind:value={ruleName} placeholder="Rule name" />
				<select bind:value={ruleVendorId}>
					<option value="">No vendor</option>
					{#each data.vendors as v (v.id)}
						<option value={v.id}>{v.name}</option>
					{/each}
				</select>
				<select bind:value={ruleCategoryId}>
					<option value="" disabled>Category</option>
					{#each data.categories as cat (cat.id)}
						<option value={cat.id}>{cat.name}</option>
					{/each}
				</select>
				<button onclick={() => createRuleFrom(tx)}>Create rule</button>
			</details>
		</li>
	{/each}
</ul>
