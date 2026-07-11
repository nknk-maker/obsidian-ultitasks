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

/** The note's display name: its file name without the folder path. */
function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

/**
 * The right-hand panel that edits the task currently under the cursor.
 *
 * The DOM is built exactly once (in {@link buildDom}) and thereafter only *patched in place*: values
 * are written onto the existing controls and whole sections are shown/hidden, but no element is ever
 * recreated. That is what keeps a text field's focus — and a native date/time input's segment cursor
 * (year → month → day, hour → minute) — alive while the focus store churns underneath, instead of
 * collapsing the field mid-typing the way a full `empty()` + rebuild did.
 */
export class EditPanelView extends ItemView {
	/** The task the panel is currently editing. Kept in sync via patches, decoupled from the store. */
	private task: TaskItem | null = null;
	/** Guards our change handlers against ToggleComponent.setValue firing them during a patch. */
	private patching = false;

	// Built-once element references, wired up in buildDom().
	private emptyEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private checkbox!: HTMLInputElement;
	private nameInput!: HTMLInputElement;
	private prioritySelect!: HTMLSelectElement;
	private scheduleToggle!: ToggleComponent;
	private scheduleDetailsEl!: HTMLElement;
	private dateInput!: HTMLInputElement;
	private allDayToggle!: ToggleComponent;
	private timeFieldEl!: HTMLElement;
	private timeInput!: HTMLInputElement;
	private repeatSelect!: HTMLSelectElement;
	private sourceTextEl!: HTMLElement;

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
		this.buildDom();
		this.register(this.host.focusStore.onChange(() => this.sync()));
		this.sync();
	}

	// --- Sync / patch ------------------------------------------------------

	/** True while the user is interacting with a control inside this panel. */
	private isEditing(): boolean {
		const root = this.contentEl;
		return root.contains(root.ownerDocument.activeElement);
	}

	/**
	 * Adopts the store's current task and patches the DOM — but never while the user is mid-edit here.
	 * The store fires on every cursor move / editor viewport change (and can even go null when a sidebar
	 * field takes focus); reacting to that mid-typing is exactly what used to drop focus.
	 */
	private sync(): void {
		if (this.isEditing()) return;
		this.patch(this.host.focusStore.get());
	}

	/** Writes `task` onto the existing controls without recreating any of them. */
	private patch(task: TaskItem | null): void {
		this.task = task;
		this.setShown(this.emptyEl, !task);
		this.setShown(this.bodyEl, !!task);
		if (!task) return;

		this.patching = true;
		this.checkbox.checked = task.checked;
		this.setValue(this.nameInput, task.name);
		this.setValue(this.prioritySelect, task.priority ?? "");

		this.scheduleToggle.setValue(!!task.date);
		this.setShown(this.scheduleDetailsEl, !!task.date);
		if (task.date) {
			this.setValue(this.dateInput, task.date);
			this.allDayToggle.setValue(task.allDay);
			this.setShown(this.timeFieldEl, !task.allDay);
			this.setValue(this.timeInput, task.time ?? "09:00");
			this.setValue(this.repeatSelect, task.repeat);
		}

		this.sourceTextEl.setText(`${fileName(task.file)} : ${t.app.sourceLine(task.line + 1)}`);
		this.patching = false;
	}

	/** Sets a control's value unless it is the focused element, which would disrupt in-progress editing. */
	private setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
		if (el.ownerDocument.activeElement !== el && el.value !== value) el.value = value;
	}

	private setShown(el: HTMLElement, shown: boolean): void {
		el.toggleClass("ultitasks-hidden", !shown);
	}

	// --- Build (once) ------------------------------------------------------

	private buildDom(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("ultitasks-edit-panel");

		this.emptyEl = root.createDiv({ cls: "ultitasks-empty-state" });
		setIcon(this.emptyEl.createDiv(), "mouse-pointer-click");
		this.emptyEl.createDiv({ text: t.app.placeCursor });

		this.bodyEl = root.createDiv({ cls: "ultitasks-edit-body" });
		this.buildHeader(this.bodyEl);
		this.buildPriorityCard(this.bodyEl);
		this.buildScheduleCard(this.bodyEl);
		this.buildSourceLink(this.bodyEl);
	}

	/** A labelled field: a column with a label and a control row. Returns both for later value/visibility. */
	private buildField(parent: HTMLElement, label: string): { wrap: HTMLElement; row: HTMLElement } {
		const wrap = parent.createDiv({ cls: "ultitasks-edit-field" });
		wrap.createDiv({ cls: "ultitasks-edit-field-label", text: label });
		return { wrap, row: wrap.createDiv({ cls: "ultitasks-edit-row" }) };
	}

	private buildSelect(row: HTMLElement, options: Option[], onChange: () => void): HTMLSelectElement {
		const select = row.createEl("select");
		for (const { value, label } of options) select.createEl("option", { value, text: label });
		select.addEventListener("change", () => {
			if (!this.patching) onChange();
		});
		return select;
	}

	private buildHeader(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: "ultitasks-edit-header" });
		this.checkbox = header.createEl("input", { type: "checkbox", cls: "ultitasks-card-checkbox" });
		this.checkbox.addEventListener("change", () => {
			if (this.patching) return;
			void this.commit({
				checked: this.checkbox.checked,
				attrs: { done: this.checkbox.checked ? today() : undefined },
			});
		});
		this.nameInput = header.createEl("input", { type: "text", placeholder: t.app.taskNamePlaceholder });
		this.nameInput.addEventListener("change", () => {
			if (!this.patching) void this.commit({ name: this.nameInput.value });
		});
	}

	private buildPriorityCard(parent: HTMLElement): void {
		const card = parent.createDiv({ cls: "ultitasks-card" });
		card.createDiv({ cls: "ultitasks-card-title", text: t.edit.priority });
		const row = card.createDiv({ cls: "ultitasks-edit-row" });
		const options = [{ value: "", label: t.edit.none }, ...optionsFrom(PRIORITY_VALUES, t.priority)];
		this.prioritySelect = this.buildSelect(row, options, () =>
			void this.commit({ attrs: { priority: (this.prioritySelect.value || undefined) as Priority | undefined } }),
		);
	}

	private buildScheduleCard(parent: HTMLElement): void {
		const card = parent.createDiv({ cls: "ultitasks-card" });

		const titleRow = card.createDiv({ cls: "ultitasks-card-title-row" });
		titleRow.createSpan({ cls: "ultitasks-card-title", text: t.edit.schedule });
		this.scheduleToggle = new ToggleComponent(titleRow).onChange((on) => {
			if (this.patching) return;
			void this.commit({
				attrs: on
					? { date: this.task?.date ?? today(), allDay: true }
					: { date: undefined, time: undefined, repeat: "never" },
			});
		});

		this.scheduleDetailsEl = card.createDiv({ cls: "ultitasks-schedule-details" });

		const date = this.buildField(this.scheduleDetailsEl, t.edit.date);
		// Bound the year to 4 digits — a bare type="date" lets the year field grow to 6 digits.
		this.dateInput = date.row.createEl("input", { type: "date", attr: { min: "0001-01-01", max: "9999-12-31" } });
		this.dateInput.addEventListener("change", () => {
			if (this.patching) return;
			// Never write a cleared/invalid date back; the schedule toggle is how a date is removed.
			if (!this.dateInput.value) {
				this.dateInput.value = this.task?.date ?? "";
				return;
			}
			void this.commit({ attrs: { date: this.dateInput.value } });
		});

		const allDayRow = this.scheduleDetailsEl.createDiv({ cls: "ultitasks-checkbox-label-row" });
		const allDayLabel = allDayRow.createEl("label", { text: t.edit.allDay });
		this.allDayToggle = new ToggleComponent(allDayRow).onChange((on) => {
			if (this.patching) return;
			void this.commit({
				attrs: on ? { allDay: true, time: undefined } : { allDay: false, time: this.task?.time ?? "09:00" },
			});
		});
		allDayLabel.addEventListener("click", () => this.allDayToggle.toggleEl.click());

		const time = this.buildField(this.scheduleDetailsEl, t.edit.time);
		this.timeFieldEl = time.wrap;
		this.timeInput = time.row.createEl("input", { type: "time" });
		this.timeInput.addEventListener("change", () => {
			if (!this.patching) void this.commit({ attrs: { time: this.timeInput.value || "09:00" } });
		});

		const repeat = this.buildField(this.scheduleDetailsEl, t.edit.repeat);
		this.repeatSelect = this.buildSelect(repeat.row, optionsFrom(REPEAT_VALUES, t.repeat), () =>
			void this.commit({ attrs: { repeat: this.repeatSelect.value as RepeatRule } }),
		);
	}

	private buildSourceLink(parent: HTMLElement): void {
		const link = parent.createDiv({ cls: "ultitasks-edit-source-link" });
		setIcon(link.createSpan(), "file-text");
		this.sourceTextEl = link.createSpan();
		link.addEventListener("click", () => {
			if (this.task) void revealLine(this.host.app, this.task.file, this.task.line);
		});
	}

	// --- Persistence -------------------------------------------------------

	private async commit(updates: TaskUpdate): Promise<void> {
		const base = this.task;
		if (!base) return;
		const ok = await updateTask(this.host.app, base, updates);
		if (!ok) {
			// Genuine external conflict: resync to whatever the line actually is now.
			this.patch(this.host.focusStore.get());
			return;
		}
		const updated = applyTaskUpdate(base, updates);
		this.task = updated;
		this.host.focusStore.set(updated); // keep the list view / editor in sync; our own sync() no-ops while editing
		this.patch(updated); // reflect this edit now (e.g. "All day" off reveals the time field), keeping focus
		const file = getFile(this.host.app, base.file);
		if (file) await this.host.vaultIndex.rescanFileNow(file);
	}
}
