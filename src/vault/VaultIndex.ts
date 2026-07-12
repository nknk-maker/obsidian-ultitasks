import { App, Component, TAbstractFile, TFile } from "obsidian";
import { todayStr } from "../model/dates";
import { parseTasks } from "../model/line";
import { TaskItem } from "../model/task";
import { findCheckTransitions, planExternalToggle } from "../model/update";
import { Emitter } from "../util/Emitter";
import { FileLockMap } from "./FileLockMap";
import { applyLineEdit, readThroughEditor } from "./fileIO";

// Kept short so a note-editor checkbox click feels instant; it only needs to coalesce the couple of
// change events (vault "modify" + workspace "editor-change") that a single edit fires in a row.
const RESCAN_DEBOUNCE_MS = 30;

/**
 * In-memory index of every task line in the vault, kept in sync with vault file changes.
 *
 * Read-mostly: the one write it performs is the reaction to a checkbox flipped directly in the note
 * — an explicit user input that arrives as a file change, given the same single-write consequences
 * a UI toggle gets (done stamp, recurrence — see model/update.ts). It never rewrites a line for any
 * other reason; invalid or inconsistent syntax is ignored on read, not fixed in the file.
 */
export class VaultIndex extends Component {
	private files: Map<string, TaskItem[]> = new Map();
	private changed = new Emitter<void>();
	private debounceTimers: Map<string, number> = new Map();

	constructor(
		private app: App,
		private locks: FileLockMap,
	) {
		super();
	}

	onload(): void {
		this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleRescan(file)));
		this.registerEvent(this.app.vault.on("create", (file) => this.scheduleRescan(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleDelete(file)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
		// A change typed into an open note lands in that editor's own buffer first; Obsidian flushes
		// it to disk on its own debounce, of unpredictable length. `editor-change` fires synchronously
		// off that same buffer, which `readThroughEditor` then reads directly, so the index refreshes
		// without waiting for the flush.
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, info) => {
				if (info.file) this.scheduleRescan(info.file);
			}),
		);
		// At app startup plugins can load before the vault index is fully populated —
		// getMarkdownFiles() would come back empty/partial and the initial scan would baseline
		// nothing. onLayoutReady fires once the vault is ready (and immediately when the plugin is
		// enabled in an already-running app).
		this.app.workspace.onLayoutReady(() => void this.fullScan());
	}

	onunload(): void {
		this.debounceTimers.forEach((timer) => window.clearTimeout(timer));
		this.debounceTimers.clear();
	}

	/** Subscribes to index changes. Returns an unsubscribe function. */
	onChange(listener: () => void): () => void {
		return this.changed.on(listener);
	}

	getAllTasks(): TaskItem[] {
		return [...this.files.values()].flat();
	}

	/**
	 * Forces an immediate rescan of one file, bypassing the debounce (used right after a write).
	 * Does not itself take the file's lock — callers that just wrote the file (TaskStore) should
	 * already be holding it for the whole write + rescan sequence.
	 */
	async rescanFileNow(file: TFile): Promise<void> {
		const existing = this.debounceTimers.get(file.path);
		if (existing) {
			window.clearTimeout(existing);
			this.debounceTimers.delete(file.path);
		}
		await this.rescanFile(file);
		this.changed.emit(undefined);
	}

	private async fullScan(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		// Through the same per-file locks as event-driven rescans so a concurrent commit or rescan
		// can't interleave with the baseline read for the same file.
		await Promise.all(files.map((file) => this.locks.run(file.path, () => this.baselineScan(file))));
		this.changed.emit(undefined);
	}

	/** First scan of a file: records its disk state without reacting. */
	private async baselineScan(file: TFile): Promise<void> {
		if (this.files.has(file.path)) return; // an event-driven rescan already recorded this file
		try {
			const tasks = parseTasks(file.path, await this.app.vault.cachedRead(file));
			if (tasks.length > 0) this.files.set(file.path, tasks);
		} catch (_e) {
			// Unreadable: leave unindexed; a later vault event will rescan it.
		}
	}

	private scheduleRescan(file: TAbstractFile): void {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		const existing = this.debounceTimers.get(file.path);
		if (existing) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(file.path);
			// Under the file's lock so a rescan can't read mid-commit and then clobber the index with
			// a stale parse after the commit's own rescan already updated it.
			void this.locks.run(file.path, () => this.rescanFileNow(file));
		}, RESCAN_DEBOUNCE_MS);
		this.debounceTimers.set(file.path, timer);
	}

	private async rescanFile(file: TFile): Promise<void> {
		try {
			// Baseline for transition detection. When this file was never scanned — e.g. a checkbox
			// click lands right after startup, before fullScan reached it — fall back to *disk*: a
			// just-clicked checkbox lives only in the editor's unflushed buffer, so disk still holds
			// the pre-click line and the flip stays observable no matter how scan and click were
			// ordered. (For a file with no open editor both reads see the same content, so the
			// fallback simply detects nothing.)
			const previous =
				this.files.get(file.path) ?? parseTasks(file.path, await this.app.vault.cachedRead(file));
			let tasks = parseTasks(file.path, await readThroughEditor(this.app, file));

			// A checkbox flipped directly in the note: give it the same consequences a UI toggle
			// gets. Applied bottom-up so an inserted next occurrence can't shift the line numbers
			// of edits still to come.
			const today = todayStr();
			const edits = findCheckTransitions(previous, tasks)
				.map((task) => planExternalToggle(task, today).edit)
				.sort((a, b) => b.line - a.line);
			for (const edit of edits) {
				await applyLineEdit(this.app, edit);
			}
			if (edits.length > 0) {
				tasks = parseTasks(file.path, await readThroughEditor(this.app, file));
			}

			if (tasks.length > 0) {
				this.files.set(file.path, tasks);
			} else {
				this.files.delete(file.path);
			}
		} catch (_e) {
			this.files.delete(file.path);
		}
	}

	private handleDelete(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		this.files.delete(file.path);
		this.changed.emit(undefined);
	}

	private handleRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile)) return;
		this.files.delete(oldPath);
		this.scheduleRescan(file);
	}
}
