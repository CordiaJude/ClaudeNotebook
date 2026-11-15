import "server-only";
import { memoryData } from "./memory";
import type { Data } from "./types";

/** The one place that chooses the data layer. In-memory today; /replica-backend switches this to the database. */
export const getData = (): Data => memoryData;
export const DATA_MODE: "demo" | "live" = "demo";
export * from "./types";
