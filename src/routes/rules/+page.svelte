<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import { toastStore } from '$lib/toasts.svelte';
	let { data } = $props();

	let name = $state('');
	let descriptionMatcher = $state('');
	let amountOperator = $state('any');
	let amountCents = $state('');
	let budgetCategoryId = $state('');
	let selectedVendors = $state<string[]>([]);

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
		const categoryName = data.categories.find((c) => c.id === budgetCategoryId)?.name ?? '';
		try {
			const res = await fetch('/api/rules', {
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
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return;
			}
			const rule = await res.json();
			toastStore.add(
				'ok',
				categoryName ? `Rule "${rule.name}" added to ${categoryName}` : `Rule "${rule.name}" added`
			);
			name = '';
			descriptionMatcher = '';
			amountOperator = 'any';
			amountCents = '';
			budgetCategoryId = '';
			selectedVendors = [];
			invalidateAll();
		} catch (err) {
			toastStore.add('error', (err as Error).message);
		}
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
		await invalidateAll();
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

<form class="form-row" onsubmit={addRule}>
	<input class="control" bind:value={name} placeholder="Rule name" />
	<input
		class="control mono"
		bind:value={descriptionMatcher}
		placeholder="Description regex (optional)"
	/>
	<select class="control" bind:value={amountOperator}>
		<option value="any">any amount</option>
		<option value="eq">=</option>
		<option value="lt">&lt;</option>
		<option value="lte">&le;</option>
		<option value="gt">&gt;</option>
		<option value="gte">&ge;</option>
	</select>
	<input
		class="control numeric"
		bind:value={amountCents}
		placeholder="Amount ($)"
		type="number"
		step="0.01"
	/>
	<select class="control" bind:value={budgetCategoryId}>
		<option value="" disabled>Target category</option>
		{#each data.categories as cat (cat.id)}
			<option value={cat.id}>{cat.name}</option>
		{/each}
	</select>
	<select class="control multi" bind:value={selectedVendors} multiple aria-label="Vendors">
		{#each data.vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<Button type="submit" variant="primary">Add rule</Button>
</form>

{#if editRuleId}
	<form class="edit" onsubmit={saveEdit}>
		<h2>Editing {editName}</h2>
		<div class="form-row">
			<input class="control" bind:value={editName} placeholder="Rule name" />
			<input
				class="control mono"
				bind:value={editDescriptionMatcher}
				placeholder="Description regex (optional)"
			/>
			<select class="control" bind:value={editAmountOperator}>
				<option value="any">any amount</option>
				<option value="eq">=</option>
				<option value="lt">&lt;</option>
				<option value="lte">&le;</option>
				<option value="gt">&gt;</option>
				<option value="gte">&ge;</option>
			</select>
			<input
				class="control numeric"
				bind:value={editAmountCents}
				placeholder="Amount ($)"
				type="number"
				step="0.01"
			/>
			<select class="control" bind:value={editBudgetCategoryId} aria-label="Target category">
				{#each data.categories as cat (cat.id)}
					<option value={cat.id}>{cat.name}</option>
				{/each}
			</select>
			<select class="control multi" bind:value={editVendorIds} multiple aria-label="Vendors">
				{#each data.vendors as v (v.id)}
					<option value={v.id}>{v.name}</option>
				{/each}
			</select>
			<Button type="submit" variant="primary">Save</Button>
			<Button variant="ghost" onclick={() => (editRuleId = '')}>Cancel</Button>
		</div>
	</form>
{/if}

<ul class="rows">
	{#each data.rules as rule (rule.id)}
		<li>
			<div class="head">
				<span class="title">
					<strong>{rule.name}</strong>
					<em>{rule.enabled ? 'on' : 'off'} &middot; priority {rule.priority}</em>
					{#if rule.descriptionMatcher}<code>{rule.descriptionMatcher}</code>{/if}
				</span>
				<span class="actions">
					<IconButton label="Move {rule.name} up" glyph="↑" onclick={() => move(rule.id, 'up')} />
					<IconButton
						label="Move {rule.name} down"
						glyph="↓"
						onclick={() => move(rule.id, 'down')}
					/>
					<Button variant="secondary" size="sm" onclick={() => startEdit(rule)}>Edit</Button>
					<Button variant="ghost" size="sm" onclick={() => toggle(rule.id, rule.enabled)}>
						{rule.enabled ? 'Disable' : 'Enable'}
					</Button>
					<ConfirmDelete
						label="Delete rule {rule.name}"
						confirmLabel="Delete rule"
						onconfirm={() => remove(rule.id)}
					/>
				</span>
			</div>

			<details>
				<summary>Test</summary>
				<div class="form-row">
					<input class="control" bind:value={testDescription} placeholder="Description" />
					<select class="control" bind:value={testVendorId} aria-label="Test vendor">
						<option value="">no vendor</option>
						{#each data.vendors as v (v.id)}
							<option value={v.id}>{v.name}</option>
						{/each}
					</select>
					<input
						class="control numeric"
						bind:value={testAmount}
						placeholder="Amount ($)"
						type="number"
						step="0.01"
					/>
					<Button
						variant="secondary"
						size="sm"
						onclick={() => {
							testRuleId = rule.id;
							testRule(rule.id);
						}}
					>
						Run test
					</Button>
					{#if testRuleId === rule.id && testResult}
						<span class="result" class:match={testResult === 'MATCHES'}>{testResult}</span>
					{/if}
				</div>
			</details>
		</li>
	{/each}
</ul>

<style>
	h2 {
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
	}

	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.edit {
		margin-top: var(--space-5);
		padding: var(--space-4);
		border-radius: var(--radius-xl);
		background: var(--surface-primary);
	}

	.multi {
		min-width: 14ch;
		max-height: 96px;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
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

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.title {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.title em {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-style: normal;
	}

	.title code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-secondary);
	}

	.actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
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

	.result {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.result.match {
		color: var(--text-positive);
	}
</style>
