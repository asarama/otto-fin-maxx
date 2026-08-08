<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		hint?: string;
		error?: string;
		hideLabel?: boolean;
		children: Snippet;
	}

	let { label, hint, error, hideLabel = false, children }: Props = $props();
</script>

<label class="field">
	<span class="label" class:visually-hidden={hideLabel}>{label}</span>
	{@render children()}
	{#if error}
		<span class="error" role="alert">{error}</span>
	{:else if hint}
		<span class="hint">{hint}</span>
	{/if}
</label>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.hint {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.error {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-negative);
	}
</style>
