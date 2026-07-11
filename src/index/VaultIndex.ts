import { App, Component, TAbstractFile, TFile } from "obsidian";
import { parseTasks } from "../model/parser";
import { TaskItem } from "../model/types";

type Listener = () => void;

const RESCAN_DEBOUNCE_MS = 300;

/** In-memory index of every task line in the vault, kept in sync with vault file changes. */
export class VaultIndex extends Component {
	private files: Map<string, TaskItem[]> = new Map();
	private listeners: Set<Listener> = new Set();
	private debounceTimers: Map<string, number> = new Map();

	constructor(private app: App) {
		super();
	}

	onload(): void {
		this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleRescan(file)));
		this.registerEvent(this.app.vault.on("create", (file) => this.scheduleRescan(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleDelete(file)));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
		void this.fullScan();
	}

	onunload(): void {
		this.debounceTimers.forEach((timer) => window.clearTimeout(timer));
		this.debounceTimers.clear();
	}

	/** Subscribes to index changes. Returns an unsubscribe function. */
	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener());
	}

	private async fullScan(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		await Promise.all(files.map((file) => this.rescanFile(file)));
		this.notify();
	}

	private scheduleRescan(file: TAbstractFile): void {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		const existing = this.debounceTimers.get(file.path);
		if (existing) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(file.path);
			void this.rescanFile(file).then(() => this.notify());
		}, RESCAN_DEBOUNCE_MS);
		this.debounceTimers.set(file.path, timer);
	}

	private async rescanFile(file: TFile): Promise<void> {
		try {
			const tasks = parseTasks(file.path, await this.app.vault.cachedRead(file));
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
		this.notify();
	}

	private handleRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile)) return;
		this.files.delete(oldPath);
		this.scheduleRescan(file);
	}

	/** Forces an immediate rescan of one file, bypassing the debounce (used right after a write-back). */
	async rescanFileNow(file: TFile): Promise<void> {
		const existing = this.debounceTimers.get(file.path);
		if (existing) {
			window.clearTimeout(existing);
			this.debounceTimers.delete(file.path);
		}
		await this.rescanFile(file);
		this.notify();
	}

	getAllTasks(): TaskItem[] {
		return [...this.files.values()].flat();
	}
}
