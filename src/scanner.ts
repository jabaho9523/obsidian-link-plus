import { App, TFile, CachedMetadata } from "obsidian";
import { UnlinkedMention } from "./types";
import { LinkPlusSettings, ignoreKey, parseCommaSeparated } from "./settings";

interface TitleEntry {
	title: string;
	file: TFile;
	regex: RegExp;
}

export async function scanVault(
	app: App,
	settings: LinkPlusSettings
): Promise<UnlinkedMention[]> {
	const files = app.vault.getMarkdownFiles();
	const excludedFolders = parseCommaSeparated(settings.excludedFolders);
	const excludedNotes = new Set(
		parseCommaSeparated(settings.excludedNotes).map((s) => s.toLowerCase())
	);

	const titleEntries = buildTitleMap(app, files, settings, excludedNotes);
	const ignoredSet = new Set(settings.ignoredMentions);
	const mentions: UnlinkedMention[] = [];
	let count = 0;

	for (const file of files) {
		if (isInExcludedFolder(file, excludedFolders)) continue;

		const content = await app.vault.cachedRead(file);
		const exclusionZones = computeExclusionZones(content);
		const fileMentions = findMentionsInFile(
			file,
			content,
			titleEntries,
			exclusionZones
		);
		for (const m of fileMentions) {
			if (!ignoredSet.has(ignoreKey(m.sourceFile.path, m.targetFile.basename))) {
				mentions.push(m);
			}
		}

		count++;
		if (count % 50 === 0) {
			await new Promise((r) => activeWindow.setTimeout(r, 0));
		}
	}

	return mentions;
}

function buildTitleMap(
	app: App,
	files: TFile[],
	settings: LinkPlusSettings,
	excludedNotes: Set<string>
): TitleEntry[] {
	const entries: TitleEntry[] = [];
	const flags = settings.caseSensitive ? "g" : "gi";
	const seen = new Set<string>();

	for (const file of files) {
		const titles: string[] = [file.basename];

		const cache: CachedMetadata | null =
			app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			const aliases: unknown = cache.frontmatter["aliases"];
			if (Array.isArray(aliases)) {
				for (const a of aliases) {
					if (typeof a === "string" && a.length > 0) {
						titles.push(a);
					}
				}
			} else if (typeof aliases === "string" && aliases.length > 0) {
				titles.push(aliases);
			}
		}

		for (const title of titles) {
			if (title.length < settings.minMatchLength) continue;
			if (excludedNotes.has(title.toLowerCase())) continue;

			const key = settings.caseSensitive
				? title
				: title.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);

			const escaped = escapeRegex(title);
			const regex = new RegExp(`\\b${escaped}\\b`, flags);
			entries.push({ title, file, regex });
		}
	}

	// Sort by title length descending so longer matches take priority
	entries.sort((a, b) => b.title.length - a.title.length);
	return entries;
}

function findMentionsInFile(
	sourceFile: TFile,
	content: string,
	titleEntries: TitleEntry[],
	exclusionZones: [number, number][]
): UnlinkedMention[] {
	const mentions: UnlinkedMention[] = [];

	for (const entry of titleEntries) {
		// Skip self-references
		if (entry.file.path === sourceFile.path) continue;

		entry.regex.lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = entry.regex.exec(content)) !== null) {
			const offset = match.index;
			if (isInExclusionZone(offset, exclusionZones)) continue;

			const matchedText = match[0];
			const line = lineNumberAt(content, offset);
			const context = extractContext(content, offset, matchedText.length);

			mentions.push({
				sourceFile,
				targetFile: entry.file,
				matchedText,
				offset,
				line,
				context,
			});
		}
	}

	return mentions;
}

function computeExclusionZones(content: string): [number, number][] {
	const zones: [number, number][] = [];

	// Frontmatter: starts at position 0 with ---
	if (content.startsWith("---")) {
		const endIdx = content.indexOf("\n---", 3);
		if (endIdx !== -1) {
			zones.push([0, endIdx + 4]);
		}
	}

	// Fenced code blocks: ```...```
	const fencedCode = /^```[^\n]*\n[\s\S]*?^```/gm;
	let m: RegExpExecArray | null;
	while ((m = fencedCode.exec(content)) !== null) {
		zones.push([m.index, m.index + m[0].length]);
	}

	// Inline code: `...` (not inside fenced blocks — handled by zone overlap)
	const inlineCode = /`[^`\n]+`/g;
	while ((m = inlineCode.exec(content)) !== null) {
		zones.push([m.index, m.index + m[0].length]);
	}

	// Wikilinks: [[...]]
	const wikilinks = /\[\[[^\]]+\]\]/g;
	while ((m = wikilinks.exec(content)) !== null) {
		zones.push([m.index, m.index + m[0].length]);
	}

	// Markdown links: [text](url)
	const mdLinks = /\[[^\]]*\]\([^)]*\)/g;
	while ((m = mdLinks.exec(content)) !== null) {
		zones.push([m.index, m.index + m[0].length]);
	}

	// Sort by start position for binary search
	zones.sort((a, b) => a[0] - b[0]);
	return zones;
}

function isInExclusionZone(
	offset: number,
	zones: [number, number][]
): boolean {
	// Binary search for efficiency
	let lo = 0;
	let hi = zones.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const zone = zones[mid]!;
		if (offset < zone[0]) {
			hi = mid - 1;
		} else if (offset >= zone[1]) {
			lo = mid + 1;
		} else {
			return true;
		}
	}
	return false;
}

function isInExcludedFolder(file: TFile, excludedFolders: string[]): boolean {
	for (const folder of excludedFolders) {
		if (file.path.startsWith(folder + "/") || file.path.startsWith(folder + "\\")) {
			return true;
		}
	}
	return false;
}

function lineNumberAt(content: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

function extractContext(
	content: string,
	offset: number,
	matchLength: number
): string {
	const contextRadius = 30;
	const start = Math.max(0, offset - contextRadius);
	const end = Math.min(content.length, offset + matchLength + contextRadius);
	let snippet = content.slice(start, end);

	// Replace newlines with spaces for display
	snippet = snippet.replace(/\n/g, " ");

	if (start > 0) snippet = "..." + snippet;
	if (end < content.length) snippet = snippet + "...";

	return snippet;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findAliasOwner(
	app: App,
	alias: string,
	excludeFile?: TFile
): TFile | null {
	const lower = alias.toLowerCase();
	for (const file of app.vault.getMarkdownFiles()) {
		if (excludeFile && file.path === excludeFile.path) continue;
		if (file.basename.toLowerCase() === lower) return file;
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;
		const aliases: unknown = cache.frontmatter["aliases"];
		if (Array.isArray(aliases)) {
			for (const a of aliases) {
				if (typeof a === "string" && a.toLowerCase() === lower) return file;
			}
		} else if (typeof aliases === "string" && aliases.toLowerCase() === lower) {
			return file;
		}
	}
	return null;
}
