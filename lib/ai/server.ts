import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Liveblocks } from "@liveblocks/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { roomIdFor } from "@/lib/rooms";
import { DAILY_RUNS } from "./models";
import type { NotebookBackend, RoomStore, TabInfo } from "./exec";
import type { AnthropicLike } from "./loop";
import type { RunDeps } from "./run";
import { randomUUID } from "node:crypto";

export function anthropicClient(): AnthropicLike | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key }) as unknown as AnthropicLike;
}

export function liveblocks(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  return secret ? new Liveblocks({ secret }) : null;
}

export function liveblocksRooms(lb: Liveblocks): RoomStore {
  return {
    async ensure(room) { await lb.getOrCreateRoom(room, { defaultAccesses: [] }); },
    async load(room) {
      try { return new Uint8Array(await lb.getYjsDocumentAsBinaryUpdate(room)); }
      catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    async save(room, delta) { await lb.sendYjsBinaryUpdate(room, delta); },
  };
}

/** Rows are read and written as the signed-in user, so RLS applies to everything the agent does. */
export function supabaseBackend(supabase: SupabaseClient, userId: string): NotebookBackend {
  return {
    async createNotebook(title) {
      const notebookId = randomUUID(), tabId = randomUUID();
      const nb = await supabase.from("notebooks").insert({ id: notebookId, owner_id: userId, title: title.slice(0, 200) });
      if (nb.error) throw new Error(`Could not create notebook: ${nb.error.message}`);
      const room = roomIdFor(notebookId, tabId);
      const tab = await supabase.from("tabs").insert({ id: tabId, notebook_id: notebookId, name: "Main", order_key: "a0", liveblocks_room: room });
      if (tab.error) throw new Error(`Could not create tab: ${tab.error.message}`);
      return { notebookId, tabId, room };
    },
    async resolveTab(tabId): Promise<TabInfo | null> {
      const { data: tab } = await supabase.from("tabs").select("id,name,notebook_id,liveblocks_room").eq("id", tabId).maybeSingle();
      if (!tab) return null;
      const { data: m } = await supabase.from("notebook_members").select("role").eq("notebook_id", tab.notebook_id).eq("user_id", userId).maybeSingle();
      if (!m) return null;
      return { notebookId: tab.notebook_id, tabId: tab.id, room: tab.liveblocks_room, role: m.role as TabInfo["role"], name: tab.name };
    },
  };
}

/** Service-role ledger: daily cap + run rows. Only ever called after the route authenticated the user. */
export function supabaseLedger(): RunDeps["ledger"] {
  const admin = createAdminClient();
  return {
    async tryStart(userId) {
      const { data, error } = await admin.rpc("agent_try_start_run", { p_user: userId, p_max: DAILY_RUNS });
      if (error) throw new Error(`usage check failed: ${error.message}`);
      return data === true;
    },
    async open(r) {
      const { data, error } = await admin.from("agent_runs").insert({ notebook_id: r.notebookId ?? null, tab_id: r.tabId ?? null, user_id: r.userId, trigger: r.trigger, status: "running" }).select("id").single();
      if (error || !data) throw new Error(`could not record run: ${error?.message}`);
      return data.id as string;
    },
    async close(id, status, usage, section) {
      await admin.from("agent_runs").update({ status, section: section ?? null, finished_at: new Date().toISOString(), input_tokens: usage.input, output_tokens: usage.output }).eq("id", id);
    },
  };
}

export function liveblocksExtras(lb: Liveblocks): Pick<RunDeps, "snapshot" | "presence"> {
  return {
    async snapshot(room) { await lb.createVersionHistorySnapshot(room); },
    async presence(room, label) {
      await lb.setPresence(room, { userId: "agent:claude", data: { editing: label }, userInfo: { name: "Claude", color: "#d97757" }, ttl: label ? 60 : 2 });
    },
  };
}
