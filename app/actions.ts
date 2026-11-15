"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DataError, getData, type Kind } from "@/lib/data";
import "@/lib/rooms";
import { currentUser, endSession, startSession } from "@/lib/session";

export type FormState = { error?: string } | null;
const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\/(?!\/)/.test(v) ? v : "/library");
const message = (e: unknown) => (e instanceof DataError ? e.message : "Something went wrong on our side. Try again.");

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try { id = (await getData().signIn({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") })).id; }
  catch (e) { return { error: message(e) }; }
  await startSession(id);
  redirect(safeNext(form.get("next")));
}
export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try { id = (await getData().signUp({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), name: String(form.get("name") ?? "") })).id; }
  catch (e) { return { error: message(e) }; }
  await startSession(id);
  redirect(safeNext(form.get("next")));
}
export async function signOut() { await endSession(); redirect("/login"); }

/** Creates a doc or deck and returns its id. The caller navigates, so it can carry a first prompt along. */
export async function createArtifact(input: { kind: Kind; templateId?: string }): Promise<{ id: string } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  try { const { artifact } = await getData().createArtifact(user.id, { kind: input.kind === "deck" ? "deck" : "doc", templateId: input.templateId }); revalidatePath("/library"); return { id: artifact.id }; }
  catch (e) { return { error: message(e) }; }
}
export async function renameArtifact(id: string, title: string): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  try { await getData().renameArtifact(user.id, id, title); } catch (e) { return { error: message(e) }; }
  revalidatePath("/library"); revalidatePath(`/a/${id}`);
  return null;
}
export async function deleteArtifact(id: string): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first." };
  try { await getData().deleteArtifact(user.id, id); } catch (e) { return { error: message(e) }; }
  revalidatePath("/library");
  return null;
}
