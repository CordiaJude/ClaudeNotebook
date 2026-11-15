"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DataError, getData, type Kind, type Person, type ShareRole } from "@/lib/data";
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

export type ShareState = { people: Person[]; error?: string; notice?: string };
async function shared(id: string, userId: string, extra: Partial<ShareState> = {}): Promise<ShareState> {
  try { return { people: await getData().people(userId, id), ...extra }; } catch (e) { return { people: [], error: message(e) }; }
}
/** Who has access. Any role may look; only the owner can change it. */
export async function listPeople(id: string): Promise<ShareState> {
  const user = await currentUser();
  return user ? shared(id, user.id) : { people: [], error: "Sign in first." };
}
export async function shareByEmail(id: string, email: string, role: ShareRole): Promise<ShareState> {
  const user = await currentUser();
  if (!user) return { people: [], error: "Sign in first." };
  try {
    const res = await getData().shareByEmail(user.id, id, email, role);
    // No mail is sent yet: invitations by email arrive with the real accounts.
    return shared(id, user.id, { notice: res === "shared" ? "Shared. They will see it in their library." : "Invited. They get access when they create an account with this address." });
  } catch (e) { return shared(id, user.id, { error: message(e) }); }
}
export async function setRole(id: string, email: string, role: ShareRole): Promise<ShareState> {
  const user = await currentUser();
  if (!user) return { people: [], error: "Sign in first." };
  try { await getData().setRole(user.id, id, email, role); return shared(id, user.id); } catch (e) { return shared(id, user.id, { error: message(e) }); }
}
export async function removeAccess(id: string, email: string): Promise<ShareState> {
  const user = await currentUser();
  if (!user) return { people: [], error: "Sign in first." };
  try { await getData().removeAccess(user.id, id, email); } catch (e) { return shared(id, user.id, { error: message(e) }); }
  revalidatePath("/library");
  return shared(id, user.id);
}
