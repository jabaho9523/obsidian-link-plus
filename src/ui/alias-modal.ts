import { Modal, Notice, TFile, setIcon } from "obsidian";
import { findAliasOwner } from "../scanner";
import LinkPlusPlugin from "../main";

export class AliasModal extends Modal {
	private aliasListEl!: HTMLElement;

	constructor(
		private plugin: LinkPlusPlugin,
		private file: TFile
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("lp-alias-modal");
		contentEl.createEl("h3", { text: `Aliases for ${this.file.basename}` });

		contentEl.createEl("p", {
			cls: "lp-alias-desc",
			text: "Text matching any of these terms will be suggested as a link to this note.",
		});

		this.aliasListEl = contentEl.createDiv({ cls: "lp-alias-list" });
		this.renderChips();

		// Add alias input row
		const inputRow = contentEl.createDiv({ cls: "lp-alias-input" });
		const input = inputRow.createEl("input", {
			type: "text",
			placeholder: "New alias...",
		});
		const addBtn = inputRow.createEl("button", { text: "Add" });

		const doAdd = (): void => {
			const value = input.value.trim();
			if (!value) return;
			void this.addAlias(value, input);
		};

		addBtn.addEventListener("click", doAdd);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				doAdd();
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderChips(): void {
		this.aliasListEl.empty();
		const aliases = this.getCurrentAliases();

		if (aliases.length === 0) {
			this.aliasListEl.createSpan({
				cls: "lp-alias-empty",
				text: "No aliases yet.",
			});
			return;
		}

		for (const alias of aliases) {
			const chip = this.aliasListEl.createDiv({ cls: "lp-alias-chip" });
			chip.createSpan({ text: alias });
			const removeBtn = chip.createSpan({ cls: "lp-alias-chip-remove" });
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", () => {
				void this.removeAlias(alias);
			});
		}
	}

	private getCurrentAliases(): string[] {
		const cache = this.app.metadataCache.getFileCache(this.file);
		if (!cache?.frontmatter) return [];
		const raw: unknown = cache.frontmatter["aliases"];
		if (Array.isArray(raw)) {
			return raw.filter((a): a is string => typeof a === "string" && a.length > 0);
		}
		if (typeof raw === "string" && raw.length > 0) return [raw];
		return [];
	}

	private async addAlias(alias: string, input: HTMLInputElement): Promise<void> {
		// Check if already an alias of this note
		const current = this.getCurrentAliases();
		if (current.some((a) => a.toLowerCase() === alias.toLowerCase())) {
			new Notice(`"${alias}" is already an alias of this note.`);
			return;
		}

		// Check uniqueness across vault
		const owner = findAliasOwner(this.app, alias, this.file);
		if (owner) {
			new Notice(
				`"${alias}" is already used by "${owner.basename}".`
			);
			return;
		}

		await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
			if (!Array.isArray(fm["aliases"])) {
				fm["aliases"] = [];
			}
			(fm["aliases"] as string[]).push(alias);
		});

		input.value = "";
		this.renderChips();
		this.plugin.orchestrator.invalidate();
		void this.plugin.orchestrator.scan();
	}

	private async removeAlias(alias: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
			if (!Array.isArray(fm["aliases"])) return;
			const arr = fm["aliases"] as string[];
			const idx = arr.findIndex(
				(a) => a.toLowerCase() === alias.toLowerCase()
			);
			if (idx !== -1) arr.splice(idx, 1);
			if (arr.length === 0) delete fm["aliases"];
		});

		this.renderChips();
		this.plugin.orchestrator.invalidate();
		void this.plugin.orchestrator.scan();
	}
}
