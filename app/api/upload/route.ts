import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_MIMES, MAX_UPLOAD_BYTES } from "@/lib/editor/constants";

const err = (status: number, message: string) => NextResponse.json({ message }, { status });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return err(401, "Sign in first");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const notebookId = String(form?.get("notebookId") ?? "");
  if (!(file instanceof File) || !notebookId) return err(400, "Missing file or notebook");
  if (!(IMAGE_MIMES as readonly string[]).includes(file.type)) return err(415, "Only PNG, JPEG, WebP or GIF images");
  if (file.size > MAX_UPLOAD_BYTES) return err(413, "Max 10 MB");

  // Explicit membership check before the service-role write (spec §11).
  const { data: m } = await supabase.from("notebook_members").select("role").eq("notebook_id", notebookId).eq("user_id", auth.user.id).maybeSingle();
  if (!m || (m.role !== "owner" && m.role !== "editor")) return err(403, "You can't edit this notebook");

  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const path = `${notebookId}/${id}`;
  const admin = createAdminClient();
  const up = await admin.storage.from("blobs").upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) return err(500, "Upload failed");

  const ins = await supabase.from("blobs").insert({
    id, notebook_id: notebookId, storage_path: path, mime: file.type, bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), created_by: auth.user.id,
  });
  if (ins.error) { await admin.storage.from("blobs").remove([path]); return err(500, "Could not record upload"); }
  return NextResponse.json({ blobId: id, url: `/api/blob/${id}` });
}
