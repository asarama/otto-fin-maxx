<script lang="ts">
	import type { Snippet } from 'svelte';

	export interface Column {
		key: string;
		label: string;
		align?: 'start' | 'end';
		width?: string;
	}

	interface Props {
		columns: Column[];
		caption?: string;
		empty?: Snippet;
		children: Snippet;
	}

	let { columns, caption, empty, children }: Props = $props();
</script>

<div class="wrap">
	<table>
		{#if caption}
			<caption class="visually-hidden">{caption}</caption>
		{/if}
		<thead>
			<tr>
				{#each columns as column (column.key)}
					<th scope="col" style:width={column.width} class:end={column.align === 'end'}>
						{column.label}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{@render children()}
		</tbody>
	</table>
	{#if empty}
		{@render empty()}
	{/if}
</div>

<style>
	.wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	th.end {
		text-align: right;
	}
</style>
