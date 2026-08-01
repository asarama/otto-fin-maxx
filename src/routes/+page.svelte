<script lang="ts">
	import { centsToDollars } from '$lib/money';
	import { resolve } from '$app/paths';
	let { data } = $props();
</script>

<h1>Dashboard — {data.month}</h1>

{#if data.unreviewed > 0}
	<p><a href={resolve('/review')}>{data.unreviewed} transaction(s) need review</a></p>
{/if}

<p>
	Total limit: {centsToDollars(data.totalLimit)} &middot; Total spent: {centsToDollars(
		data.totalSpent
	)}
</p>

<table>
	<thead>
		<tr>
			<th>Owner</th>
			<th>Budget</th>
			<th>Category</th>
			<th>Spent</th>
			<th>Limit</th>
			<th>Remaining</th>
		</tr>
	</thead>
	<tbody>
		{#each data.categories as cat (cat.id)}
			<tr>
				<td>{cat.ownerName}</td>
				<td>{cat.budgetName}</td>
				<td>{cat.categoryName}</td>
				<td>{centsToDollars(cat.spentCents)}</td>
				<td>{centsToDollars(cat.amountCents)}</td>
				<td>{centsToDollars(cat.amountCents - cat.spentCents)}</td>
			</tr>
		{/each}
	</tbody>
</table>
