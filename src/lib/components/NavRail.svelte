<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';

	interface Props {
		unreviewedCount?: number;
	}

	let { unreviewedCount = 0 }: Props = $props();

	const links = [
		{ href: '/', icon: 'dashboard', label: 'Dashboard' },
		{ href: '/transactions', icon: 'transactions', label: 'Transactions' },
		{ href: '/review', icon: 'review', label: 'Review' },
		{ href: '/budgets', icon: 'budgets', label: 'Budgets' },
		{ href: '/accounts', icon: 'accounts', label: 'Accounts' },
		{ href: '/vendors', icon: 'vendors', label: 'Vendors' },
		{ href: '/rules', icon: 'rules', label: 'Rules' },
	] as const;

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<nav class="rail" aria-label="Primary">
	<a class="logo" href={resolve('/')} aria-label="Otto Finance home"></a>
	<ul>
		{#each links as link (link.href)}
			<li>
				<a
					href={resolve(link.href)}
					class="item"
					class:active={isActive(link.href)}
					title={link.label}
					aria-current={isActive(link.href) ? 'page' : undefined}
				>
					<Icon name={link.icon} />
					<span class="visually-hidden">{link.label}</span>
					{#if link.href === '/review' && unreviewedCount > 0}
						<span class="badge" aria-hidden="true">{unreviewedCount}</span>
						<span class="visually-hidden">{unreviewedCount} awaiting review</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.rail {
		position: sticky;
		top: var(--space-5);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-4) var(--space-3);
		border-radius: var(--radius-xl);
		background: var(--surface-primary);
	}

	.logo {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: var(--accent);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.item {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		color: var(--text-tertiary);
		text-decoration: none;
		transition:
			background-color var(--motion-fast),
			color var(--motion-fast);
	}

	.item:hover {
		background: var(--surface-hover);
		color: var(--text-secondary);
	}

	.item.active {
		background: var(--accent-subtle);
		color: var(--accent);
	}

	.badge {
		position: absolute;
		top: 1px;
		right: 1px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--on-accent);
		font-size: 11px;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
	}

	@media (max-width: 900px) {
		.rail {
			position: static;
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--space-4);
			overflow-x: auto;
		}

		ul {
			flex-direction: row;
		}
	}
</style>
