/**
 * The only code that reads or writes task lines in the vault. Everything above this (VaultIndex,
 * TaskStore) works in terms of pure {@link LineEdit} plans; everything below it is Obsidian I/O.
 */
import { App, MarkdownView, Notice, TFile } from "obsidian";
import { t } from "../i18n";
import { LineEdit } from "../model/update";

export function getFile(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}

/**
 * Reads a file's current content, preferring the active editor's live buffer when this file is
 * open there. `vault.read` only reflects Obsidian's own (debounced) disk flush, which can lag
 * behind a just-clicked checkbox in that open note; the editor's buffer never has that lag, and
 * is also what `applyLineEdit` writes through for the same file, so reads and writes agree.
 */
export async function readThroughEditor(app: App, file: TFile): Promise<string> {
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView?.file?.path === file.path) return activeView.editor.getValue();
	return app.vault.read(file);
}

/**
 * Applies a planned line edit, but only if the line's current content still matches the plan's
 * `expectedRaw`. This guards against clobbering the file if it changed since the task was read
 * (e.g. the user typed something else in the meantime).
 *
 * When the target file is open in the active editor, the edit goes through that editor's own buffer
 * (`Editor.replaceRange`) instead of `Vault.modify`. Writing straight to disk behind an open editor's
 * back leaves its in-memory buffer unaware of the change; the editor's own next autosave would then
 * overwrite our insertion with its stale buffer, making the edit vanish right after it appeared.
 */
export async function applyLineEdit(app: App, edit: LineEdit): Promise<boolean> {
	const { file: filePath, line, expectedRaw, replacement } = edit;
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView?.file?.path === filePath) {
		const editor = activeView.editor;
		if (editor.getLine(line) !== expectedRaw) {
			new Notice(t.notice.lineChanged);
			return false;
		}
		editor.replaceRange(replacement.join("\n"), { line, ch: 0 }, { line, ch: expectedRaw.length });
		return true;
	}
	const file = getFile(app, filePath);
	if (!file) {
		new Notice(t.notice.fileNotFound);
		return false;
	}
	const content = await app.vault.read(file);
	const lines = content.split("\n");
	if (lines[line] !== expectedRaw) {
		new Notice(t.notice.lineChanged);
		return false;
	}
	lines.splice(line, 1, ...replacement);
	await app.vault.modify(file, lines.join("\n"));
	return true;
}
