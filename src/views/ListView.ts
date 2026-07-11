import { format, parseISO } from "date-fns";
import { ItemView, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_LIST } from "../constants";
import { revealLine } from "../editor/navigation";
import { getFile, toggleTaskChecked } from "../editor/writeBack";
import { t } from "../i18n";
import { TaskItem } from "../model/types";
import type { UltiTasksHost } from "../pluginTypes";
import { GroupedSection } from "./grouping";
import { findListMode } from "./listModes";

export class ListView extends ItemView {
	private modeType = "inbox";
	private rowsById: Map<string, HTMLElement> = new Map();

	constructor(
		leaf: WorkspaceLeaf,
		private host: UltiTasksHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_LIST;
	}

	getDisplayText(): string {
		return findListMode(this.modeType).label;
	}

	getIcon(): string {
		return findListMode(this.modeType).icon;
	}

	async onOpen(): Promise<void> {
		this.register(this.host.vaultIndex.onChange(() => this.render()));
		this.register(this.host.focusStore.onChange(() => this.updateFocusHighlight()));
		this.render();
	}

	getState(): Record<string, unknown> {
		return { mode: this.modeType };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const typed = state as { mode?: string } | undefined;
		if (typed?.mode) this.modeType = typed.mode;
		this.render();
		await super.setState(state, result);
	}

	private getSections(): GroupedSection[] {
		return findListMode(this.modeType).filter(this.host.vaultIndex.getAllTasks());
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("ultitasks-list-view");

		const groupsEl = root.createDiv({ cls: "ultitasks-list-groups" });
		this.renderGroups(groupsEl);
	}

	private renderGroups(container: HTMLElement): void {
		container.empty();
		this.rowsById.clear();

		const mode = findListMode(this.modeType);
		const header = container.createDiv({ cls: "ultitasks-list-header" });
		setIcon(header, mode.icon);
		header.createSpan({ text: mode.label });

		for (const section of this.getSections()) {
			const groupEl = container.createDiv({ cls: "ultitasks-list-group" });
			const heading = groupEl.createDiv({
				cls: section.isOverdue ? "ultitasks-list-group-heading is-overdue" : "ultitasks-list-group-heading",
			});
			heading.createSpan({ text: section.label });
			heading.createSpan({ cls: "ultitasks-list-group-count", text: String(section.items.length) });
			const itemsEl = groupEl.createDiv({ cls: "ultitasks-list-items" });
			for (const item of section.items) {
				this.renderItemRow(itemsEl, item);
				if (item !== section.items.last()) {
					this.renderLine(itemsEl);
				}
			}
		}
	}

	private renderItemRow(container: HTMLElement, item: TaskItem): void {
		const row = container.createDiv({ cls: "ultitasks-item-row" });
		this.rowsById.set(item.id, row);

		const focused = this.host.focusStore.get();
		if (focused && focused.id === item.id) {
			row.addClass("is-focused");
		}

		const checkbox = row.createEl("input", { type: "checkbox", cls: "ultitasks-checkbox" });
		checkbox.checked = item.checked;
		checkbox.addEventListener("click", (evt) => evt.stopPropagation());
		checkbox.addEventListener("change", () => void this.toggleTask(item));

		const main = row.createDiv({ cls: "ultitasks-item-main" });
		const text = main.createDiv({
			cls: item.checked ? "ultitasks-item-text is-done" : "ultitasks-item-text",
		});
		text.setText(item.name || t.app.untitled);

		const meta = main.createDiv({ cls: "ultitasks-item-meta" });
		if (item.priority) {
			meta.createSpan({
				cls: `ultitasks-badge priority-${item.priority}`,
				text: t.group.priority(t.priority[item.priority]),
			});
		}
		if (item.date) {
			meta.createSpan({ cls: "ultitasks-badge", text: formatDateLabel(item.date) });
		}
		if (item.time) {
			meta.createSpan({ cls: "ultitasks-badge", text: item.time });
		}
		if (item.repeat !== "never") {
			const badge = meta.createSpan({ cls: "ultitasks-badge" });
			setIcon(badge.createSpan({ cls: "ultitasks-badge-icon" }), "repeat");
			badge.createSpan({ text: t.repeat[item.repeat] });
		}

		const openLink = row.createSpan({ cls: "ultitasks-item-open-link" });
		setIcon(openLink, "external-link");
		openLink.setAttribute("aria-label", t.app.openNote);
		openLink.addEventListener("click", (evt) => {
			evt.stopPropagation();
			void revealLine(this.host.app, item.file, item.line);
		});

		row.addEventListener("click", () => this.host.focusStore.set(item));
	}

	private renderLine(container: HTMLElement): void {
		container.createEl("hr", { cls: "ultitasks-list-line" });
	}

	private async toggleTask(task: TaskItem): Promise<void> {
		const ok = await toggleTaskChecked(this.host.app, task);
		if (!ok) return;
		const file = getFile(this.host.app, task.file);
		if (file) await this.host.vaultIndex.rescanFileNow(file);
	}

	private updateFocusHighlight(): void {
		const focused = this.host.focusStore.get();
		this.rowsById.forEach((row, id) => {
			row.toggleClass("is-focused", !!focused && focused.id === id);
		});
	}
}

function formatDateLabel(dateStr: string): string {
	return format(parseISO(dateStr), t.dateFormat.short);
}
