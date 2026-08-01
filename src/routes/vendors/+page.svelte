<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();

	let name = $state('');
	let aliases = $state('');
	let newAlias = $state('');
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
		await fetch(`/api/vendors/${vendorId}/aliases`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: newAlias }),
		});
		newAlias = '';
		invalidateAll();
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

<form onsubmit={addVendor}>
	<input bind:value={name} placeholder="Vendor name" />
	<input bind:value={aliases} placeholder="Aliases, comma separated" />
	<button type="submit">Add vendor</button>
</form>

<h2>Merge vendors</h2>
<form
	onsubmit={(e) => {
		e.preventDefault();
		merge();
	}}
>
	<select bind:value={keepId}>
		<option value="" disabled>Keep</option>
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<select bind:value={removeId}>
		<option value="" disabled>Merge into keep</option>
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<button type="submit">Merge</button>
</form>

<ul>
	{#each data.vendors as vendor (vendor.id)}
		<li>
			<strong>{vendor.name}</strong>
			{#if vendor.aliases.length > 0}
				<em>({vendor.aliases.join(', ')})</em>
			{/if}
			<input bind:value={newAlias} placeholder="New alias" />
			<button onclick={() => addAlias(vendor.id)}>Add alias</button>
		</li>
	{/each}
</ul>
