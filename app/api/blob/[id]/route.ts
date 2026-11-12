import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // RLS: only members of the notebook can see the blobs row.
  const { data: blob } = await supabase.from("blobs").select("storage_path").eq("id", id).maybeSingle();
  if (!blob) return new NextResponse("Not found", { status: 404 });
  const { data } = await createAdminClient().storage.from("blobs").createSignedUrl(blob.storage_path, 300);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=240" } });
}
