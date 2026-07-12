import { t } from "../i18n";
import { TaskItem } from "../model/task";
import { GroupedSection, groupCompleted, groupDate, groupInbox, groupPriority } from "./grouping";

/**
 * A list-view mode: its stable key, its icon, its display label, and the filter that turns the
 * vault's tasks into the grouped sections this mode shows. One struct fully describes a mode —
 * there is no separate label/key lookup.
 */
export interface ListMode {
	type: string;
	icon: string;
	label: string;
	filter(tasks: TaskItem[]): GroupedSection[];
}

export const LIST_MODES: ListMode[] = [
	{ type: "inbox", icon: "inbox", label: t.mode.inbox, filter: groupInbox },
	{ type: "priority", icon: "flag", label: t.mode.priority, filter: groupPriority },
	{ type: "date", icon: "calendar-days", label: t.mode.date, filter: (tasks) => groupDate(tasks, new Date()) },
	{ type: "completed", icon: "check-circle", label: t.mode.completed, filter: groupCompleted },
];

/** Resolves a mode by its `type`, falling back to the first mode for unknown/legacy keys. */
export function findListMode(type: string): ListMode {
	return LIST_MODES.find((mode) => mode.type === type) ?? LIST_MODES[0];
}
