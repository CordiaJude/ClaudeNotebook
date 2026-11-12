/** One Liveblocks room (one Yjs doc) per tab: spec §6. */
export const roomIdFor = (notebookId: string, tabId: string) => `nb:${notebookId}:tab:${tabId}`;
