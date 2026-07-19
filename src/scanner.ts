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
	const push = (start: number, end: number): void => {
		if (end > start) zones.push([start, end]);
	};
	let m: RegExpExecArray | null;

	// Frontmatter: leading --- ... ---
	if (content.startsWith("---")) {
		const endIdx = content.indexOf("\n---", 3);
		if (endIdx !== -1) push(0, endIdx + 4);
	}

	// Fenced code blocks: ``` or ~~~ fences, closing fence anchored to line
	const fenced = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
	while ((m = fenced.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Block math: $$ ... $$
	const mathBlock = /\$\$[\s\S]*?\$\$/g;
	while ((m = mathBlock.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// HTML comments and Obsidian comments
	const htmlComment = /<!--[\s\S]*?-->/g;
	while ((m = htmlComment.exec(content)) !== null) push(m.index, m.index + m[0].length);
	const obsComment = /%%[\s\S]*?%%/g;
	while ((m = obsComment.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Inline code: `...`
	const inlineCode = /`[^`\n]+`/g;
	while ((m = inlineCode.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Inline math: $...$ on a single line (heuristic; treats currency as math = safe)
	const inlineMath = /\$(?=\S)[^\n$]*?\S\$/g;
	while ((m = inlineMath.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Wikilinks and embeds: [[...]] / ![[...]]
	const wikilinks = /!?\[\[[^\]]+\]\]/g;
	while ((m = wikilinks.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Markdown links and images: [text](url) / ![alt](url)
	const mdLinks = /!?\[[^\]]*\]\([^)]*\)/g;
	while ((m = mdLinks.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Autolinks <scheme://...>
	const angleUrl = /<[a-z][a-z0-9+.-]*:\/\/[^>\s]+>/gi;
	while ((m = angleUrl.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Raw URLs
	const rawUrl = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/gi;
	while ((m = rawUrl.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// HTML tags <...>
	const htmlTag = /<\/?[a-zA-Z][^>]*>/g;
	while ((m = htmlTag.exec(content)) !== null) push(m.index, m.index + m[0].length);

	// Tags: #tag at start of line or after whitespace
	const tagRe = /(^|\s)(#[A-Za-z0-9_][A-Za-z0-9_/-]*)/g;
	while ((m = tagRe.exec(content)) !== null) {
		const lead = m[1] ?? "";
		const tag = m[2] ?? "";
		const start = m.index + lead.length;
		push(start, start + tag.length);
	}

	return mergeZones(zones);
}

function mergeZones(zones: [number, number][]): [number, number][] {
	if (zones.length === 0) return zones;
	zones.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged: [number, number][] = [];
	let current = zones[0]!;
	for (let i = 1; i < zones.length; i++) {
		const z = zones[i]!;
		if (z[0] <= current[1]) {
			if (z[1] > current[1]) current = [current[0], z[1]];
		} else {
			merged.push(current);
			current = z;
		}
	}
	merged.push(current);
	return merged;
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
