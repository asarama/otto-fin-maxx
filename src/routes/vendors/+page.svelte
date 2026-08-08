<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	let { data } = $props();

	let name = $state('');
	let aliases = $state('');
	let aliasDrafts = $state<Record<string, string>>({});
	let keepId = $state('');
	let removeId = $state('');

	async function addVendor(e: SubmitEvent) {
		e.preventDefault();
		const list = aliases
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		await fetch('/api/vendors', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, aliases: list }),
		});
		name = '';
		aliases = '';
		invalidateAll();
	}

	async function addAlias(vendorId: string) {
		const alias = (aliasDrafts[vendorId] ?? '').trim();
		if (!alias) return;
		await fetch(`/api/vendors/${vendorId}/aliases`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: alias }),
		});
		aliasDrafts[vendorId] = '';
		invalidateAll();
	}

	async function removeAlias(vendorId: string, aliasId: string) {
		await fetch(`/api/vendors/${vendorId}/aliases/${aliasId}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function removeVendor(vendorId: string) {
		await fetch(`/api/vendors/${vendorId}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function merge() {
		await fetch('/api/vendors/merge', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ keepId, removeId }),
		});
		keepId = '';
		removeId = '';
		invalidateAll();
	}
</script>

<h1>Vendors</h1>

<form class="form-row" onsubmit={addVendor}>
	<input class="control" bind:value={name} placeholder="Vendor name" />
	<input class="control" bind:value={aliases} placeholder="Aliases, comma separated" />
	<Button type="submit" variant="primary">Add vendor</Button>
</form>

<h2>Merge vendors</h2>
<form
	class="form-row"
	onsubmit={(e) => {
		e.preventDefault();
		merge();
	}}
>
	<select class="control" bind:value={keepId}>
		<option value="" disabled>Keep</option>
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<select class="control" bind:value={removeId}>
		<option value="" disabled>Merge into keep</option>
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<Button type="submit" variant="secondary" disabled={!keepId || !removeId || keepId === removeId}>
		Merge
	</Button>
</form>

<h2>{data.vendors.length} vendors</h2>
<ul class="rows">
	{#each data.vendors as vendor (vendor.id)}
		<li>
			<div class="head">
				<strong>{vendor.name}</strong>
				<ConfirmDelete
					label="Delete vendor {vendor.name}"
					confirmLabel="Delete vendor"
					onconfirm={() => removeVendor(vendor.id)}
				/>
			</div>

			{#if vendor.aliases.length > 0}
				<ul class="aliases">
					{#each vendor.aliases as alias (alias.id)}
						<li>
							<code>{alias.name}</code>
							<ConfirmDelete
								label="Delete alias {alias.name}"
								confirmLabel="Delete alias"
								onconfirm={() => removeAlias(vendor.id, alias.id)}
							/>
						</li>
					{/each}
				</ul>
			{/if}

			<form
				class="form-row"
				onsubmit={(e) => {
					e.preventDefault();
					addAlias(vendor.id);
				}}
			>
				<input
					class="control"
					bind:value={aliasDrafts[vendor.id]}
					placeholder="New alias"
					aria-label="New alias for {vendor.name}"
				/>
				<Button type="submit" variant="secondary" size="sm">Add alias</Button>
			</form>
		</li>
	{/each}
</ul>

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

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.rows > li {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 560px;
		padding: var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--surface-primary);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.aliases {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.aliases li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding-left: var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-secondary);
	}

	.aliases code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
</style>
