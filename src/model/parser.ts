import { ATTR_RE, PRIORITY_VALUES, REPEAT_VALUES, TASK_LINE_RE } from "../constants";
import { isValidDate, isValidTime } from "./dates";
import { Priority, RepeatRule, TaskAttrs, TaskItem } from "./types";

interface ParsedAttrs {
	/** The line text with every @key(value) token stripped out. */
	text: string;
	/** Lowercased attribute keys mapped to their raw string values. */
	attrs: Record<string, string>;
}

/** Splits a line into its plain text and its @key(value) attributes. */
function parseAttrs(rest: string): ParsedAttrs {
	const attrs: Record<string, string> = {};
	ATTR_RE.lastIndex = 0;
	const text = rest.replace(ATTR_RE, (_match, key: string, value: string) => {
		attrs[key.toLowerCase()] = value.trim();
		return "";
	});
	return { text: text.replace(/\s+/g, " ").trim(), attrs };
}

/** Keeps a "YYYY-MM-DD" date only when it is a real calendar date; drops anything malformed. */
function parseDate(value: string | undefined): string | undefined {
	const date = value?.trim();
	return date && isValidDate(date) ? date : undefined;
}

/** Keeps a "HH:MM" time only when it is a valid 24-hour time; drops anything malformed. */
function parseTime(value: string | undefined): string | undefined {
	const time = value?.trim();
	return time && isValidTime(time) ? time : undefined;
}

function parsePriority(value: string | undefined): Priority | undefined {
	const v = value?.toLowerCase();
	return v && (PRIORITY_VALUES as readonly string[]).includes(v) ? (v as Priority) : undefined;
}

function parseRepeat(value: string | undefined): RepeatRule {
	const v = value?.toLowerCase();
	return v && (REPEAT_VALUES as readonly string[]).includes(v) ? (v as RepeatRule) : "never";
}

/** All-day unless explicitly @allday(false) or an explicit time is present. */
function parseAllDay(attrs: Record<string, string>, time: string | undefined): boolean {
	if (attrs.allday !== undefined) return attrs.allday.toLowerCase() !== "false";
	return !time;
}

/** Parses a single line into a task, or returns null when it isn't a checkbox item. */
export function parseTaskLine(rawLine: string, file: string, line: number): TaskItem | null {
	const match = TASK_LINE_RE.exec(rawLine);
	if (!match) return null;
	const [, indent, box, rest] = match;
	const { text, attrs } = parseAttrs(rest);
	const time = parseTime(attrs.time);
	return {
		id: `${file}:${line}`,
		file,
		line,
		raw: rawLine,
		indent,
		name: text,
		checked: box.toLowerCase() === "x",
		priority: parsePriority(attrs.priority),
		date: parseDate(attrs.date),
		allDay: parseAllDay(attrs, time),
		time,
		repeat: parseRepeat(attrs.repeat),
		done: parseDate(attrs.done),
	};
}

/** Parses every task line found in a file's content. */
export function parseTasks(file: string, content: string): TaskItem[] {
	const tasks: TaskItem[] = [];
	content.split("\n").forEach((line, i) => {
		const task = parseTaskLine(line, file, i);
		if (task) tasks.push(task);
	});
	return tasks;
}

/** Serializes an ordered list of [key, value] pairs into "@key(value) @key(value)", skipping empties. */
function serializeAttrs(entries: Array<[string, string | undefined]>): string {
	return entries
		.filter((entry): entry is [string, string] => !!entry[1])
		.map(([key, value]) => `@${key}(${value})`)
		.join(" ");
}

/** Rebuilds a markdown task line from its parts. Inverse of parseTaskLine. */
export function buildTaskLine(indent: string, checked: boolean, name: string, attrs: TaskAttrs): string {
	const box = checked ? "x" : " ";
	const attrString = serializeAttrs([
		["priority", attrs.priority],
		["date", attrs.date],
		["allday", attrs.date ? String(attrs.allDay) : undefined],
		["time", attrs.time],
		["repeat", attrs.repeat !== "never" ? attrs.repeat : undefined],
		["done", attrs.done],
	]);
	const line = `${indent}- [${box}] ${name.trim()}`;
	return attrString ? `${line} ${attrString}` : line;
}
