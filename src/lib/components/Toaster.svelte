<script lang="ts">
	import { toastStore } from '$lib/toasts.svelte';
</script>

<div class="toaster" aria-live="polite">
	{#each toastStore.toasts as toast (toast.id)}
		<div class="toast {toast.kind}" role={toast.kind === 'error' ? 'alert' : 'status'}>
			<span class="pill pill-kind">{toast.kind === 'ok' ? 'OK' : 'Error'}</span>
			<span class="message">{toast.message}</span>
			<button
				class="close"
				aria-label="Dismiss notification"
				onclick={() => toastStore.dismiss(toast.id)}
			>
				&times;
			</button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		right: var(--space-4);
		bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		z-index: 1000;
		max-width: min(480px, calc(100vw - var(--space-8)));
	}

	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: var(--surface-primary);
		border: 1px solid var(--border-default);
		box-shadow: 0 2px 12px var(--alpha-ink-35);
		font-size: var(--text-sm);
	}

	.message {
		flex: 1;
	}

	.pill-kind {
		display: inline-block;
		padding: calc(var(--space-1) / 2) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}

	.ok .pill-kind {
		background: var(--category-4-surface);
		color: var(--category-4-text);
	}

	.error .pill-kind {
		background: var(--category-1-surface);
		color: var(--category-1-text);
	}

	.close {
		border: none;
		background: none;
		color: var(--text-secondary);
		font-size: var(--text-lg);
		line-height: 1;
		cursor: pointer;
		padding: 0 var(--space-1);
	}
</style>
