<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'default' | 'well' | 'goal' | 'positive' | 'danger';
		padded?: boolean;
		children: Snippet;
	}

	let { tone = 'default', padded = true, children }: Props = $props();
</script>

<div class="card {tone}" class:padded>
	{@render children()}
</div>

<style>
	.card {
		border-radius: var(--radius-xl);
		background: var(--surface-primary);
	}

	.padded {
		padding: var(--space-5);
	}

	.well {
		background: var(--surface-secondary);
		border-radius: var(--radius-lg);
	}

	.goal {
		background: var(--surface-feature);
		color: var(--on-feature);
	}

	.positive {
		border-left: 3px solid var(--positive);
	}

	.danger {
		border-left: 3px solid var(--negative);
	}
</style>
