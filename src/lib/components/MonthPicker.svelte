<script lang="ts">
	import { addMonths, currentMonth, monthLabel } from '$lib/month';
	import IconButton from './IconButton.svelte';

	interface Props {
		month: string;
		onChange: (month: string) => void;
	}

	let { month, onChange }: Props = $props();

	const isCurrent = $derived(month === currentMonth());
</script>

<div class="picker">
	<IconButton label="Previous month" glyph="‹" onclick={() => onChange(addMonths(month, -1))} />
	<label class="value">
		<span class="visually-hidden">Month</span>
		<input type="month" value={month} onchange={(event) => onChange(event.currentTarget.value)} />
		<span aria-hidden="true">{monthLabel(month)}</span>
	</label>
	<IconButton label="Next month" glyph="›" onclick={() => onChange(addMonths(month, 1))} />
	{#if !isCurrent}
		<button class="today" type="button" onclick={() => onChange(currentMonth())}>
			This month
		</button>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--surface-primary);
	}

	.value {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 8ch;
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.value input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		border: none;
		background: none;
		cursor: pointer;
	}

	.today {
		border: none;
		background: none;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.today:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
</style>
