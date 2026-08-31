<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Field from '$lib/components/Field.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { toastStore } from '$lib/toasts.svelte';

	let { data } = $props();

	let ownerName = $state('');
	let adding = $state(false);

	async function resetAll() {
		try {
			const res = await fetch('/api/admin/reset', { method: 'POST' });
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const result = await res.json();
			const rows = result.counts.reduce((sum: number, c: { count: number }) => sum + c.count, 0);
			toastStore.add('ok', `Reset complete · ${rows} rows remaining`);
			await invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}

	async function addOwner(e: SubmitEvent) {
		e.preventDefault();
		adding = true;
		try {
			const res = await fetch('/api/owners', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: ownerName }),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			ownerName = '';
			toastStore.add('ok', 'Owner added');
			await invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		} finally {
			adding = false;
		}
	}
</script>

<PageHeader title="Admin" subtitle="Maintenance and danger zone" />

<h2>Reset all data</h2>
<Card>
	<p>
		Deletes every row from all tables. Owners, budgets, categories, accounts, vendors, rules, and
		transactions are all removed. This cannot be undone.
	</p>
	<ConfirmDelete label="Reset all data" confirmLabel="Reset all data" onconfirm={resetAll} />
</Card>

<h2>Owners</h2>
<form class="form-row" onsubmit={addOwner}>
	<Field label="Owner name">
		<input class="control" bind:value={ownerName} placeholder="Owner name" />
	</Field>
	<Button type="submit" variant="primary" busy={adding} disabled={!ownerName.trim()}>
		Add owner
	</Button>
</form>

<ul class="rows">
	{#each data.owners as owner (owner.id)}
		<li>{owner.name}</li>
	{/each}
</ul>
{#if data.owners.length === 0}
	<p class="empty">No owners yet. Add one above so you can create budgets.</p>
{/if}

<h2>Row counts</h2>
<table>
	<thead>
		<tr>
			<th>Table</th>
			<th class="end">Rows</th>
		</tr>
	</thead>
	<tbody>
		{#each data.counts as row (row.table)}
			<tr>
				<td>{row.table}</td>
				<td class="end num">{row.count}</td>
			</tr>
		{/each}
	</tbody>
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
		align-items: flex-end;
		gap: var(--space-2);
	}

	.rows {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rows li {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.rows li:hover {
		background: var(--surface-hover);
	}

	.empty {
		margin-top: var(--space-2);
		color: var(--text-secondary);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		border-bottom: 1px solid var(--border-default);
	}

	.end {
		text-align: right;
	}

	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
