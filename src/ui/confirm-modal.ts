import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly body: string,
		private readonly confirmText: string,
		private readonly onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.title });
		contentEl.createEl("p", { text: this.body });

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Cancel").onClick(() => this.close())
			)
			.addButton((b) =>
				b
					.setButtonText(this.confirmText)
					.setWarning()
					.onClick(async () => {
						this.close();
						await this.onConfirm();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
