import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_NAV } from "../constants";
import type { UltiTasksHost } from "../host";
import { t } from "../i18n";
import { LIST_MODES, ListMode } from "./listModes";

export class SidebarNavView extends ItemView {
	private activeType: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private host: UltiTasksHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_NAV;
	}

	getDisplayText(): string {
		return t.app.navTitle;
	}

	getIcon(): string {
		return "check-check";
	}

	async onOpen(): Promise<void> {
		this.render();
		this.register(this.host.vaultIndex.onChange(() => this.render()));
	}

	private select(mode: ListMode, evt: MouseEvent): void {
		this.activeType = mode.type;
		this.render();
		void this.host.openListView(mode.type, evt.ctrlKey || evt.metaKey);
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("ultitasks-nav");

		const tasks = this.host.vaultIndex.getAllTasks();
		const section = container.createDiv({ cls: "ultitasks-nav-section" });
		for (const mode of LIST_MODES) {
			const el = section.createDiv({ cls: "ultitasks-nav-item" });
			if (mode.type === this.activeType) el.addClass("is-active");
			setIcon(el.createSpan({ cls: "ultitasks-nav-item-icon" }), mode.icon);
			el.createSpan({ text: mode.label });
			const count = mode.filter(tasks).reduce((n, group) => n + group.items.length, 0);
			if (count > 0) {
				el.createSpan({ cls: "ultitasks-nav-item-count", text: String(count) });
			}
			el.addEventListener("click", (evt) => this.select(mode, evt));
		}
	}
}
