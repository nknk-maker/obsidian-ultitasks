import type { App } from "obsidian";
import type { FocusStore } from "./editor/focusStore";
import type { TaskStore } from "./vault/TaskStore";
import type { VaultIndex } from "./vault/VaultIndex";

/**
 * Structural interface implemented by the main plugin class; views depend on this instead of the
 * concrete class to avoid circular imports between main.ts and src/views/*.
 */
export interface UltiTasksHost {
	app: App;
	/** Read side: the indexed tasks and their change notifications. */
	vaultIndex: VaultIndex;
	/** Write side: the one path through which views persist a task edit. */
	taskStore: TaskStore;
	/** Which task line the cursor is currently on. */
	focusStore: FocusStore;
	/** Opens the list view in the mode with the given `type` (see LIST_MODES). */
	openListView(type: string, newLeaf?: boolean): Promise<void>;
}
