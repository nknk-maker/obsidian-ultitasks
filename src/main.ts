import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_EDIT, VIEW_TYPE_LIST, VIEW_TYPE_NAV } from "./constants";
import { FocusStore } from "./editor/focusStore";
import { createFocusExtension } from "./editor/focusExtension";
import { t } from "./i18n";
import { VaultIndex } from "./index/VaultIndex";
import type { UltiTasksHost } from "./pluginTypes";
import { EditPanelView } from "./views/EditPanelView";
import { ListView } from "./views/ListView";
import { SidebarNavView } from "./views/SidebarNavView";

export default class UltiTasksPlugin extends Plugin implements UltiTasksHost {
	vaultIndex!: VaultIndex;
	focusStore: FocusStore = new FocusStore();

	async onload(): Promise<void> {
		this.vaultIndex = new VaultIndex(this.app);
		this.addChild(this.vaultIndex);

		this.registerView(VIEW_TYPE_NAV, (leaf) => new SidebarNavView(leaf, this));
		this.registerView(VIEW_TYPE_LIST, (leaf) => new ListView(leaf, this));
		this.registerView(VIEW_TYPE_EDIT, (leaf) => new EditPanelView(leaf, this));

		this.registerEditorExtension(createFocusExtension(this.app, this.focusStore));

		this.addCommand({ id: "open-nav", name: t.command.openNav, callback: () => void this.activateNavView() });
		this.addCommand({
			id: "open-edit-panel",
			name: t.command.openEdit,
			callback: () => void this.activateEditPanelView(),
		});
		this.addCommand({
			id: "open-inbox",
			name: t.command.openInbox,
			callback: () => void this.openListView("inbox"),
		});

		this.app.workspace.onLayoutReady(() => {
			void this.activateNavView();
			void this.activateEditPanelView();
		});
	}

	activateNavView(): Promise<void> {
		return this.revealSidePanel(VIEW_TYPE_NAV, "left");
	}

	activateEditPanelView(): Promise<void> {
		return this.revealSidePanel(VIEW_TYPE_EDIT, "right");
	}

	async openListView(type: string, newLeaf = false): Promise<void> {
		const { workspace } = this.app;
		const existing = newLeaf ? null : workspace.getLeavesOfType(VIEW_TYPE_LIST)[0];
		const leaf = existing ?? workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_LIST, state: { mode: type }, active: true });
		workspace.revealLeaf(leaf);
	}

	/** Reveals the given view in a left/right side panel, reusing its leaf or creating one. */
	private async revealSidePanel(viewType: string, side: "left" | "right"): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
		if (!leaf) {
			leaf = side === "left" ? workspace.getLeftLeaf(false) : workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: viewType, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
