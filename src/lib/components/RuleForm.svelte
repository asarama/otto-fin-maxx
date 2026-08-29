<script lang="ts">
	import Button from './Button.svelte';

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
	<input class="control" bind:value={form.name} placeholder="Rule name" />
	<input
		class="control mono"
		bind:value={form.descriptionMatcher}
		placeholder="Description regex (optional)"
	/>
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
	<select class="control" bind:value={form.budgetCategoryId}>
		<option value="" disabled>Target category</option>
		{#each categories as cat (cat.id)}
			<option value={cat.id}>{cat.label}</option>
		{/each}
	</select>
	<select class="control multi" bind:value={form.vendorIds} multiple aria-label="Vendors">
		{#each vendors as v (v.id)}
			<option value={v.id}>{v.name}</option>
		{/each}
	</select>
	<Button type="submit" variant="primary">{submitLabel}</Button>
	{#if showCancel}
		<Button variant="ghost" onclick={oncancel}>Cancel</Button>
	{/if}
</form>

<style>
	.form-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.multi {
		min-width: 14ch;
		max-height: 96px;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
</style>
