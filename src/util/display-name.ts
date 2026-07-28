import { App, TFile } from "obsidian";
import { DisplayNameMode } from "../settings";
import { getPrimaryAlias } from "./aliases";

export function getDisplayName(
	app: App,
	file: TFile,
	mode: DisplayNameMode,
): string {
	switch (mode) {
		case DisplayNameMode.Alias:
			return getPrimaryAlias(app, file) ?? file.basename;

		case DisplayNameMode.Filename:
		default:
			return file.basename;
	}
}
