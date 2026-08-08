<script lang="ts">
	import { categoryIndex } from '$lib/ui/tone';

	interface Props {
		name: string | null;
		income?: boolean;
	}

	let { name, income = false }: Props = $props();

	const index = $derived(income ? 4 : name ? categoryIndex(name) : 0);
</script>

{#if name}
	<span class="tag tone-{index}">{name}</span>
{:else}
	<span class="none">&mdash;</span>
{/if}

<style>
	.tag {
		display: inline-block;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
	}

	.tone-1 {
		background: var(--category-1-surface);
		color: var(--category-1-text);
	}

	.tone-2 {
		background: var(--category-2-surface);
		color: var(--category-2-text);
	}

	.tone-3 {
		background: var(--category-3-surface);
		color: var(--category-3-text);
	}

	.tone-4 {
		background: var(--category-4-surface);
		color: var(--category-4-text);
	}

	.none {
		color: var(--text-secondary);
	}
</style>
