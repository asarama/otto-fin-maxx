<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		type?: 'button' | 'submit';
		busy?: boolean;
		disabled?: boolean;
		title?: string;
		onclick?: () => void;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		type = 'button',
		busy = false,
		disabled = false,
		title,
		onclick,
		children,
	}: Props = $props();
</script>

<button
	class="btn {variant} {size}"
	{type}
	{title}
	{onclick}
	disabled={disabled || busy}
	aria-busy={busy}
>
	{#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: none;
		border-radius: var(--radius-pill);
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color var(--motion-fast),
			color var(--motion-fast);
	}

	.btn:active:not(:disabled) {
		transform: translateY(1px);
	}

	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
	}

	.md {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-md);
	}

	.lg {
		padding: var(--space-3) var(--space-6);
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.primary {
		background: var(--accent-strong);
		color: var(--on-accent);
	}

	.primary.lg {
		background: var(--accent);
	}

	.primary:hover:not(:disabled) {
		background: var(--accent-pressed);
	}

	.secondary {
		background: var(--surface-primary);
		color: var(--text-primary);
		box-shadow: inset 0 0 0 1px var(--border-default);
	}

	.secondary:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.ghost {
		background: none;
		color: var(--text-secondary);
	}

	.ghost:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.danger {
		background: none;
		color: var(--text-negative);
		box-shadow: inset 0 0 0 1px var(--border-default);
	}

	.danger:hover:not(:disabled) {
		background: var(--negative-surface);
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
