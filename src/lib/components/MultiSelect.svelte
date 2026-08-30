<script lang="ts">
	interface Props {
		label: string;
		options: { id: string; name: string }[];
		value: string[];
		onchange: (value: string[]) => void;
		placeholder?: string;
	}

	let { label, options, value, onchange, placeholder = 'Select…' }: Props = $props();

	let open = $state(false);
	let root: HTMLDivElement | undefined;

	const selectedNames = $derived(
		options.filter((option) => value.includes(option.id)).map((option) => option.name)
	);

	function toggle(optionId: string) {
		onchange(
			value.includes(optionId) ? value.filter((id) => id !== optionId) : [...value, optionId]
		);
	}

	$effect(() => {
		if (!open) return;
		function onPointerDown(event: PointerEvent) {
			if (root && !root.contains(event.target as Node)) open = false;
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') open = false;
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<div class="multi" bind:this={root}>
	<button
		class="trigger"
		type="button"
		aria-label={label}
		aria-expanded={open}
		aria-haspopup="listbox"
		onclick={() => (open = !open)}
	>
		<span class="summary">{selectedNames.length ? selectedNames.join(', ') : placeholder}</span>
		<svg
			class="chevron"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>
	{#if open}
		<div class="panel" role="group" aria-label={label}>
			{#each options as option (option.id)}
				<button
					class="option"
					class:selected={value.includes(option.id)}
					type="button"
					aria-pressed={value.includes(option.id)}
					onclick={() => toggle(option.id)}
				>
					<span class="check" aria-hidden="true">{value.includes(option.id) ? '✓' : ''}</span>
					<span>{option.name}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.multi {
		position: relative;
	}

	.trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 24ch;
		height: 40px;
		padding: var(--space-1) var(--space-3);
		background: var(--surface-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		color: var(--text-primary);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--motion-fast),
			box-shadow var(--motion-fast);
	}

	.trigger:hover {
		border-color: var(--text-secondary);
	}

	.trigger:focus-visible {
		outline: none;
		border-color: var(--accent-strong);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}

	.summary {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-sm);
	}

	.chevron {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		color: var(--text-tertiary);
	}

	.panel {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: 20;
		min-width: 100%;
		max-height: 220px;
		overflow-y: auto;
		padding: var(--space-1);
		background: var(--surface-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: 0 8px 24px var(--alpha-ink-24);
	}

	.option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.option:hover {
		background: var(--surface-hover);
	}

	.check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		font-size: 11px;
		line-height: 1;
		color: var(--on-accent);
	}

	.option.selected .check {
		background: var(--accent-strong);
		border-color: var(--accent-strong);
	}
</style>
