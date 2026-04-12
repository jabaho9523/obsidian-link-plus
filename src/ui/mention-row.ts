import { MarkdownView, setIcon } from "obsidian";
import { UnlinkedMention } from "../types";
import { ignoreKey } from "../settings";
import { linkSingleMention } from "../linker";
import LinkPlusPlugin from "../main";

export function renderMentionRow(
	container: HTMLElement,
	mention: UnlinkedMention,
	plugin: LinkPlusPlugin
): void {
	const row = container.createDiv({ cls: "lp-row" });

	const main = row.createDiv({ cls: "lp-row-main" });

	// Source file name (clickable)
	const title = main.createDiv({ cls: "lp-row-title" });
	title.textContent = mention.sourceFile.basename;
	title.addEventListener("click", () => {
		void (async () => {
			const leaf = plugin.app.workspace.getLeaf("tab");
			await leaf.openFile(mention.sourceFile);
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.editor.setCursor({ line: mention.line, ch: 0 });
			}
		})();
	});

	// Context snippet with highlighted match
	if (plugin.settings.showContext) {
		const detail = main.createDiv({ cls: "lp-row-detail" });
		renderContextSnippet(detail, mention);
	}

	// Action buttons
	const actions = row.createDiv({ cls: "lp-row-actions" });

	// Link button
	const linkBtn = actions.createEl("button", { cls: "lp-action" });
	linkBtn.ariaLabel = "Convert to wikilink";
	setIcon(linkBtn, "link");
	linkBtn.addEventListener("click", () => {
		void (async () => {
			await linkSingleMention(
				plugin.app,
				mention,
				plugin.orchestrator
			);
		})();
	});

	// Open button
	const openBtn = actions.createEl("button", { cls: "lp-action" });
	openBtn.ariaLabel = "Open source file";
	setIcon(openBtn, "external-link");
	openBtn.addEventListener("click", () => {
		void (async () => {
			const leaf = plugin.app.workspace.getLeaf("tab");
			await leaf.openFile(mention.sourceFile);
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				view.editor.setCursor({ line: mention.line, ch: 0 });
			}
		})();
	});

	// Ignore button — dismiss this mention (source + target pair)
	const ignoreBtn = actions.createEl("button", { cls: "lp-action" });
	ignoreBtn.ariaLabel = "Ignore this mention";
	setIcon(ignoreBtn, "x");
	ignoreBtn.addEventListener("click", () => {
		void (async () => {
			const key = ignoreKey(
				mention.sourceFile.path,
				mention.targetFile.basename
			);
			if (!plugin.settings.ignoredMentions.includes(key)) {
				plugin.settings.ignoredMentions.push(key);
				await plugin.saveSettings();
			}
			plugin.orchestrator.removeMention(
				mention.sourceFile.path,
				mention.offset
			);
		})();
	});
}

function renderContextSnippet(
	container: HTMLElement,
	mention: UnlinkedMention
): void {
	const ctx = mention.context;
	const matchLower = mention.matchedText.toLowerCase();
	const ctxLower = ctx.toLowerCase();
	const idx = ctxLower.indexOf(matchLower);

	if (idx === -1) {
		container.textContent = ctx;
		return;
	}

	const before = ctx.slice(0, idx);
	const matched = ctx.slice(idx, idx + mention.matchedText.length);
	const after = ctx.slice(idx + mention.matchedText.length);

	if (before) container.appendText(before);
	const mark = container.createSpan({ cls: "lp-match" });
	mark.textContent = matched;
	if (after) container.appendText(after);
}
