export type Priority = "high" | "medium" | "low";

export type RepeatRule = "never" | "daily" | "weekly" | "monthly" | "yearly";

/** A task parsed from a single markdown checkbox line. */
export interface TaskItem {
	/** Stable-ish id derived from file path + line number. Recomputed on every reindex. */
	id: string;
	file: string;
	line: number;
	/** Raw source line, including indentation and prefix. */
	raw: string;
	indent: string;
	name: string;
	checked: boolean;
	priority?: Priority;
	date?: string; // "YYYY-MM-DD"
	allDay: boolean;
	time?: string; // "HH:mm"
	repeat: RepeatRule;
	done?: string; // "YYYY-MM-DD"
}

/** The editable, serializable subset of a task (everything stored as @key(value) attributes). */
export interface TaskAttrs {
	priority?: Priority;
	date?: string;
	allDay: boolean;
	time?: string;
	repeat: RepeatRule;
	done?: string;
}
