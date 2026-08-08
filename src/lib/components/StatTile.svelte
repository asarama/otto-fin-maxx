<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		sub?: string;
		children: Snippet;
	}

	let { label, sub, children }: Props = $props();
</script>

<div class="tile">
	<span class="label">{label}</span>
	<span class="value">{@render children()}</span>
	{#if sub}
		<span class="sub">{sub}</span>
	{/if}
</div>

<style>
	.tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.value {
		font-size: var(--text-2xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.15;
	}

	.sub {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
</style>
