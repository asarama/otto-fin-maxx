<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	let { children } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/transactions', label: 'Transactions' },
		{ href: '/review', label: 'Review' },
		{ href: '/budgets', label: 'Budgets' },
		{ href: '/accounts', label: 'Accounts' },
		{ href: '/vendors', label: 'Vendors' },
		{ href: '/rules', label: 'Rules' },
	] as const;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav>
	<ul>
		{#each links as link (link.href)}
			<li><a href={resolve(link.href)}>{link.label}</a></li>
		{/each}
	</ul>
</nav>

{@render children()}

<style>
	nav ul {
		display: flex;
		gap: 1rem;
		list-style: none;
		padding: 0;
	}
	:global(body) {
		font-family: system-ui, sans-serif;
		max-width: 900px;
		margin: 1rem auto;
		padding: 0 1rem;
	}
	:global(table) {
		border-collapse: collapse;
		width: 100%;
	}
	:global(th),
	:global(td) {
		border: 1px solid #ccc;
		padding: 0.25rem 0.5rem;
		text-align: left;
	}
</style>
