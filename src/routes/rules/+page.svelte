<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Field from '$lib/components/Field.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import RuleForm, { type RuleDraft } from '$lib/components/RuleForm.svelte';
	import { toastStore } from '$lib/toasts.svelte';
	let { data } = $props();

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

	const categoryOptions = $derived(data.categories.map((c) => ({ id: c.id, label: c.name })));

	async function addRule(draft: RuleDraft) {
		const categoryName = data.categories.find((c) => c.id === draft.budgetCategoryId)?.name ?? '';
		try {
			const res = await fetch('/api/rules', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: draft.name,
					descriptionMatcher: draft.descriptionMatcher || null,
					amountOperator: draft.amountOperator,
					amountCents:
						draft.amountCents === '' ? null : Math.round(Number(draft.amountCents) * 100),
					budgetCategoryId: draft.budgetCategoryId,
					vendorIds: draft.vendorIds,
				}),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return false;
			}
			const rule = await res.json();
			toastStore.add(
				'ok',
				categoryName ? `Rule "${rule.name}" added to ${categoryName}` : `Rule "${rule.name}" added`
			);
			invalidateAll();
			return true;
		} catch (err) {
			toastStore.add('error', (err as Error).message);
			return false;
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

	async function saveEdit(draft: RuleDraft) {
		try {
			const res = await fetch(`/api/rules/${editRuleId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: draft.name,
					descriptionMatcher: draft.descriptionMatcher || null,
					amountOperator: draft.amountOperator,
					amountCents:
						draft.amountCents === '' ? null : Math.round(Number(draft.amountCents) * 100),
					budgetCategoryId: draft.budgetCategoryId,
					vendorIds: draft.vendorIds,
				}),
			});
			if (!res.ok) {
				toastStore.add('error', (await res.text()).replace(/^\d+:\s*/, ''));
				return false;
			}
			editRuleId = '';
			invalidateAll();
			return true;
		} catch (err) {
			toastStore.add('error', (err as Error).message);
			return false;
		}
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

<RuleForm
	categories={categoryOptions}
	vendors={data.vendors}
	submitLabel="Add rule"
	onsubmit={addRule}
/>

{#if editRuleId}
	<div class="edit">
		<h2>Editing {editName}</h2>
		<RuleForm
			initial={{
				name: editName,
				descriptionMatcher: editDescriptionMatcher,
				amountOperator: editAmountOperator,
				amountCents: editAmountCents,
				budgetCategoryId: editBudgetCategoryId,
				vendorIds: editVendorIds,
			}}
			categories={categoryOptions}
			vendors={data.vendors}
			submitLabel="Save"
			onsubmit={saveEdit}
			showCancel
			oncancel={() => (editRuleId = '')}
		/>
	</div>
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
					<Field label="Description">
						<input class="control" bind:value={testDescription} placeholder="Description" />
					</Field>
					<Field label="Vendor">
						<select class="control" bind:value={testVendorId} aria-label="Test vendor">
							<option value="">no vendor</option>
							{#each data.vendors as v (v.id)}
								<option value={v.id}>{v.name}</option>
							{/each}
						</select>
					</Field>
					<Field label="Amount">
						<input
							class="control numeric"
							bind:value={testAmount}
							placeholder="Amount ($)"
							type="number"
							step="0.01"
						/>
					</Field>
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
		align-items: flex-end;
		gap: var(--space-2);
	}

	.edit {
		margin-top: var(--space-5);
		padding: var(--space-4);
		border-radius: var(--radius-xl);
		background: var(--surface-primary);
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
