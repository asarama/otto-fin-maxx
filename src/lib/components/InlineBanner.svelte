<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'info' | 'warning' | 'danger' | 'success';
		title: string;
		action?: Snippet;
		children?: Snippet;
	}

	let { tone = 'info', title, action, children }: Props = $props();
</script>

<div class="banner {tone}">
	<div class="text">
		<p class="title">{title}</p>
		{#if children}
			<div class="body">{@render children()}</div>
		{/if}
	</div>
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-3);
	}

	.title {
		font-weight: 600;
	}

	.body {
		margin-top: var(--space-1);
		font-size: var(--text-sm);
	}

	.info {
		background: var(--surface-secondary);
	}

	.warning {
		background: var(--notice-surface);
		color: var(--on-notice);
	}

	.success {
		background: var(--positive-surface);
		color: var(--on-positive);
	}

	.danger {
		background: var(--negative-surface);
		color: var(--on-negative);
	}

	.action {
		flex: none;
	}
</style>
