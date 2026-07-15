import { ItemView, ToggleComponent, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_EDIT } from "../constants";
import { revealLine } from "../editor/navigation";
import type { UltiTasksHost } from "../host";
import { t } from "../i18n";
import { todayStr } from "../model/dates";
import { DEFAULT_TIME, PRIORITY_VALUES, Priority, REPEAT_VALUES, RepeatRule, TaskItem, isAllDay } from "../model/task";
import { TaskUpdate } from "../model/update";

interface Option {
	value: string;
	label: string;
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
		this.register(this.host.vaultIndex.onChange(() => this.syncFromIndex()));
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

	/**
	 * VaultIndex is the authority for what the shown task's line actually contains — it reindexes on
	 * every file change. Whenever it reports one, re-adopt its version of the task this panel is
	 * showing, so the panel re-renders on any change to the underlying line — wherever it came from —
	 * and `this.task.raw` never lags behind the file (a stale raw would make the next edit plan a
	 * line edit whose `expectedRaw` no longer matches, tripping the conflict guard).
	 *
	 * Unlike sync(), this deliberately runs even while the user is editing here: it only ever
	 * refreshes the *same* task (matched by id), and patch() is focus-safe — it never rebuilds DOM
	 * and skips the focused control's value — so an in-progress edit is not disturbed.
	 */
	private syncFromIndex(): void {
		const current = this.task;
		if (!current) return;
		const fresh = this.host.vaultIndex.getAllTasks().find((candidate) => candidate.id === current.id);
		if (!fresh || fresh.raw === current.raw) return;
		this.host.focusStore.set(fresh);
		this.patch(fresh);
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
		this.setValue(this.prioritySelect, task.attrs.priority ?? "");

		const { date, time, repeat } = task.attrs;
		const allDay = isAllDay(task.attrs);
		this.scheduleToggle.setValue(!!date);
		this.setShown(this.scheduleDetailsEl, !!date);
		if (date) {
			this.setValue(this.dateInput, date);
			this.allDayToggle.setValue(allDay);
			this.setShown(this.timeFieldEl, !allDay);
			this.setValue(this.timeInput, time ?? DEFAULT_TIME);
			this.setValue(this.repeatSelect, repeat);
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
			// Reports the flip; the write plan carries its consequences (done stamp, recurrence) in the
			// same single write. See model/update.ts.
			void this.commit({ checked: this.checkbox.checked });
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
			// Reports only the date itself — clearing time/repeat when the date is removed is an
			// invariant the write plan applies (see normalizeAttrs), not something this control decides.
			void this.commit({ attrs: { date: on ? (this.task?.attrs.date ?? todayStr()) : undefined } });
		});

		this.scheduleDetailsEl = card.createDiv({ cls: "ultitasks-schedule-details" });

		const date = this.buildField(this.scheduleDetailsEl, t.edit.date);
		// Bound the year to 4 digits — a bare type="date" lets the year field grow to 6 digits.
		this.dateInput = date.row.createEl("input", { type: "date", attr: { min: "0001-01-01", max: "9999-12-31" } });
		this.dateInput.addEventListener("change", () => {
			if (this.patching) return;
			// Never write a cleared/invalid date back; the schedule toggle is how a date is removed.
			if (!this.dateInput.value) {
				this.dateInput.value = this.task?.attrs.date ?? "";
				return;
			}
			void this.commit({ attrs: { date: this.dateInput.value } });
		});

		const allDayRow = this.scheduleDetailsEl.createDiv({ cls: "ultitasks-checkbox-label-row" });
		const allDayLabel = allDayRow.createEl("label", { text: t.edit.allDay });
		this.allDayToggle = new ToggleComponent(allDayRow).onChange((on) => {
			if (this.patching) return;
			// All-day is derived from the absence of a time (see isAllDay), so toggling it just sets
			// or clears `time` directly — there is no separate flag to report.
			void this.commit({ attrs: { time: on ? undefined : DEFAULT_TIME } });
		});
		allDayLabel.addEventListener("click", () => this.allDayToggle.toggleEl.click());

		const time = this.buildField(this.scheduleDetailsEl, t.edit.time);
		this.timeFieldEl = time.wrap;
		this.timeInput = time.row.createEl("input", { type: "time" });
		this.timeInput.addEventListener("change", () => {
			if (!this.patching) void this.commit({ attrs: { time: this.timeInput.value || DEFAULT_TIME } });
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
		// TaskStore re-reads `this.task` once the file lock is granted and hands the committed task
		// back through `adopt` while still holding the lock — so back-to-back commits (e.g. toggling
		// "repeat" twice quickly) chain off each other's settled result instead of racing a stale
		// snapshot. The adopt-time patch also reflects the edit immediately (e.g. "All day" off
		// reveals the time field) without dropping focus; our own sync() no-ops while editing.
		const committed = await this.host.taskStore.commit(
			() => this.task,
			updates,
			(next) => {
				this.task = next;
				this.host.focusStore.set(next); // keep the list view / editor in sync
				this.patch(next);
			},
		);
		if (!committed) {
			// Genuine external conflict (or the task vanished): resync to the index's current version
			// of this task if it still exists, else to whatever is focused now.
			const held = this.task;
			const fresh = held
				? (this.host.vaultIndex.getAllTasks().find((candidate) => candidate.id === held.id) ?? null)
				: null;
			if (fresh) this.host.focusStore.set(fresh);
			this.patch(fresh ?? this.host.focusStore.get());
		}
	}
}
