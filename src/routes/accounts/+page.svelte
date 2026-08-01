<script lang="ts">
	import { invalidateAll } from '$app/navigation';
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
		await fetch(`/api/accounts/${accountId}/import`, { method: 'POST', body: form });
		invalidateAll();
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
</script>

<h1>Accounts</h1>

<form onsubmit={addAccount}>
	<input bind:value={name} placeholder="Name (e.g. Capital One Quicksilver)" />
	<select bind:value={bank}>
		<option value="capital_one">Capital One</option>
		<option value="bmo">BMO</option>
	</select>
	<select bind:value={type}>
		<option value="credit">Credit</option>
		<option value="debit">Debit</option>
	</select>
	<button type="submit">Add account</button>
</form>

{#if data.accounts.length === 0}
	<p>No accounts yet. Add your Capital One or BMO account above.</p>
{/if}

<ul>
	{#each data.accounts as account (account.id)}
		<li>
			{#if renameFor === account.id}
				<form onsubmit={submitRename}>
					<input bind:value={renameName} />
					<button type="submit">Rename</button>
					<button type="button" onclick={() => (renameFor = '')}>Cancel</button>
				</form>
			{:else}
				<span>{account.name} ({account.bank}, {account.type})</span>
				<button onclick={() => startRename(account.id, account.name)}>Rename</button>
			{/if}
			<input
				type="file"
				accept=".csv"
				onchange={(e) => {
					const file = (e.currentTarget as HTMLInputElement).files?.[0];
					if (file) importCsv(account.id, file);
				}}
			/>
		</li>
	{/each}
</ul>
