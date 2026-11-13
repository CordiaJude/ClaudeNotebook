declare global {
  interface Liveblocks {
    Presence: { editing?: string | null };
    UserMeta: { id: string; info: { name: string; avatar?: string; color: string } };
  }
}
export {};
