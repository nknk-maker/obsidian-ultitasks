import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, MarkdownView } from "obsidian";
import { parseTaskLine } from "../model/parser";
import { FocusStore } from "./focusStore";

/** Registers a CodeMirror extension that keeps `store` updated with the task under the cursor. */
export function createFocusExtension(app: App, store: FocusStore) {
	return ViewPlugin.fromClass(
		class {
			constructor(private view: EditorView) {
				this.report();
			}

			update(update: ViewUpdate): void {
				if (update.selectionSet || update.docChanged || update.viewportChanged) {
					this.report();
				}
			}

			private report(): void {
				const activeView = app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView?.file) {
					store.set(null);
					return;
				}
				const state = this.view.state;
				const pos = state.selection.main.head;
				const cmLine = state.doc.lineAt(pos);
				const lineNumber0 = cmLine.number - 1;
				const filePath = activeView.file.path;

				const task = parseTaskLine(cmLine.text, filePath, lineNumber0);
				store.set(task);
			}
		},
	);
}
