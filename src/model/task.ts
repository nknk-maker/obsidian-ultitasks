/**
 * The task data model. Pure types and value constants only — no parsing, no I/O.
 *
 * A task's canonical form is always its markdown line in the vault; these types are a structured
 * *view* of that line, recomputed on every reindex. Nothing in the model layer imports `obsidian`.
 */

/** Serialized attribute values (not display strings — see i18n.ts for labels). */
export const PRIORITY_VALUES = ["high", "medium", "low"] as const;
export const REPEAT_VALUES = ["never", "daily", "weekly", "monthly", "yearly"] as const;

export type Priority = (typeof PRIORITY_VALUES)[number];
export type RepeatRule = (typeof REPEAT_VALUES)[number];

/** The time a dated, non-all-day task defaults to when none is specified. */
export const DEFAULT_TIME = "09:00";

/**
 * The editable @key(value) attributes of a task line.
 *
 * A hand-typed line can carry any combination of these (e.g. a time without a date);
 * {@link normalizeAttrs} defines how such a line is *interpreted*. The file itself is never
 * rewritten to fix it — inconsistent attributes are simply ignored on read.
 */
export interface TaskAttrs {
	priority?: Priority;
	date?: string; // "YYYY-MM-DD"
	time?: string; // "HH:mm"
	repeat: RepeatRule;
	done?: string; // "YYYY-MM-DD"
}

/**
 * The invariant between date/time/repeat: no date means no time and no repeat. A task is "all-day"
 * whenever it has no time — that is never stored, only derived (see {@link isAllDay}).
 *
 * Applied in exactly two places: when *reading* a line (so inconsistent hand-typed attributes are
 * ignored rather than surfaced) and when *building* a line to write (so an edit always produces a
 * consistent line). Never used to rewrite a file on its own.
 */
export function normalizeAttrs(attrs: TaskAttrs): TaskAttrs {
	if (!attrs.date) return { ...attrs, time: undefined, repeat: "never" };
	return attrs;
}

/** A task is all-day whenever it carries no time — there is no separate stored flag for it. */
export function isAllDay(attrs: TaskAttrs): boolean {
	return !attrs.time;
}

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
	attrs: TaskAttrs;
}
