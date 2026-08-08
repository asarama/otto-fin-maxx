<script lang="ts">
	import Button from './Button.svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		label: string;
		confirmLabel?: string;
		onconfirm: () => void | Promise<void>;
	}

	let { label, confirmLabel = 'Delete', onconfirm }: Props = $props();

	let armed = $state(false);
	let busy = $state(false);

	async function confirm() {
		busy = true;
		try {
			await onconfirm();
		} finally {
			busy = false;
			armed = false;
		}
	}
</script>

{#if armed}
	<span class="confirm">
		<Button variant="danger" size="sm" {busy} onclick={confirm}>{confirmLabel}</Button>
		<Button variant="ghost" size="sm" disabled={busy} onclick={() => (armed = false)}>Cancel</Button
		>
	</span>
{:else}
	<IconButton {label} glyph="✕" onclick={() => (armed = true)} />
{/if}

<style>
	.confirm {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		white-space: nowrap;
	}
</style>
