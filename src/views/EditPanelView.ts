import { format } from "date-fns";
import { ItemView, ToggleComponent, WorkspaceLeaf, setIcon } from "obsidian";
import { PRIORITY_VALUES, REPEAT_VALUES, VIEW_TYPE_EDIT } from "../constants";
import { revealLine } from "../editor/navigation";
import { TaskUpdate, applyTaskUpdate, getFile, updateTask } from "../editor/writeBack";
import { t } from "../i18n";
import { Priority, RepeatRule, TaskItem } from "../model/types";
import type { UltiTasksHost } from "../pluginTypes";

interface Option {
	value: string;
	label: string;
}

function today(): string {
	return format(new Date(), "yyyy-MM-dd");
}

/** Pairs an ordered list of values with their display labels for a <select>. */
function optionsFrom(values: readonly string[], labels: Record<string, string>): Option[] {
	return values.map((value) => ({ value, label: labels[value] }));
}

/** The right-hand panel that edits the task currently under the cursor. */
export class EditPanelView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private host: UltiTasksHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_EDIT;
	}

	getDisplayText(): string {
		return t.app.editTitle;
	}

	getIcon(): string {
		return "square-pen";
	}

	async onOpen(): Promise<void> {
		this.register(this.host.focusStore.onChange(() => this.render()));
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("ultitasks-edit-panel");

		const task = this.host.focusStore.get();
		if (!task) {
			const empty = root.createDiv({ cls: "ultitasks-empty-state" });
			setIcon(empty.createDiv(), "mouse-pointer-click");
			empty.createDiv({ text: t.app.placeCursor });
			return;
		}

		this.renderHeader(root, task);
		this.renderPriorityCard(root, task);
		this.renderScheduleCard(root, task);
		this.renderSourceLink(root, task);
	}

	// --- Building blocks ---------------------------------------------------

	private card(parent: HTMLElement): HTMLElement {
		return parent.createDiv({ cls: "ultitasks-card" });
	}

	private cardTitle(card: HTMLElement, label: string): void {
		card.createDiv({ cls: "ultitasks-card-title", text: label });
	}

	/** A card title with an on/off switch controlling the whole card. */
	private cardTitleToggle(card: HTMLElement, label: string, on: boolean, onChange: (on: boolean) => void): void {
		const row = card.createDiv({ cls: "ultitasks-card-title-row" });
		row.createSpan({ cls: "ultitasks-card-title", text: label });
		new ToggleComponent(row).setValue(on).onChange(onChange);
	}

	/** A label paired with an on/off switch (secondary option inside a card, e.g. "All day"). */
	private labeledToggle(card: HTMLElement, label: string, on: boolean, onChange: (on: boolean) => void): void {
		const row = card.createDiv({ cls: "ultitasks-checkbox-label-row" });
		const labelEl = row.createEl("label", { text: label });
		const toggle = new ToggleComponent(row).setValue(on).onChange(onChange);
		labelEl.addEventListener("click", () => toggle.toggleEl.click());
	}

	/** A labelled field wrapping a single control built by `fill`. */
	private field(card: HTMLElement, label: string, fill: (row: HTMLElement) => void): void {
		const wrap = card.createDiv({ cls: "ultitasks-edit-field" });
		wrap.createDiv({ cls: "ultitasks-edit-field-label", text: label });
		fill(wrap.createDiv({ cls: "ultitasks-edit-row" }));
	}

	private select(row: HTMLElement, options: Option[], selected: string, onChange: (value: string) => void): void {
		const select = row.createEl("select");
		for (const { value, label } of options) select.createEl("option", { value, text: label });
		select.value = selected;
		select.addEventListener("change", () => onChange(select.value));
	}

	// --- Sections ----------------------------------------------------------

	private renderHeader(root: HTMLElement, task: TaskItem): void {
		const header = root.createDiv({ cls: "ultitasks-edit-header" });
		const checkbox = header.createEl("input", { type: "checkbox", cls: "ultitasks-card-checkbox" });
		checkbox.checked = task.checked;
		checkbox.addEventListener("change", () =>
			void this.commit(task, {
				checked: checkbox.checked,
				attrs: { done: checkbox.checked ? today() : undefined },
			}),
		);
		const nameInput = header.createEl("input", { type: "text", placeholder: t.app.taskNamePlaceholder });
		nameInput.value = task.name;
		nameInput.addEventListener("change", () => void this.commit(task, { name: nameInput.value }));
	}

	private renderPriorityCard(root: HTMLElement, task: TaskItem): void {
		const card = this.card(root);
		this.cardTitle(card, t.edit.priority);
		const row = card.createDiv({ cls: "ultitasks-edit-row" });
		const options = [{ value: "", label: t.edit.none }, ...optionsFrom(PRIORITY_VALUES, t.priority)];
		this.select(row, options, task.priority ?? "", (value) =>
			void this.commit(task, { attrs: { priority: (value || undefined) as Priority | undefined } }),
		);
	}

	private renderScheduleCard(root: HTMLElement, task: TaskItem): void {
		const card = this.card(root);
		this.cardTitleToggle(card, t.edit.schedule, !!task.date, (on) =>
			void this.commit(task, {
				attrs: on ? { date: task.date ?? today(), allDay: true } : { date: undefined, time: undefined, repeat: "never" },
			}),
		);
		if (!task.date) return;

		this.field(card, t.edit.date, (row) => {
			const input = row.createEl("input", { type: "date" });
			input.value = task.date!;
			input.addEventListener("change", () => void this.commit(task, { attrs: { date: input.value } }));
			return input;
		});

		this.labeledToggle(card, t.edit.allDay, task.allDay, (on) =>
			void this.commit(task, {
				attrs: on ? { allDay: true, time: undefined } : { allDay: false, time: task.time ?? "09:00" },
			}),
		);

		if (!task.allDay) {
			this.field(card, t.edit.time, (row) => {
				const input = row.createEl("input", { type: "time" });
				input.value = task.time ?? "09:00";
				input.addEventListener("change", () => void this.commit(task, { attrs: { time: input.value || "09:00" } }));
				return input;
			});
		}

		this.field(card, t.edit.repeat, (row) =>
			this.select(row, optionsFrom(REPEAT_VALUES, t.repeat), task.repeat, (value) =>
				void this.commit(task, { attrs: { repeat: value as RepeatRule } }),
			),
		);
	}

	private renderSourceLink(root: HTMLElement, task: TaskItem): void {
		const link = root.createDiv({ cls: "ultitasks-edit-source-link" });
		setIcon(link.createSpan(), "file-text");
		const fileName = task.file.split("/").pop() ?? task.file;
		link.createSpan({ text: `${fileName} : ${t.app.sourceLine(task.line + 1)}` });
		link.addEventListener("click", () => void revealLine(this.host.app, task.file, task.line));
	}

	// --- Persistence -------------------------------------------------------

	private async commit(task: TaskItem, updates: TaskUpdate): Promise<void> {
		const ok = await updateTask(this.host.app, task, updates);
		if (!ok) {
			this.render();
			return;
		}
		this.host.focusStore.set(applyTaskUpdate(task, updates));
		const file = getFile(this.host.app, task.file);
		if (file) await this.host.vaultIndex.rescanFileNow(file);
	}
}
