/** Where live documents are kept. Three methods, so the realtime host can be swapped. */
export interface RoomStore {
  /** The whole document as one Yjs update, or null when the room does not exist. */
  read(room: string): Promise<Uint8Array | null>;
  /** Merge an update into the room and send it to everyone who has it open. */
  apply(room: string, update: Uint8Array, origin?: string): Promise<void>;
  create(room: string, state: Uint8Array): Promise<void>;
}
