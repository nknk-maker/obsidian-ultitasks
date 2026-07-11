export const VIEW_TYPE_NAV = "ultitasks-nav-view";
export const VIEW_TYPE_LIST = "ultitasks-list-view";
export const VIEW_TYPE_EDIT = "ultitasks-edit-view";

/** Matches a markdown checkbox list item, e.g. "  - [ ] buy milk @priority(high)". */
export const TASK_LINE_RE = /^(\s*)-\s\[([ xX])\]\s+(.*)$/;

/** Matches a single @key(value) attribute token. */
export const ATTR_RE = /@([a-zA-Z]+)\(([^)]*)\)/g;

/** Serialized attribute values (not display strings — see i18n.ts for labels). */
export const REPEAT_VALUES = ["never", "daily", "weekly", "monthly", "yearly"] as const;
export const PRIORITY_VALUES = ["high", "medium", "low"] as const;
