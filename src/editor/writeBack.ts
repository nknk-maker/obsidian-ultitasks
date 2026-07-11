import { App, Notice, TFile } from "obsidian";
import { format } from "date-fns";
import { t } from "../i18n";
import { buildTaskLine } from "../model/parser";
import { advanceDate } from "../model/recurrence";
import { TaskAttrs, TaskItem } from "../model/types";

export function getFile(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

/**
 * Replaces the line at `lineNumber` with `newLines`, but only if the line's current content still
 * matches `expectedRaw`. This guards against clobbering the file if it changed since the item was
 * read (e.g. the user typed something else in the meantime).
 */
async function replaceLine(
	app: App,
	filePath: string,
	lineNumber: number,
	expectedRaw: string,
	newLines: string | string[],
): Promise<boolean> {
	const file = getFile(app, filePath);
	if (!file) {
		new Notice(t.notice.fileNotFound);
		return false;
	}
	const content = await app.vault.read(file);
	const lines = content.split("\n");
	if (lines[lineNumber] !== expectedRaw) {
		new Notice(t.notice.lineChanged);
		return false;
	}
	const replacement = Array.isArray(newLines) ? newLines : [newLines];
	lines.splice(lineNumber, 1, ...replacement);
	await app.vault.modify(file, lines.join("\n"));
	return true;
}

export function taskAttrs(task: TaskItem): TaskAttrs {
	return {
		priority: task.priority,
		date: task.date,
		allDay: task.allDay,
		time: task.time,
		repeat: task.repeat,
		done: task.done,
	};
}

export interface TaskUpdate {
	name?: string;
	checked?: boolean;
	attrs?: Partial<TaskAttrs>;
}

/** Pure merge: applies `updates` on top of `task` and returns the resulting item (no I/O). */
export function applyTaskUpdate(task: TaskItem, updates: TaskUpdate): TaskItem {
	const name = updates.name ?? task.name;
	const checked = updates.checked ?? task.checked;
	const attrs: TaskAttrs = { ...taskAttrs(task), ...updates.attrs };
	const raw = buildTaskLine(task.indent, checked, name, attrs);
	return { ...task, ...attrs, name, checked, raw };
}

export async function updateTask(app: App, task: TaskItem, updates: TaskUpdate): Promise<boolean> {
	const updated = applyTaskUpdate(task, updates);
	return replaceLine(app, task.file, task.line, task.raw, updated.raw);
}

/**
 * Toggles a task's checkbox. Checking a task with a repeat rule keeps the original line (marked done)
 * and inserts a new unchecked occurrence right after it with the date advanced by one interval.
 */
export async function toggleTaskChecked(app: App, task: TaskItem): Promise<boolean> {
	if (task.checked) {
		return updateTask(app, task, { checked: false, attrs: { done: undefined } });
	}
	const today = format(new Date(), "yyyy-MM-dd");
	if (task.repeat !== "never" && task.date) {
		const nextDate = advanceDate(task.date, task.repeat);
		const doneLine = buildTaskLine(task.indent, true, task.name, { ...taskAttrs(task), done: today });
		const nextLine = buildTaskLine(task.indent, false, task.name, {
			...taskAttrs(task),
			date: nextDate,
			done: undefined,
		});
		return replaceLine(app, task.file, task.line, task.raw, [doneLine, nextLine]);
	}
	return updateTask(app, task, { checked: true, attrs: { done: today } });
}
