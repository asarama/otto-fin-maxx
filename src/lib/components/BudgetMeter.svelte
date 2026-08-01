<script lang="ts">
	import { centsToDollars } from '$lib/money';
	import { budgetHealth } from '$lib/ui/tone';

	interface Props {
		spentCents: number;
		limitCents: number;
		label?: string;
		showLabel?: boolean;
	}

	let { spentCents, limitCents, label = 'Budget', showLabel = false }: Props = $props();

	const health = $derived(budgetHealth(spentCents, limitCents));
	const ratio = $derived(limitCents > 0 ? spentCents / limitCents : 0);
	const width = $derived(`${Math.max(0, Math.min(ratio, 1)) * 100}%`);
	const statusText = $derived(
		health === 'none'
			? 'no limit set'
			: health === 'over'
				? `Over by ${centsToDollars(spentCents - limitCents)}`
				: health === 'near'
					? `${centsToDollars(limitCents - spentCents)} left`
					: 'On track'
	);
</script>

<div class="meter">
	<div
		class="track"
		class:empty={health === 'none'}
		role="meter"
		aria-valuenow={spentCents}
		aria-valuemin={0}
		aria-valuemax={Math.max(limitCents, spentCents)}
		aria-label="{label}: {centsToDollars(spentCents)} of {centsToDollars(limitCents)}"
	>
		{#if health !== 'none'}
			<div class="fill" class:over={health === 'over'} style:width></div>
		{/if}
	</div>
	{#if showLabel}
		<span class="status {health}">{statusText}</span>
	{/if}
</div>

<style>
	.meter {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.track {
		position: relative;
		flex: 1;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--surface-track);
	}

	.empty {
		background: none;
		border: 1px dashed var(--border-default);
	}

	.fill {
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--accent);
		transition: width var(--motion-mid);
	}

	.over {
		background: var(--negative);
		width: 100% !important;
	}

	.over::after {
		content: '';
		position: absolute;
		top: -2px;
		right: -8px;
		width: 3px;
		height: 12px;
		border-radius: var(--radius-pill);
		background: var(--negative);
	}

	.status {
		flex: none;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.status.ok {
		color: var(--text-positive);
	}

	.status.near {
		color: var(--text-primary);
	}

	.status.over {
		color: var(--text-negative);
	}

	.status.none {
		color: var(--text-secondary);
		font-weight: 400;
	}
</style>
