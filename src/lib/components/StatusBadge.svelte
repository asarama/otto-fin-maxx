<script lang="ts">
	interface Props {
		status: string;
	}

	let { status }: Props = $props();
</script>

<span class="badge {status}">{status}</span>

<style>
	.badge {
		display: inline-block;
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.auto {
		color: var(--text-secondary);
	}

	.manual {
		color: var(--accent-strong);
		background: var(--accent-subtle);
	}

	.unreviewed {
		color: var(--on-notice);
		background: var(--notice-surface);
	}
</style>
