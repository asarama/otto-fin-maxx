<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		description?: string;
		actions?: Snippet;
		children: Snippet;
	}

	let { title, description, actions, children }: Props = $props();
</script>

<section class="section">
	{#if title || actions}
		<div class="head">
			<div>
				{#if title}<h2>{title}</h2>{/if}
				{#if description}<p class="description">{description}</p>{/if}
			</div>
			{#if actions}
				<div class="actions">{@render actions()}</div>
			{/if}
		</div>
	{/if}
	{@render children()}
</section>

<style>
	.section {
		margin-bottom: var(--space-7);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-4);
	}

	h2 {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.description {
		margin-top: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
