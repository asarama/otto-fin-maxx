<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		body?: string;
		action?: Snippet;
	}

	let { title, body, action }: Props = $props();
</script>

<div class="empty">
	<p class="title">{title}</p>
	{#if body}<p class="body">{body}</p>{/if}
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-7) var(--space-5);
		text-align: center;
	}

	.title {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.body {
		max-width: 44ch;
		color: var(--text-secondary);
	}

	.action {
		margin-top: var(--space-2);
	}
</style>
