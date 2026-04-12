import { App, PluginSettingTab, Setting } from "obsidian";
import LinkPlusPlugin from "./main";

export interface LinkPlusSettings {
	caseSensitive: boolean;
	minMatchLength: number;
	excludedFolders: string;
	excludedNotes: string;
	showContext: boolean;
	confirmBatchLink: boolean;
	autoRescanOnChange: boolean;
	openDashboardOnStart: boolean;
	/** "sourcePath::targetBasename" pairs the user dismissed */
	ignoredMentions: string[];
}

export const DEFAULT_SETTINGS: LinkPlusSettings = {
	caseSensitive: false,
	minMatchLength: 3,
	excludedFolders: "",
	excludedNotes: "",
	showContext: true,
	confirmBatchLink: true,
	autoRescanOnChange: true,
	openDashboardOnStart: false,
	ignoredMentions: [],
};

export function ignoreKey(sourcePath: string, targetBasename: string): string {
	return `${sourcePath}::${targetBasename}`;
}

export function parseCommaSeparated(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export class LinkPlusSettingTab extends PluginSettingTab {
	plugin: LinkPlusPlugin;

	constructor(app: App, plugin: LinkPlusPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Scanning").setHeading();

		new Setting(containerEl)
			.setName("Case-insensitive matching")
			.setDesc(
				"Match note titles regardless of uppercase and lowercase differences."
			)
			.addToggle((t) =>
				t
					.setValue(!this.plugin.settings.caseSensitive)
					.onChange(async (v) => {
						this.plugin.settings.caseSensitive = !v;
						await this.saveAndInvalidate();
					})
			);

		new Setting(containerEl)
			.setName("Minimum match length")
			.setDesc(
				"Ignore note titles shorter than this many characters."
			)
			.addText((t) =>
				t
					.setPlaceholder(String(DEFAULT_SETTINGS.minMatchLength))
					.setValue(String(this.plugin.settings.minMatchLength))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!isNaN(n) && n >= 1) {
							this.plugin.settings.minMatchLength = n;
							await this.saveAndInvalidate();
						}
					})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc(
				"Folders to skip during scanning, separated by commas."
			)
			.addText((t) =>
				t
					.setPlaceholder(String(DEFAULT_SETTINGS.excludedFolders))
					.setValue(this.plugin.settings.excludedFolders)
					.onChange(async (v) => {
						this.plugin.settings.excludedFolders = v;
						await this.saveAndInvalidate();
					})
			);

		new Setting(containerEl)
			.setName("Excluded notes")
			.setDesc(
				"Note titles to never match, separated by commas."
			)
			.addText((t) =>
				t
					.setPlaceholder(String(DEFAULT_SETTINGS.excludedNotes))
					.setValue(this.plugin.settings.excludedNotes)
					.onChange(async (v) => {
						this.plugin.settings.excludedNotes = v;
						await this.saveAndInvalidate();
					})
			);

		new Setting(containerEl).setName("Display").setHeading();

		new Setting(containerEl)
			.setName("Show context in results")
			.setDesc("Show surrounding text around each match in the dashboard.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showContext)
					.onChange(async (v) => {
						this.plugin.settings.showContext = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Behavior").setHeading();

		new Setting(containerEl)
			.setName("Require confirmation for batch link")
			.setDesc("Ask before converting mentions in batch.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.confirmBatchLink)
					.onChange(async (v) => {
						this.plugin.settings.confirmBatchLink = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-rescan on vault changes")
			.setDesc(
				"Debounced rescan after file edits (only while dashboard is open)."
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.autoRescanOnChange)
					.onChange(async (v) => {
						this.plugin.settings.autoRescanOnChange = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Open dashboard on startup")
			.setDesc("Automatically open the sidebar dashboard when Obsidian loads.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.openDashboardOnStart)
					.onChange(async (v) => {
						this.plugin.settings.openDashboardOnStart = v;
						await this.plugin.saveSettings();
					})
			);

		const ignoredCount = this.plugin.settings.ignoredMentions.length;
		if (ignoredCount > 0) {
			new Setting(containerEl)
				.setName("Clear ignored mentions")
				.setDesc(
					`${ignoredCount} mention${ignoredCount === 1 ? "" : "s"} currently ignored.`
				)
				.addButton((b) =>
					b
						.setButtonText("Clear all")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.ignoredMentions = [];
							await this.saveAndInvalidate();
							this.display();
						})
				);
		}
	}

	private async saveAndInvalidate(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.orchestrator.invalidate();
	}
}
