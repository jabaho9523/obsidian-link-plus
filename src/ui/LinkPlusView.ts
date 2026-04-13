import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_LINK_PLUS, PLUGIN_NAME } from "../constants";
import { ScanResults, groupByTarget, uniqueSourceCount } from "../types";
import { linkAllMentions } from "../linker";
import { renderGroupSection } from "./group-section";
import { ConfirmModal } from "./confirm-modal";
import { NotePickerModal } from "./note-picker-modal";
import LinkPlusPlugin from "../main";

export class LinkPlusView extends ItemView {
	private plugin: LinkPlusPlugin;
	private collapsed: Record<string, boolean> = {};
	private unsubscribes: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: LinkPlusPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LINK_PLUS;
	}

	getDisplayText(): string {
		return PLUGIN_NAME;
	}

	getIcon(): string {
		return "link";
	}

	onOpen(): Promise<void> {
		const completedUnsub = this.plugin.orchestrator.events.on(
			"scan:completed",
			() => this.render()
		);
		this.unsubscribes.push(completedUnsub);
		this.plugin.register(completedUnsub);

		const startedUnsub = this.plugin.orchestrator.events.on(
			"scan:started",
			() => this.renderScanning()
		);
		this.unsubscribes.push(startedUnsub);
		this.plugin.register(startedUnsub);

		this.render();

		if (!this.plugin.orchestrator.getResults()) {
			void this.plugin.orchestrator.scan();
		}
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		for (const unsub of this.unsubscribes) {
			unsub();
		}
		this.unsubscribes = [];
		this.contentEl.empty();
		return Promise.resolve();
	}

	private renderScanning(): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "lp-root" });
		const header = root.createDiv({ cls: "lp-header" });
		header.createEl("h2", { cls: "lp-title", text: PLUGIN_NAME });
		root.createDiv({ cls: "lp-summary", text: "Scanning vault..." });
	}

	private render(): void {
		const results = this.plugin.orchestrator.getResults();
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "lp-root" });

		// Header
		const header = root.createDiv({ cls: "lp-header" });
		header.createEl("h2", { cls: "lp-title", text: PLUGIN_NAME });
		const headerActions = header.createDiv({ cls: "lp-header-actions" });

		// Add aliases button
		const addAliasBtn = headerActions.createEl("button", { cls: "lp-action" });
		addAliasBtn.ariaLabel = "Add aliases to a note";
		setIcon(addAliasBtn, "plus");
		addAliasBtn.addEventListener("click", () => {
			new NotePickerModal(this.plugin).open();
		});

		// Rescan button
		const rescan = headerActions.createEl("button", { cls: "lp-action" });
		rescan.ariaLabel = "Rescan vault";
		setIcon(rescan, "refresh-cw");
		rescan.addEventListener("click", () => {
			this.plugin.orchestrator.invalidate();
			void this.plugin.orchestrator.scan();
		});

		// Settings button
		const settingsBtn = headerActions.createEl("button", { cls: "lp-action" });
		settingsBtn.ariaLabel = "Open settings";
		setIcon(settingsBtn, "settings");
		settingsBtn.addEventListener("click", () => {
			const setting = (this.plugin.app as unknown as Record<string, unknown>)["setting"] as
				| { open: () => void; openTabById: (id: string) => void }
				| undefined;
			if (setting) {
				setting.open();
				setting.openTabById(this.plugin.manifest.id);
			}
		});

		if (!results) {
			root.createDiv({ cls: "lp-summary", text: "Scanning vault..." });
			return;
		}

		this.renderSummary(root, results);
		this.renderResults(root, results);
	}

	private renderSummary(root: HTMLElement, results: ScanResults): void {
		const count = results.mentions.length;
		const noteCount = uniqueSourceCount(results.mentions);
		const durationMs = Math.max(1, results.finishedAt - results.startedAt);

		let summaryText: string;
		if (count === 0) {
			summaryText = `No unlinked mentions found in ${results.fileCount} notes`;
		} else {
			summaryText = `${count} unlinked mention${count === 1 ? "" : "s"} across ${noteCount} note${noteCount === 1 ? "" : "s"} · scanned ${results.fileCount} notes in ${durationMs} ms`;
		}
		root.createDiv({ cls: "lp-summary", text: summaryText });

		// Batch "Link all" button
		if (count > 0) {
			const batchActions = root.createDiv({ cls: "lp-batch-actions" });
			const linkAllBtn = batchActions.createEl("button", {
				cls: "lp-action lp-link-all-btn",
			});
			linkAllBtn.textContent = `Link all (${count})`;
			linkAllBtn.addEventListener("click", () => {
				const doLink = async () => {
					const linked = await linkAllMentions(
						this.plugin.app,
						results.mentions
					);
					new Notice(
						`Linked ${linked} mention${linked === 1 ? "" : "s"}`
					);
					this.plugin.orchestrator.invalidate();
					void this.plugin.orchestrator.scan();
				};
				if (this.plugin.settings.confirmBatchLink) {
					new ConfirmModal(
						this.plugin.app,
						"Link all mentions?",
						`Convert all ${count} unlinked mention${count === 1 ? "" : "s"} to wikilinks? This cannot be undone.`,
						"Link all",
						doLink
					).open();
				} else {
					void doLink();
				}
			});
		}
	}

	private renderResults(root: HTMLElement, results: ScanResults): void {
		if (results.mentions.length === 0) {
			root.createDiv({
				cls: "lp-empty",
				text: "Your vault is fully linked.",
			});
			return;
		}

		const groups = groupByTarget(results.mentions);
		const groupsContainer = root.createDiv({ cls: "lp-groups" });

		for (const group of groups) {
			renderGroupSection(
				groupsContainer,
				group,
				this.plugin,
				this.collapsed[group.targetFile.path] === true,
				(v) => {
					this.collapsed[group.targetFile.path] = v;
				}
			);
		}
	}
}
