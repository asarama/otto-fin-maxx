<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();

	let name = $state('');
	let descriptionMatcher = $state('');
	let amountOperator = $state('any');
	let amountCents = $state('');
	let budgetCategoryId = $state('');
	let selectedVendors = $state([]);

	let editRuleId = $state('');
	let editName = $state('');
	let editDescriptionMatcher = $state('');
	let editAmountOperator = $state('any');
	let editAmountCents = $state('');
	let editBudgetCategoryId = $state('');
	let editVendorIds = $state<string[]>([]);

	let testRuleId = $state('');
	let testDescription = $state('');
	let testVendorId = $state('');
	let testAmount = $state('');
	let testResult = $state<string | null>(null);

	async function addRule(e: SubmitEvent) {
		e.preventDefault();
		await fetch('/api/rules', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name,
				descriptionMatcher: descriptionMatcher || null,
				amountOperator,
				amountCents: amountCents === '' ? null : Math.round(Number(amountCents) * 100),
				budgetCategoryId,
				vendorIds: selectedVendors,
			}),
		});
		name = '';
		descriptionMatcher = '';
		amountOperator = 'any';
		amountCents = '';
		budgetCategoryId = '';
		selectedVendors = [];
		invalidateAll();
	}

	function startEdit(rule: {
		id: string;
		name: string;
		descriptionMatcher: string | null;
		amountOperator: string;
		amountCents: number | null;
		budgetCategoryId: string;
		vendorIds: string[];
	}) {
		editRuleId = rule.id;
		editName = rule.name;
		editDescriptionMatcher = rule.descriptionMatcher ?? '';
		editAmountOperator = rule.amountOperator;
		editAmountCents = rule.amountCents == null ? '' : (rule.amountCents / 100).toString();
		editBudgetCategoryId = rule.budgetCategoryId;
		editVendorIds = [...rule.vendorIds];
	}

	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		await fetch(`/api/rules/${editRuleId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: editName,
				descriptionMatcher: editDescriptionMatcher || null,
				amountOperator: editAmountOperator,
				amountCents: editAmountCents === '' ? null : Math.round(Number(editAmountCents) * 100),
				budgetCategoryId: editBudgetCategoryId,
				vendorIds: editVendorIds,
			}),
		});
		editRuleId = '';
		invalidateAll();
	}

	async function toggle(ruleId: string, enabled: boolean) {
		await fetch(`/api/rules/${ruleId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ enabled: !enabled }),
		});
		invalidateAll();
	}

	async function remove(ruleId: string) {
		await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
		invalidateAll();
	}

	async function move(ruleId: string, direction: 'up' | 'down') {
		await fetch(`/api/rules/${ruleId}/move`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ direction }),
		});
		invalidateAll();
	}

	async function testRule(ruleId: string) {
		const res = await fetch(`/api/rules/${ruleId}/test`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				description: testDescription,
				vendorId: testVendorId || null,
				amountCents: testAmount === '' ? 0 : Math.round(Number(testAmount) * 100),
			}),
		});
		const body = await res.json();
		testResult = body.matches ? 'MATCHES' : 'no match';
	}
</script>

<h1>Rules</h1>

<form onsubmit={addRule}>
	<input bind:value={name} placeholder="Rule name" />
	<input bind:value={descriptionMatcher} placeholder="Description regex (optional)" />
	<select bind:value={amountOperator}>
		<option value="any">any amount</option>
		<option value="eq">=</option>
		<option value="lt">&lt;</option>
		<option value="lte">&le;</option>
		<option value="gt">&gt;</option>
		<option value="gte">&ge;</option>
	</select>
	<input bind:value={amountCents} placeholder="Amount ($)" type="number" step="0.01" />
	<select bind:value={budgetCategoryId}>
		<option value="" disabled>Target category</option>
		{#each data.categories as cat (cat.id)}
			<option value={cat.id}>{cat.name}</option>
		{/each}
	</select>
	<select bind:value={selectedVendors} multiple>
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<button type="submit">Add rule</button>
</form>

{#if editRuleId}
	<form onsubmit={saveEdit}>
		<h2>Editing {editName}</h2>
		<input bind:value={editName} placeholder="Rule name" />
		<input bind:value={editDescriptionMatcher} placeholder="Description regex (optional)" />
		<select bind:value={editAmountOperator}>
			<option value="any">any amount</option>
			<option value="eq">=</option>
			<option value="lt">&lt;</option>
			<option value="lte">&le;</option>
			<option value="gt">&gt;</option>
			<option value="gte">&ge;</option>
		</select>
		<input bind:value={editAmountCents} placeholder="Amount ($)" type="number" step="0.01" />
		<select bind:value={editBudgetCategoryId}>
			{#each data.categories as cat (cat.id)}
				<option value={cat.id}>{cat.name}</option>
			{/each}
		</select>
		<select bind:value={editVendorIds} multiple>
			{#each data.vendors as v (v.id)}
				<option value={v.id}>{v.name}</option>
			{/each}
		</select>
		<button type="submit">Save</button>
		<button type="button" onclick={() => (editRuleId = '')}>Cancel</button>
	</form>
{/if}

<ul>
	{#each data.rules as rule (rule.id)}
		<li>
			<strong>{rule.name}</strong>
			{rule.enabled ? 'on' : 'off'} &middot; priority {rule.priority}
			{#if rule.descriptionMatcher}<code>{rule.descriptionMatcher}</code>{/if}
			<button onclick={() => move(rule.id, 'up')}>&uarr;</button>
			<button onclick={() => move(rule.id, 'down')}>&darr;</button>
			<button onclick={() => startEdit(rule)}>Edit</button>
			<button onclick={() => toggle(rule.id, rule.enabled)}
				>{rule.enabled ? 'Disable' : 'Enable'}</button
			>
			<button onclick={() => remove(rule.id)}>Delete</button>

			<details>
				<summary>Test</summary>
				<input bind:value={testDescription} placeholder="Description" />
				<select bind:value={testVendorId}>
					<option value="">no vendor</option>
					{#each data.vendors as v (v.id)}
						<option value={v.id}>{v.name}</option>
					{/each}
				</select>
				<input bind:value={testAmount} placeholder="Amount ($)" type="number" step="0.01" />
				<button
					onclick={() => {
						testRuleId = rule.id;
						testRule(rule.id);
					}}>Run test</button
				>
				{#if testRuleId === rule.id && testResult}<span>{testResult}</span>{/if}
			</details>
		</li>
	{/each}
</ul>
