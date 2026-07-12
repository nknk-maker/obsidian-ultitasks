/**
 * User-intent edits to a task, expressed as pure data.
 *
 * A view never writes a file; it describes *what the user changed* as a {@link TaskUpdate}, and
 * {@link planUpdate} turns that into a {@link LineEdit} plan carrying the full consequences of the
 * change — attribute invariants (normalizeAttrs), the `done` stamp on a check, the next occurrence
 * of a repeating task. One user gesture therefore becomes exactly one write; nothing ever rewrites
 * the file after the fact. The vault layer (vault/fileIO.ts) is the only code that applies plans.
 */
import { buildTaskLine } from "./line";
import { advanceDate } from "./recurrence";
import { TaskAttrs, TaskItem, normalizeAttrs } from "./task";

/**
 * A guarded replacement of one source line with one or more lines. `expectedRaw` is the content the
 * line must still have when the edit is applied — the conflict guard against clobbering a file that
 * changed since the task was read.
 */
export interface LineEdit {
	file: string;
	line: number;
	expectedRaw: string;
	replacement: string[];
}

/** The fields of a task a user gesture can change. Only the fields actually touched are present. */
export interface TaskUpdate {
	name?: string;
	checked?: boolean;
	attrs?: Partial<TaskAttrs>;
}

/**
 * Plans the single line edit that realizes `updates`, along with the task as it will be afterwards.
 *
 * Checking a task stamps `done` with `today`; if it carries a repeat rule, the plan keeps the
 * original line in place (marked done) and inserts a new unchecked occurrence right after it, dated
 * one repeat interval later. Unchecking clears the `done` stamp. Merged attributes are normalized
 * (see normalizeAttrs), so e.g. turning "All day" off puts the implied default time into the same
 * write instead of requiring a follow-up fix.
 */
export function planUpdate(
	task: TaskItem,
	updates: TaskUpdate,
	today: string,
): { updated: TaskItem; edit: LineEdit } {
	const name = updates.name ?? task.name;
	const checked = updates.checked ?? task.checked;
	let attrs: TaskAttrs = normalizeAttrs({ ...task.attrs, ...updates.attrs });

	if (checked && !task.checked) {
		attrs = { ...attrs, done: today };
		if (attrs.repeat !== "never" && attrs.date) {
			const doneLine = buildTaskLine(task.indent, true, name, attrs);
			const nextLine = buildTaskLine(task.indent, false, name, {
				...attrs,
				date: advanceDate(attrs.date, attrs.repeat),
				done: undefined,
			});
			return {
				updated: { ...task, name, checked: true, attrs, raw: doneLine },
				edit: { file: task.file, line: task.line, expectedRaw: task.raw, replacement: [doneLine, nextLine] },
			};
		}
	} else if (!checked && task.checked) {
		attrs = { ...attrs, done: undefined };
	}

	const raw = buildTaskLine(task.indent, checked, name, attrs);
	return {
		updated: { ...task, name, checked, attrs, raw },
		edit: { file: task.file, line: task.line, expectedRaw: task.raw, replacement: [raw] },
	};
}

/**
 * Tasks whose checkbox flipped since the previous scan but whose `done` stamp hasn't caught up —
 * i.e. checkbox clicks made directly in the note, not yet reacted to. Matches by line number *and*
 * name against the previous scan, so inserted/removed lines shifting tasks around can't pair two
 * different tasks into a phantom flip. UI toggles never show up here: their plan stamps/clears
 * `done` in the same write as the flip.
 */
export function findCheckTransitions(previous: TaskItem[], current: TaskItem[]): TaskItem[] {
	const previousByLine = new Map(previous.map((task) => [task.line, task]));
	return current.filter((task) => {
		const before = previousByLine.get(task.line);
		if (!before || before.name !== task.name || before.checked === task.checked) return false;
		return task.checked ? !task.attrs.done : task.attrs.done !== undefined;
	});
}

/**
 * Plans the same consequences {@link planUpdate} gives a UI toggle, for a flip that arrived as an
 * external file change: `task` is the line as it reads *now* — already flipped, not yet stamped —
 * so it is rebased to its pre-flip state and re-toggled (its current raw stays the conflict guard).
 */
export function planExternalToggle(task: TaskItem, today: string): { updated: TaskItem; edit: LineEdit } {
	return planUpdate({ ...task, checked: !task.checked }, { checked: task.checked }, today);
}
