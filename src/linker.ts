import { App } from "obsidian";
import { UnlinkedMention } from "./types";
import { ScanOrchestrator } from "./scan/orchestrator";

export async function linkSingleMention(
	app: App,
	mention: UnlinkedMention,
	orchestrator: ScanOrchestrator
): Promise<boolean> {
	const content = await app.vault.read(mention.sourceFile);

	// Verify the match still exists at the stored offset
	const actual = content.slice(
		mention.offset,
		mention.offset + mention.matchedText.length
	);
	if (actual.toLowerCase() !== mention.matchedText.toLowerCase()) {
		return false;
	}

	const replacement = buildWikilink(
		mention.targetFile.basename,
		actual
	);
	const newContent =
		content.slice(0, mention.offset) +
		replacement +
		content.slice(mention.offset + mention.matchedText.length);

	await app.vault.modify(mention.sourceFile, newContent);
	orchestrator.removeMention(mention.sourceFile.path, mention.offset);
	return true;
}

export async function linkMentionsInFile(
	app: App,
	mentions: UnlinkedMention[]
): Promise<number> {
	if (mentions.length === 0) return 0;

	const sourceFile = mentions[0]!.sourceFile;
	const content = await app.vault.read(sourceFile);

	// Sort by offset descending so replacements don't shift positions
	const sorted = [...mentions].sort((a, b) => b.offset - a.offset);
	let modified = content;
	let linked = 0;

	for (const mention of sorted) {
		const actual = modified.slice(
			mention.offset,
			mention.offset + mention.matchedText.length
		);
		if (actual.toLowerCase() !== mention.matchedText.toLowerCase()) {
			continue;
		}

		const replacement = buildWikilink(
			mention.targetFile.basename,
			actual
		);
		modified =
			modified.slice(0, mention.offset) +
			replacement +
			modified.slice(mention.offset + mention.matchedText.length);
		linked++;
	}

	if (linked > 0) {
		await app.vault.modify(sourceFile, modified);
	}
	return linked;
}

export async function linkAllMentions(
	app: App,
	mentions: UnlinkedMention[]
): Promise<number> {
	// Group by source file
	const byFile = new Map<string, UnlinkedMention[]>();
	for (const m of mentions) {
		const key = m.sourceFile.path;
		let arr = byFile.get(key);
		if (!arr) {
			arr = [];
			byFile.set(key, arr);
		}
		arr.push(m);
	}

	let total = 0;
	for (const fileMentions of byFile.values()) {
		total += await linkMentionsInFile(app, fileMentions);
	}
	return total;
}

function buildWikilink(targetTitle: string, matchedText: string): string {
	if (matchedText === targetTitle) {
		return `[[${targetTitle}]]`;
	}
	return `[[${targetTitle}|${matchedText}]]`;
}
