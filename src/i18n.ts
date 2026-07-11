import { Priority, RepeatRule } from "./model/types";

/**
 * All user-facing display strings, isolated in one place so a future i18n layer can swap locales.
 * For now there is a single locale (English); `t` points at it.
 */
export interface Labels {
	app: {
		navTitle: string;
		editTitle: string;
		untitled: string;
		openNote: string;
		placeCursor: string;
		taskNamePlaceholder: string;
		sourceLine: (line: number) => string;
	};
	priority: Record<Priority, string>;
	repeat: Record<RepeatRule, string>;
	mode: {
		inbox: string;
		priority: string;
		date: string;
		completed: string;
	};
	group: {
		overdue: string;
		today: string;
		noPriority: string;
		priority: (priorityLabel: string) => string;
	};
	edit: {
		priority: string;
		schedule: string;
		date: string;
		allDay: string;
		time: string;
		repeat: string;
		none: string;
	};
	notice: {
		fileNotFound: string;
		lineChanged: string;
	};
	command: {
		openNav: string;
		openEdit: string;
		openInbox: string;
	};
	/** date-fns format patterns; locale-dependent, so they live alongside the strings. */
	dateFormat: {
		full: string;
		short: string;
	};
}

const en: Labels = {
	app: {
		navTitle: "UltiTasks",
		editTitle: "Edit task",
		untitled: "(untitled)",
		openNote: "Open note",
		placeCursor: "Place the cursor on a task line",
		taskNamePlaceholder: "Task name",
		sourceLine: (line) => `line ${line}`,
	},
	priority: {
		high: "High",
		medium: "Medium",
		low: "Low",
	},
	repeat: {
		never: "None",
		daily: "Daily",
		weekly: "Weekly",
		monthly: "Monthly",
		yearly: "Yearly",
	},
	mode: {
		inbox: "Inbox",
		priority: "Priority",
		date: "Date",
		completed: "Completed",
	},
	group: {
		overdue: "Overdue",
		today: "Today",
		noPriority: "No priority",
		priority: (priorityLabel) => `Priority: ${priorityLabel}`,
	},
	edit: {
		priority: "Priority",
		schedule: "Schedule",
		date: "Date",
		allDay: "All day",
		time: "Time",
		repeat: "Repeat",
		none: "None",
	},
	notice: {
		fileNotFound: "UltiTasks: file not found",
		lineChanged: "UltiTasks: the line changed since it was read, so the update was aborted. Re-focus the task and try again.",
	},
	command: {
		openNav: "Open sidebar",
		openEdit: "Open edit panel",
		openInbox: "Open inbox",
	},
	dateFormat: {
		full: "EEE, MMM d",
		short: "MMM d",
	},
};

/** The active locale. */
export const t: Labels = en;
