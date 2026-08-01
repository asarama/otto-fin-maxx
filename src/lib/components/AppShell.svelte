<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavRail from './NavRail.svelte';

	interface Props {
		unreviewedCount?: number;
		children: Snippet;
	}

	let { unreviewedCount = 0, children }: Props = $props();
</script>

<div class="shell">
	<NavRail {unreviewedCount} />
	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
		max-width: 1280px;
		margin: 0 auto;
		padding: var(--space-5);
	}

	.content {
		min-width: 0;
		padding-bottom: var(--space-8);
	}

	@media (max-width: 900px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
