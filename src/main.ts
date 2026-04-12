import { Notice, Plugin, WorkspaceLeaf, debounce } from "obsidian";
import {
	DEFAULT_SETTINGS,
	LinkPlusSettingTab,
	LinkPlusSettings,
} from "./settings";
import { VIEW_TYPE_LINK_PLUS, RIBBON_ICON, PLUGIN_NAME } from "./constants";
import { ScanOrchestrator } from "./scan/orchestrator";
import { LinkPlusView } from "./ui/LinkPlusView";

export default class LinkPlusPlugin extends Plugin {
	settings!: LinkPlusSettings;
	orchestrator!: ScanOrchestrator;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.orchestrator = new ScanOrchestrator(this.app, () => this.settings);

		this.registerView(
			VIEW_TYPE_LINK_PLUS,
			(leaf: WorkspaceLeaf) => new LinkPlusView(leaf, this)
		);

		this.addRibbonIcon(RIBBON_ICON, `Open ${PLUGIN_NAME} dashboard`, () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "scan-vault",
			name: "Scan vault for unlinked mentions",
			callback: async () => {
				this.orchestrator.invalidate();
				const res = await this.orchestrator.scan();
				new Notice(
					`${PLUGIN_NAME}: ${res.mentions.length} unlinked mention${res.mentions.length === 1 ? "" : "s"} found`
				);
			},
		});

		const debouncedRescan = debounce(
			() => {
				void this.orchestrator
					.scan()
					.catch((e) =>
						console.warn("[Link Plus] rescan failed", e)
					);
			},
			1500,
			true
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				if (!this.settings.autoRescanOnChange) return;
				this.orchestrator.invalidate();
				if (
					this.app.workspace.getLeavesOfType(VIEW_TYPE_LINK_PLUS)
						.length > 0
				) {
					debouncedRescan();
				}
			})
		);

		this.addSettingTab(new LinkPlusSettingTab(this.app, this));

		if (this.settings.openDashboardOnStart) {
			this.app.workspace.onLayoutReady(() => {
				void this.activateView();
			});
		}
	}

	onunload(): void {
		this.orchestrator?.events.clear();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LinkPlusSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_LINK_PLUS);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf =
			workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_LINK_PLUS,
			active: true,
		});
		await workspace.revealLeaf(leaf);
	}
}
