import { App } from "obsidian";
import { todayStr } from "../model/dates";
import { TaskItem } from "../model/task";
import { TaskUpdate, planUpdate } from "../model/update";
import { FileLockMap } from "./FileLockMap";
import { VaultIndex } from "./VaultIndex";
import { applyLineEdit, getFile } from "./fileIO";

/**
 * The write path for the plugin's own UI: lock the file, apply the planned line edit, reindex. A
 * write happens only in direct response to a user input and carries its full consequences in that
 * single edit (done stamp, recurrence, attribute invariants — see model/update.ts). The only other
 * write in the plugin is VaultIndex's reaction to a checkbox flipped directly in the note — the
 * same user-input rule arriving as a file change.
 */
export class TaskStore {
	constructor(
		private app: App,
		private index: VaultIndex,
		private locks: FileLockMap,
	) {}

	/**
	 * Applies `updates` to a task under its file's lock, then reindexes the file.
	 *
	 * `latest` is re-invoked once the lock is granted: back-to-back commits (e.g. toggling "repeat"
	 * twice quickly) then always start from the previous commit's *settled* result instead of racing
	 * it with a stale snapshot, which would trip the line-edit conflict guard and abort with a "line
	 * changed" notice. For the same reason, `adopt` — the caller's chance to store the updated task
	 * where its `latest` will find it — runs *inside* the lock, right after a successful write and
	 * before the lock releases; adopting only after `commit` resolves would leave a queued commit
	 * reading the stale task.
	 *
	 * Returns the committed task, or null when there was no task or the write was refused (the line
	 * changed externally, or the file is gone).
	 */
	async commit(
		latest: () => TaskItem | null,
		updates: TaskUpdate,
		adopt?: (updated: TaskItem) => void,
	): Promise<TaskItem | null> {
		const initial = latest();
		if (!initial) return null;
		return this.locks.run(initial.file, async () => {
			const base = latest();
			if (!base) return null;
			const { updated, edit } = planUpdate(base, updates, todayStr());
			if (!(await applyLineEdit(this.app, edit))) return null;
			adopt?.(updated);
			const file = getFile(this.app, base.file);
			if (file) await this.index.rescanFileNow(file);
			return updated;
		});
	}

	/** Flips a task's checkbox; the write plan carries the consequences (done stamp, recurrence). */
	toggleChecked(task: TaskItem): Promise<TaskItem | null> {
		return this.commit(() => task, { checked: !task.checked });
	}
}
