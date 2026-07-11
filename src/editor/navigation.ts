import { App, MarkdownView, TFile } from "obsidian";

/**
 * Opens `filePath` and places the cursor on `line` (0-indexed), triggering focus tracking.
 * Reuses an existing markdown leaf already showing the file when possible, otherwise opens a new
 * tab — this avoids clobbering the UltiTasks list/calendar pane the user clicked from.
 */
export async function revealLine(app: App, filePath: string, line: number): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	const existing = app.workspace
		.getLeavesOfType("markdown")
		.find((leaf) => (leaf.view as MarkdownView).file?.path === filePath);

	const leaf = existing ?? app.workspace.getLeaf("tab");
	await leaf.openFile(file, { eState: { line, cursor: { from: { line, ch: 0 }, to: { line, ch: 0 } } } });
	app.workspace.revealLeaf(leaf);
}
