/**
 * Per-file mutual exclusion for read-then-write sequences.
 *
 * Anything that reads-then-writes a file's task lines — a background rescan and a UI commit both do
 * this — runs under `run` keyed by the file path, so two of them can never interleave against the
 * same file. Without this, a UI edit's line write and a background rescan's reaction write could
 * race: whichever wrote second would find the line no longer matches what it read, trip the conflict
 * guard, and abort with a "line changed" notice even though nothing external touched the file — only
 * our own overlapping calls did.
 */
export class FileLockMap {
	private chains: Map<string, Promise<unknown>> = new Map();

	/** Runs `fn` once every previously queued `run` for the same key has settled. */
	async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prior = this.chains.get(key) ?? Promise.resolve();
		const settled = prior.then(
			() => undefined,
			() => undefined,
		);
		const next = settled.then(fn);
		this.chains.set(
			key,
			next.then(
				() => undefined,
				() => undefined,
			),
		);
		return next;
	}
}
