<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { centsToDollars } from '$lib/money';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '$lib/components/Button.svelte';
	import RuleForm, { type RuleDraft } from '$lib/components/RuleForm.svelte';
	import { toastStore } from '$lib/toasts.svelte';
	let { data } = $props();

	let selected = new SvelteSet<string>();
	let batchCategoryId = $state('');

	const totalCents = $derived(data.transactions.reduce((sum, tx) => sum + tx.amountCents, 0));

	const categoryOptions = $derived(
		data.categories.map((c) => ({
			id: c.id,
			label: `${c.ownerName} / ${c.budgetName} / ${c.name}`,
		}))
	);

	function escapeRegex(s: string): string {
		return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function toggle(txId: string) {
		if (selected.has(txId)) selected.delete(txId);
		else selected.add(txId);
	}

	async function runRules() {
		try {
			const res = await fetch('/api/review/run-rules', { method: 'POST' });
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const { categorized } = await res.json();
			toastStore.add('ok', `Rules categorized ${categorized} transaction(s)`);
			invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}

	async function batchAssign() {
		if (!batchCategoryId || selected.size === 0) return;
		const txIds = [...selected];
		const categoryName = data.categories.find((c) => c.id === batchCategoryId)?.name ?? '';
		try {
			const res = await fetch('/api/review/batch', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ txIds, budgetCategoryId: batchCategoryId }),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			selected.clear();
			toastStore.add(
				'ok',
				categoryName
					? `Assigned ${txIds.length} transaction(s) to ${categoryName}`
					: `Assigned ${txIds.length} transaction(s)`
			);
			invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}

	async function createRuleFrom(
		tx: { id: string; description: string; vendorId: string | null },
		draft: RuleDraft
	) {
		const categoryName = data.categories.find((c) => c.id === draft.budgetCategoryId)?.name ?? '';
		const name = draft.name || tx.description.slice(0, 40);
		try {
			const res = await fetch('/api/review/create-rule', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name,
					descriptionMatcher: draft.descriptionMatcher || undefined,
					description: tx.description,
					amountOperator: draft.amountOperator,
					amountCents:
						draft.amountCents === '' ? null : Math.round(Number(draft.amountCents) * 100),
					vendorIds: draft.vendorIds,
					budgetCategoryId: draft.budgetCategoryId,
				}),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return false;
			}
			toastStore.add(
				'ok',
				categoryName ? `Rule "${name}" added to ${categoryName}` : `Rule "${name}" added`
			);
			invalidateAll();
			return true;
		} catch (err) {
			toastStore.add('error', (err as Error).message);
			return false;
		}
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
			<option value={cat.id}>{cat.ownerName} / {cat.budgetName} / {cat.name}</option>
		{/each}
	</select>
	<Button type="submit" variant="primary" disabled={selected.size === 0}>
		Assign {selected.size} selected
	</Button>
</form>

<Button variant="secondary" onclick={runRules}>Run rules</Button>

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
				<RuleForm
					initial={{
						name: tx.description.slice(0, 40),
						descriptionMatcher: escapeRegex(tx.description),
						vendorIds: tx.vendorId ? [tx.vendorId] : [],
					}}
					categories={categoryOptions}
					vendors={data.vendors}
					submitLabel="Create rule"
					onsubmit={(draft) => createRuleFrom(tx, draft)}
				/>
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
