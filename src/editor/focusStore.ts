import { TaskItem } from "../model/types";

type Listener = (task: TaskItem | null) => void;

/** Single source of truth for "which task line is the cursor currently on". */
export class FocusStore {
	private current: TaskItem | null = null;
	private listeners: Set<Listener> = new Set();

	set(task: TaskItem | null): void {
		this.current = task;
		this.listeners.forEach((listener) => listener(task));
	}

	get(): TaskItem | null {
		return this.current;
	}

	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
