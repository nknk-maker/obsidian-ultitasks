import { TaskItem } from "../model/task";
import { Emitter } from "../util/Emitter";

/** Single source of truth for "which task line is the cursor currently on". */
export class FocusStore {
	private current: TaskItem | null = null;
	private changed = new Emitter<TaskItem | null>();

	set(task: TaskItem | null): void {
		this.current = task;
		this.changed.emit(task);
	}

	get(): TaskItem | null {
		return this.current;
	}

	/** Subscribes to focus changes. Returns an unsubscribe function. */
	onChange(listener: (task: TaskItem | null) => void): () => void {
		return this.changed.on(listener);
	}
}
