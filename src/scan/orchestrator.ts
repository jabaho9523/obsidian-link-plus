import { App } from "obsidian";
import { ScanResults } from "../types";
import { LinkPlusSettings } from "../settings";
import { TypedEventBus } from "../util/events";
import { scanVault } from "../scanner";

export type ScanEvents = {
	"scan:started": void;
	"scan:completed": ScanResults;
	"scan:error": Error;
};

export class ScanOrchestrator {
	readonly events = new TypedEventBus<ScanEvents>();
	private results: ScanResults | null = null;
	private running = false;

	constructor(
		private app: App,
		private getSettings: () => LinkPlusSettings
	) {}

	getResults(): ScanResults | null {
		return this.results;
	}

	isRunning(): boolean {
		return this.running;
	}

	invalidate(): void {
		this.results = null;
	}

	removeMention(sourceFilePath: string, offset: number): void {
		if (!this.results) return;
		this.results.mentions = this.results.mentions.filter(
			(m) => !(m.sourceFile.path === sourceFilePath && m.offset === offset)
		);
		this.events.emit("scan:completed", this.results);
	}

	async scan(): Promise<ScanResults> {
		if (this.running && this.results) return this.results;
		this.running = true;
		this.events.emit("scan:started", undefined);
		const startedAt = Date.now();

		try {
			const settings = this.getSettings();
			const mentions = await scanVault(this.app, settings);
			const results: ScanResults = {
				mentions,
				startedAt,
				finishedAt: Date.now(),
				fileCount: this.app.vault.getMarkdownFiles().length,
			};
			this.results = results;
			this.events.emit("scan:completed", results);
			return results;
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			this.events.emit("scan:error", err);
			throw err;
		} finally {
			this.running = false;
		}
	}
}
