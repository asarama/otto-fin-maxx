<script lang="ts">
	import Button from './Button.svelte';
	import Field from './Field.svelte';
	import MultiSelect from './MultiSelect.svelte';

	export interface RuleDraft {
		name: string;
		descriptionMatcher: string;
		amountOperator: string;
		amountCents: string;
		budgetCategoryId: string;
		vendorIds: string[];
	}

	interface Props {
		initial?: Partial<RuleDraft>;
		categories: { id: string; label: string }[];
		vendors: { id: string; name: string }[];
		submitLabel: string;
		onsubmit: (draft: RuleDraft) => boolean | Promise<boolean>;
		showCancel?: boolean;
		oncancel?: () => void;
	}

	let {
		initial = {},
		categories,
		vendors,
		submitLabel,
		onsubmit,
		showCancel = false,
		oncancel,
	}: Props = $props();

	function fresh(): RuleDraft {
		return {
			name: initial.name ?? '',
			descriptionMatcher: initial.descriptionMatcher ?? '',
			amountOperator: initial.amountOperator ?? 'any',
			amountCents: initial.amountCents ?? '',
			budgetCategoryId: initial.budgetCategoryId ?? '',
			vendorIds: initial.vendorIds ?? [],
		};
	}

	let form = $state(fresh());

	function reset() {
		form = fresh();
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const ok = await onsubmit(form);
		if (ok) reset();
	}
</script>

<form class="form-row" onsubmit={handleSubmit}>
	<Field label="Rule name">
		<input class="control" bind:value={form.name} placeholder="Rule name" />
	</Field>
	<Field label="Description">
		<input
			class="control mono"
			bind:value={form.descriptionMatcher}
			placeholder="Description regex (optional)"
		/>
	</Field>
	<Field label="Amount">
		<div class="amount-row">
			<select class="control" bind:value={form.amountOperator}>
				<option value="any">any amount</option>
				<option value="eq">=</option>
				<option value="lt">&lt;</option>
				<option value="lte">&le;</option>
				<option value="gt">&gt;</option>
				<option value="gte">&ge;</option>
			</select>
			<input
				class="control numeric"
				bind:value={form.amountCents}
				placeholder="Amount ($)"
				type="number"
				step="0.01"
			/>
		</div>
	</Field>
	<Field label="Category">
		<select class="control" bind:value={form.budgetCategoryId}>
			<option value="" disabled>Target category</option>
			{#each categories as cat (cat.id)}
				<option value={cat.id}>{cat.label}</option>
			{/each}
		</select>
	</Field>
	<Field label="Vendors">
		<MultiSelect
			label="Vendors"
			options={vendors}
			value={form.vendorIds}
			onchange={(ids) => (form.vendorIds = ids)}
		/>
	</Field>
	<Button type="submit" variant="primary">{submitLabel}</Button>
	{#if showCancel}
		<Button variant="ghost" onclick={oncancel}>Cancel</Button>
	{/if}
</form>

<style>
	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}

	.amount-row {
		display: flex;
		gap: var(--space-2);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
</style>
