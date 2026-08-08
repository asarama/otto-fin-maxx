<script lang="ts">
	interface Props {
		name: string;
		size?: number;
	}

	let { name, size = 22 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'dashboard'}
		<rect x="3" y="3" width="7" height="7" rx="1.5" />
		<rect x="14" y="3" width="7" height="7" rx="1.5" />
		<rect x="14" y="14" width="7" height="7" rx="1.5" />
		<rect x="3" y="14" width="7" height="7" rx="1.5" />
	{:else if name === 'transactions'}
		<path d="m16 3 4 4-4 4" />
		<path d="M20 7H4" />
		<path d="m8 21-4-4 4-4" />
		<path d="M4 17h16" />
	{:else if name === 'review'}
		<path d="M22 12h-6l-2 3h-4l-2-3H2" />
		<path
			d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
		/>
	{:else if name === 'budgets'}
		<path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
		<path d="M22 12A10 10 0 0 0 12 2v10z" />
	{:else if name === 'accounts'}
		<rect x="2" y="5" width="20" height="14" rx="2.5" />
		<path d="M2 10h20" />
	{:else if name === 'vendors'}
		<path d="M3.5 3h17L22 8H2z" />
		<path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
		<path d="M9 20v-6h6v6" />
	{:else if name === 'rules'}
		<path d="M4 21v-7" />
		<path d="M4 10V3" />
		<path d="M12 21v-9" />
		<path d="M12 8V3" />
		<path d="M20 21v-5" />
		<path d="M20 12V3" />
		<path d="M1 14h6" />
		<path d="M9 8h6" />
		<path d="M17 16h6" />
	{/if}
</svg>
