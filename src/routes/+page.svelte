<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { centsToDollars } from '$lib/money';
	import { currentMonth, daysRemainingInMonth, monthLabel } from '$lib/month';
	import BudgetMeter from '$lib/components/BudgetMeter.svelte';
	import Card from '$lib/components/Card.svelte';
	import CategoryTag from '$lib/components/CategoryTag.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import InlineBanner from '$lib/components/InlineBanner.svelte';
	import MoneyText from '$lib/components/MoneyText.svelte';
	import MonthPicker from '$lib/components/MonthPicker.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatTile from '$lib/components/StatTile.svelte';

	let { data } = $props();

	const overCategories = $derived(
		data.categories.filter((c) => c.amountCents > 0 && c.spentCents > c.amountCents)
	);
	const daysLeft = $derived(data.month === currentMonth() ? daysRemainingInMonth() : null);
	const spentPct = $derived(
		data.totalLimit > 0 ? Math.round((data.totalSpent / data.totalLimit) * 100) : null
	);

	const owners = $derived.by(() => {
		const rows: { name: string; spentCents: number; amountCents: number }[] = [];
		for (const cat of data.categories) {
			const existing = rows.find((row) => row.name === cat.ownerName);
			const entry = existing ?? { name: cat.ownerName, spentCents: 0, amountCents: 0 };
			entry.spentCents += cat.spentCents;
			entry.amountCents += cat.amountCents;
			if (!existing) rows.push(entry);
		}
		const ratio = (row: { spentCents: number; amountCents: number }) =>
			row.amountCents > 0 ? row.spentCents / row.amountCents : -1;
		return rows.sort((a, b) => ratio(b) - ratio(a));
	});

	const overSummary = $derived.by(() => {
		const names = overCategories.map((c) => c.categoryName);
		if (names.length === 0) return '';
		const shown = names.slice(0, 3).join(', ');
		const rest = names.length - 3;
		const list = rest > 0 ? `${shown} and ${rest} more` : shown;
		return `${list} ${names.length === 1 ? 'is' : 'are'} over budget this month.`;
	});

	const columns = [
		{ key: 'category', label: 'Category' },
		{ key: 'owner', label: 'Owner / Budget' },
		{ key: 'spent', label: 'Spent', align: 'end' as const },
		{ key: 'limit', label: 'Limit', align: 'end' as const },
		{ key: 'remaining', label: 'Remaining', align: 'end' as const },
	];

	function changeMonth(month: string) {
		goto(resolve(`/?month=${month}`), { noScroll: true, keepFocus: true });
	}
</script>

<PageHeader title={monthLabel(data.month)} subtitle="Household spending against budget">
	{#snippet actions()}
		<MonthPicker month={data.month} onChange={changeMonth} />
	{/snippet}
</PageHeader>

{#if overCategories.length > 0}
	<InlineBanner tone="danger" title={overSummary}>
		{#snippet action()}
			<a href={resolve('/budgets')}>Budgets &rarr;</a>
		{/snippet}
	</InlineBanner>
{/if}

{#if data.unreviewed > 0}
	<InlineBanner
		tone="warning"
		title="{data.unreviewed} transaction{data.unreviewed === 1
			? ' is'
			: 's are'} uncategorized and not counted below."
	>
		{#snippet action()}
			<a href={resolve('/review')}>Review &rarr;</a>
		{/snippet}
	</InlineBanner>
{/if}

{#if data.categories.length === 0}
	<Card>
		<EmptyState title="Nothing to show yet" body="Add an account and import a CSV to get started.">
			{#snippet action()}
				<a href={resolve('/accounts')}>Go to Accounts &rarr;</a>
			{/snippet}
		</EmptyState>
	</Card>
{:else}
	<div class="stats">
		<Card>
			<StatTile label="Spent" sub={spentPct === null ? 'no limits set' : `${spentPct}% of budget`}>
				<MoneyText cents={data.totalSpent} tone="spend" size="xl" />
			</StatTile>
		</Card>
		<Card>
			<StatTile label="Budgeted" sub="{data.categories.length} categories">
				<MoneyText cents={data.totalLimit} tone="neutral" size="xl" />
			</StatTile>
		</Card>
		<Card>
			<StatTile label="Remaining" sub={daysLeft === null ? undefined : `${daysLeft} days left`}>
				{#if data.totalLimit === 0}
					<span class="dash">&mdash;</span>
				{:else}
					<MoneyText cents={data.totalLimit - data.totalSpent} size="xl" />
				{/if}
			</StatTile>
		</Card>
		<Card>
			<StatTile label="Over" sub="categories">
				{overCategories.length} of {data.categories.length}
			</StatTile>
		</Card>
	</div>

	<Card>
		<h2 class="card-title">By owner</h2>
		<ul class="owners">
			{#each owners as owner (owner.name)}
				<li>
					<span class="owner-name">{owner.name}</span>
					<BudgetMeter
						spentCents={owner.spentCents}
						limitCents={owner.amountCents}
						label={owner.name}
					/>
					<span class="owner-figures">
						{centsToDollars(owner.spentCents)} / {centsToDollars(owner.amountCents)}
					</span>
				</li>
			{/each}
		</ul>
	</Card>

	<div class="table-card">
		<Card>
			<h2 class="card-title">Categories</h2>
			<DataTable {columns} caption="Budget categories for {monthLabel(data.month)}">
				{#each data.categories as cat (cat.id)}
					<tr class:over={cat.amountCents > 0 && cat.spentCents > cat.amountCents}>
						<td>
							<a
								class="row-link"
								href={resolve(`/transactions?month=${data.month}&category=${cat.budgetCategoryId}`)}
							>
								<CategoryTag name={cat.categoryName} />
							</a>
						</td>
						<td class="muted">{cat.ownerName} / {cat.budgetName}</td>
						<td class="end"><MoneyText cents={cat.spentCents} tone="spend" /></td>
						<td class="end"><MoneyText cents={cat.amountCents} tone="neutral" /></td>
						<td class="end"><MoneyText cents={cat.amountCents - cat.spentCents} /></td>
					</tr>
					<tr class="meter-row">
						<td colspan={columns.length}>
							<BudgetMeter
								spentCents={cat.spentCents}
								limitCents={cat.amountCents}
								label={cat.categoryName}
								showLabel
							/>
						</td>
					</tr>
				{/each}
			</DataTable>
		</Card>
	</div>
{/if}

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}

	.card-title {
		font-size: var(--text-lg);
		margin-bottom: var(--space-4);
	}

	.table-card {
		margin-top: var(--space-5);
	}

	.owners {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.owners li {
		display: grid;
		grid-template-columns: 8ch minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-4);
	}

	.owner-name {
		font-weight: 600;
	}

	.owner-figures {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	tr:not(.meter-row):hover td {
		background: var(--surface-hover);
	}

	td {
		padding: var(--space-2) var(--space-3);
		vertical-align: middle;
	}

	td.end {
		text-align: right;
	}

	td.muted {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.meter-row td {
		padding: 0 var(--space-3) var(--space-4);
	}

	tr.over td:first-child {
		box-shadow: inset 2px 0 0 var(--negative);
	}

	.row-link {
		text-decoration: none;
	}

	.dash {
		color: var(--text-secondary);
	}

	@media (max-width: 1000px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.stats {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
