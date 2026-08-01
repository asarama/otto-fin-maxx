<script lang="ts">
	interface Props {
		label: string;
		glyph: string;
		disabled?: boolean;
		onclick?: () => void;
	}

	let { label, glyph, disabled = false, onclick }: Props = $props();
</script>

<button class="icon-btn" type="button" aria-label={label} title={label} {disabled} {onclick}>
	<span aria-hidden="true">{glyph}</span>
</button>

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--motion-fast),
			color var(--motion-fast);
	}

	.icon-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}

	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
