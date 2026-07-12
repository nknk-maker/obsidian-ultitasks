/** Minimal listener registry shared by the plugin's observable stores. */
export class Emitter<T> {
	private listeners: Set<(value: T) => void> = new Set();

	/** Subscribes to emissions. Returns an unsubscribe function. */
	on(listener: (value: T) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(value: T): void {
		this.listeners.forEach((listener) => listener(value));
	}
}
