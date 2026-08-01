export interface ParsedRow {
	postedDate: string;
	description: string;
	rawVendorName: string;
	amountCents: number;
}

export interface ParseResult {
	rows: ParsedRow[];
	errors: string[];
}
