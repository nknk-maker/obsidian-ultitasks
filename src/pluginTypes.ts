import type { App } from "obsidian";
import type { FocusStore } from "./editor/focusStore";
import type { VaultIndex } from "./index/VaultIndex";

/** Structural interface implemented by the main plugin class; views depend on this instead of the
 * concrete class to avoid circular imports between main.ts and src/views/*. */
export interface UltiTasksHost {
	app: App;
	vaultIndex: VaultIndex;
	focusStore: FocusStore;
	/** Opens the list view in the mode with the given `type` (see LIST_MODES). */
	openListView(type: string, newLeaf?: boolean): Promise<void>;
}
