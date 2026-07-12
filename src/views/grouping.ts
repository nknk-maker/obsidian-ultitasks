import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { t } from "../i18n";
import { PRIORITY_VALUES, Priority, TaskItem } from "../model/task";

/** One labelled group of tasks shown as a sub-heading in the list view. */
export interface GroupedSection {
	key: string;
	label: string;
	items: TaskItem[];
	isOverdue?: boolean;
}

const OVERDUE = "overdue";
const PRIORITY_GROUP_ORDER = [...PRIORITY_VALUES, "none"] as const;

/** Groups items by a derived key, preserving first-seen order. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		const bucket = map.get(key);
		if (bucket) bucket.push(item);
		else map.set(key, [item]);
	}
	return map;
}

/** The note's display name: its file name without the folder path or ".md" extension. */
function noteName(path: string): string {
	const base = path.split("/").pop() ?? path;
	return base.replace(/\.md$/i, "");
}

/** Inbox: open tasks grouped by the note they live in. */
export function groupInbox(tasks: TaskItem[]): GroupedSection[] {
	const open = tasks.filter((task) => !task.checked);
	const byNote = groupBy(open, (task) => task.file);
	return [...byNote.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([file, items]) => ({ key: file, label: noteName(file), items }));
}

/** Priority: open tasks grouped High → Medium → Low → No priority. */
export function groupPriority(tasks: TaskItem[]): GroupedSection[] {
	const open = tasks.filter((task) => !task.checked);
	const byPriority = groupBy(open, (task) => task.attrs.priority ?? "none");
	return PRIORITY_GROUP_ORDER.filter((key) => byPriority.has(key)).map((key) => ({
		key,
		label: key === "none" ? t.group.noPriority : t.group.priority(t.priority[key as Priority]),
		items: byPriority.get(key)!,
	}));
}

/** Date: open tasks with a due date, grouped into Overdue / Today / the next 7 days. */
export function groupDate(tasks: TaskItem[], today: Date): GroupedSection[] {
	const start = startOfDay(today);
	const sections: GroupedSection[] = [{ key: OVERDUE, label: t.group.overdue, items: [], isOverdue: true }];
	for (let i = 0; i <= 7; i++) {
		const day = addDays(start, i);
		const label = i === 0 ? t.group.today : format(day, t.dateFormat.full);
		sections.push({ key: format(day, "yyyy-MM-dd"), label, items: [] });
	}
	const byKey = new Map(sections.map((s) => [s.key, s]));

	for (const task of tasks) {
		if (task.checked || !task.attrs.date) continue;
		const day = startOfDay(parseISO(task.attrs.date));
		const diff = differenceInCalendarDays(day, start);
		if (diff > 7) continue;
		byKey.get(diff < 0 ? OVERDUE : format(day, "yyyy-MM-dd"))?.items.push(task);
	}
	return sections.filter((s) => s.items.length > 0);
}

/** Completed: done tasks grouped by completion (@done) date, most recent first. */
export function groupCompleted(tasks: TaskItem[]): GroupedSection[] {
	const done = tasks.filter((task) => task.checked && task.attrs.done);
	const byDate = groupBy(done, (task) => task.attrs.done ?? "");
	return [...byDate.entries()]
		.sort((a, b) => b[0].localeCompare(a[0]))
		.map(([date, items]) => ({ key: date, label: format(parseISO(date), t.dateFormat.full), items }));
}
