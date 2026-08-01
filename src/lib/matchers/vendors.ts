export interface VendorSpec {
	id: string;
	name: string;
	aliases: string[];
}

export function normalizeName(s: string): string {
	return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveVendor(rawName: string, vendors: VendorSpec[]): string | null {
	const target = normalizeName(rawName);
	for (const vendor of vendors) {
		if (normalizeName(vendor.name) === target) return vendor.id;
		for (const alias of vendor.aliases) {
			if (normalizeName(alias) === target) return vendor.id;
		}
	}
	return null;
}
