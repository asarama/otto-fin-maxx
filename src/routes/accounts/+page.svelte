<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Field from '$lib/components/Field.svelte';
	import { toastStore } from '$lib/toasts.svelte';
	let { data } = $props();

	let name = $state('');
	let bank = $state('capital_one');
	let type = $state('credit');
	let renameFor = $state('');
	let renameName = $state('');

	async function addAccount(e: SubmitEvent) {
		e.preventDefault();
		await fetch('/api/accounts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, bank, type }),
		});
		name = '';
		invalidateAll();
	}

	async function importCsv(accountId: string, file: File) {
		const form = new FormData();
		form.append('file', file);
		try {
			const res = await fetch(`/api/accounts/${accountId}/import`, {
				method: 'POST',
				body: form,
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const result = await res.json();
			const parts = [`Imported ${result.imported}, skipped ${result.duplicates} duplicate(s)`];
			if (result.vendorUpdates > 0) parts.push(`${result.vendorUpdates} re-linked to vendor(s)`);
			toastStore.add('ok', parts.join(' · '));
			await invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
	}

	function startRename(accountId: string, currentName: string) {
		renameFor = accountId;
		renameName = currentName;
	}

	async function submitRename(e: SubmitEvent) {
		e.preventDefault();
		await fetch(`/api/accounts/${renameFor}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: renameName }),
		});
		renameFor = '';
		renameName = '';
		invalidateAll();
	}

	async function removeAccount(accountId: string) {
		await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<h1>Accounts</h1>

<form class="form-row" onsubmit={addAccount}>
	<Field label="Name">
		<input class="control" bind:value={name} placeholder="Name (e.g. Capital One Quicksilver)" />
	</Field>
	<Field label="Bank">
		<select class="control" bind:value={bank}>
			<option value="capital_one">Capital One</option>
			<option value="bmo">BMO</option>
		</select>
	</Field>
	<Field label="Account type">
		<select class="control" bind:value={type}>
			<option value="credit">Credit</option>
			<option value="debit">Debit</option>
		</select>
	</Field>
	<Button type="submit" variant="primary">Add account</Button>
</form>

{#if data.accounts.length === 0}
	<p class="empty">No accounts yet. Add your Capital One or BMO account above.</p>
{/if}

<ul class="rows">
	{#each data.accounts as account (account.id)}
		<li>
			{#if renameFor === account.id}
				<form class="form-row" onsubmit={submitRename}>
					<Field label="New name">
						<input class="control" bind:value={renameName} />
					</Field>
					<Button type="submit" variant="primary" size="sm">Rename</Button>
					<Button variant="ghost" size="sm" onclick={() => (renameFor = '')}>Cancel</Button>
				</form>
			{:else}
				<span class="name">{account.name} <em>({account.bank}, {account.type})</em></span>
				<Button variant="secondary" size="sm" onclick={() => startRename(account.id, account.name)}>
					Rename
				</Button>
			{/if}
			<Field label="Import CSV">
				<input
					class="control file"
					type="file"
					accept=".csv"
					aria-label="Import CSV into {account.name}"
					onchange={(e) => {
						const file = (e.currentTarget as HTMLInputElement).files?.[0];
						if (file) importCsv(account.id, file);
					}}
				/>
			</Field>
			<ConfirmDelete
				label="Delete account {account.name}"
				confirmLabel="Delete account and its transactions"
				onconfirm={() => removeAccount(account.id)}
			/>
		</li>
	{/each}
</ul>

<style>
	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}

	.empty {
		margin-top: var(--space-4);
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

	.rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.rows li:hover {
		background: var(--surface-hover);
	}

	.name {
		min-width: 22ch;
	}

	.name em {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-style: normal;
	}

	.file {
		font-size: var(--text-sm);
		max-width: 260px;
	}
</style>
