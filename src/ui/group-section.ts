import { Notice, setIcon } from "obsidian";
import { MentionGroup } from "../types";
import { parseCommaSeparated } from "../settings";
import { linkAllMentions } from "../linker";
import { renderMentionRow } from "./mention-row";
import { ConfirmModal } from "./confirm-modal";
import { AliasModal } from "./alias-modal";
import LinkPlusPlugin from "../main";

export function renderGroupSection(
	container: HTMLElement,
	group: MentionGroup,
	plugin: LinkPlusPlugin,
	collapsed: boolean,
	onToggle: (collapsed: boolean) => void
): void {
	const section = container.createDiv({ cls: "lp-group" });
	if (collapsed) section.addClass("lp-collapsed");

	const header = section.createDiv({ cls: "lp-group-header" });

	const chev = header.createSpan({ cls: "lp-chevron" });
	setIcon(chev, "chevron-down");

	const icon = header.createSpan({ cls: "lp-group-icon" });
	setIcon(icon, "file-text");

	header.createSpan({
		cls: "lp-group-name",
		text: group.targetFile.basename,
	});

	header.createSpan({
		cls: "lp-group-count",
		text: String(group.mentions.length),
	});

	// Edit aliases
	const editBtn = header.createEl("button", { cls: "lp-action" });
	editBtn.ariaLabel = `Edit aliases for ${group.targetFile.basename}`;
	setIcon(editBtn, "pencil");
	editBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		new AliasModal(plugin, group.targetFile).open();
	});

	// Link all for this note
	const linkAllBtn = header.createEl("button", { cls: "lp-action lp-group-link-all" });
	linkAllBtn.ariaLabel = `Link all mentions of ${group.targetFile.basename}`;
	setIcon(linkAllBtn, "link");
	linkAllBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		const doLink = async () => {
			const count = await linkAllMentions(
				plugin.app,
				group.mentions
			);
			new Notice(`Linked ${count} mention${count === 1 ? "" : "s"}`);
			plugin.orchestrator.invalidate();
			void plugin.orchestrator.scan();
		};
		if (plugin.settings.confirmBatchLink) {
			new ConfirmModal(
				plugin.app,
				"Link all mentions?",
				`Convert ${group.mentions.length} mention${group.mentions.length === 1 ? "" : "s"} of "${group.targetFile.basename}" to wikilinks?`,
				"Link all",
				doLink
			).open();
		} else {
			void doLink();
		}
	});

	// Ignore all — adds target note to excluded notes
	const ignoreAllBtn = header.createEl("button", { cls: "lp-action" });
	ignoreAllBtn.ariaLabel = `Ignore all mentions of ${group.targetFile.basename}`;
	setIcon(ignoreAllBtn, "x");
	ignoreAllBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		const title = group.targetFile.basename;
		const current = parseCommaSeparated(plugin.settings.excludedNotes);
		if (!current.some((n) => n.toLowerCase() === title.toLowerCase())) {
			current.push(title);
			plugin.settings.excludedNotes = current.join(", ");
		}
		void (async () => {
			await plugin.saveSettings();
			plugin.orchestrator.invalidate();
			void plugin.orchestrator.scan();
		})();
	});

	const body = section.createDiv({ cls: "lp-group-body" });
	for (const mention of group.mentions) {
		renderMentionRow(body, mention, plugin);
	}

	header.addEventListener("click", () => {
		const nowCollapsed = !section.hasClass("lp-collapsed");
		section.toggleClass("lp-collapsed", nowCollapsed);
		onToggle(nowCollapsed);
	});
}
