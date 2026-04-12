import { TFile } from "obsidian";

export interface UnlinkedMention {
	sourceFile: TFile;
	targetFile: TFile;
	matchedText: string;
	offset: number;
	line: number;
	context: string;
}

export interface ScanResults {
	mentions: UnlinkedMention[];
	startedAt: number;
	finishedAt: number;
	fileCount: number;
}

export interface MentionGroup {
	targetFile: TFile;
	mentions: UnlinkedMention[];
}

export function groupByTarget(mentions: UnlinkedMention[]): MentionGroup[] {
	const map = new Map<string, MentionGroup>();
	for (const m of mentions) {
		const key = m.targetFile.path;
		let group = map.get(key);
		if (!group) {
			group = { targetFile: m.targetFile, mentions: [] };
			map.set(key, group);
		}
		group.mentions.push(m);
	}
	return Array.from(map.values()).sort(
		(a, b) => b.mentions.length - a.mentions.length
	);
}

export function uniqueSourceCount(mentions: UnlinkedMention[]): number {
	const paths = new Set<string>();
	for (const m of mentions) {
		paths.add(m.sourceFile.path);
	}
	return paths.size;
}
