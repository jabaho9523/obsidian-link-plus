import { FuzzySuggestModal, TFile } from "obsidian";
import LinkPlusPlugin from "../main";
import { AliasModal } from "./alias-modal";

export class NotePickerModal extends FuzzySuggestModal<TFile> {
	constructor(private plugin: LinkPlusPlugin) {
		super(plugin.app);
		this.setPlaceholder("Pick a note to manage aliases...");
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		new AliasModal(this.plugin, file).open();
	}
}
