<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		actions?: Snippet;
	}

	let { title, subtitle, actions }: Props = $props();
</script>

<header class="header">
	<div>
		<h1>{title}</h1>
		{#if subtitle}
			<p class="subtitle">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}

	h1 {
		font-size: var(--text-2xl);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin-top: var(--space-1);
		color: var(--text-secondary);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
