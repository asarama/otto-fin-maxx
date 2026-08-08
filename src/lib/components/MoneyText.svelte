<script lang="ts">
	import { centsToDollars } from '$lib/money';

	interface Props {
		cents: number;
		tone?: 'auto' | 'neutral' | 'spend';
		size?: 'sm' | 'md' | 'xl';
		signed?: boolean;
	}

	let { cents, tone = 'auto', size = 'md', signed = false }: Props = $props();

	const text = $derived(tone === 'spend' ? centsToDollars(Math.abs(cents)) : centsToDollars(cents));
	const sign = $derived(signed && tone === 'auto' && cents > 0 ? '+' : '');
	const valueTone = $derived(
		tone !== 'auto' ? 'neutral' : cents < 0 ? 'negative' : cents > 0 ? 'positive' : 'zero'
	);
</script>

<span class="money {valueTone} {size}">{sign}{text}</span>

<style>
	.money {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		font-weight: 600;
	}

	.negative {
		color: var(--text-negative);
	}

	.positive {
		color: var(--text-positive);
	}

	.zero {
		color: var(--text-secondary);
	}

	.neutral {
		color: inherit;
	}

	.sm {
		font-size: var(--text-sm);
	}

	.xl {
		font-size: var(--text-2xl);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
</style>
