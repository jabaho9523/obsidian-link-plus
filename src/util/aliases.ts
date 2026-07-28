import { App, CachedMetadata, TFile } from "obsidian";

/**
 * Returns all valid aliases for a note.
 *
 * - trims whitespace
 * - removes empty aliases
 * - preserves alias order
 */
export function getAliases(
	app: App,
	file: TFile,
): string[] {
	const cache: CachedMetadata | null =
	app.metadataCache.getFileCache(file);

	if (!cache?.frontmatter) {
		return [];
	}

	const raw = cache.frontmatter["aliases"];
	const aliases: string[] = [];

	if (Array.isArray(raw)) {
		for (const value of raw) {
			if (typeof value !== "string") continue;

			const alias = value.trim();
			if (alias.length > 0) {
				aliases.push(alias);
			}
		}
	} else if (typeof raw === "string") {
		const alias = raw.trim();
		if (alias.length > 0) {
			aliases.push(alias);
		}
	}

	return aliases;
}

/**
 * Returns the first alias if one exists.
 */
export function getPrimaryAlias(
	app: App,
	file: TFile,
): string | null {
	const aliases = getAliases(app, file);
	return aliases[0] ?? null;
}

/**
 * Returns true if the note has at least one alias.
 */
export function hasAliases(
	app: App,
	file: TFile,
): boolean {
	return getAliases(app, file).length > 0;
}
