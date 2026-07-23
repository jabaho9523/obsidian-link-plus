import { App, TFile } from "obsidian";
import { DisplayNameMode } from "../settings";

export function getDisplayName(
	app: App,
	file: TFile,
	mode: DisplayNameMode,
): string {
	switch (mode) {
		case DisplayNameMode.Alias: {
			const aliases =
			app.metadataCache.getFileCache(file)?.frontmatter?.aliases;

			if (Array.isArray(aliases) && aliases.length > 0) {
				return aliases[0];
			}

			if (typeof aliases === "string") {
				return aliases;
			}

			return file.basename;
		}

		case DisplayNameMode.Filename:
		default:
			return file.basename;
	}
}
