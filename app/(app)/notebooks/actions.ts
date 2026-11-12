"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roomIdFor } from "@/lib/rooms";
import { templateByKey } from "@/lib/templates";

export async function createNotebook(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const tpl = templateByKey(String(formData.get("template") ?? "blank"));

  const notebookId = randomUUID();
  const tabId = randomUUID();
  // No .select(): the owner-member row is added by trigger; reads happen afterward.
  const nb = await supabase.from("notebooks").insert({ id: notebookId, owner_id: auth.user.id, title: tpl.name === "Blank" ? "Untitled" : tpl.name });
  if (nb.error) throw new Error(`Could not create notebook: ${nb.error.message}`);
  const tab = await supabase.from("tabs").insert({ id: tabId, notebook_id: notebookId, name: "Main", order_key: "a0", liveblocks_room: roomIdFor(notebookId, tabId) });
  if (tab.error) throw new Error(`Could not create tab: ${tab.error.message}`);
  redirect(`/n/${notebookId}?t=${tpl.key}`);
}

export async function deleteNotebook(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  // Soft delete (spec: notebooks.deleted_at). Owner/editor may do this via the update policy.
  await supabase.from("notebooks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  redirect("/notebooks");
}
