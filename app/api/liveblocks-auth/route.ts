import { Liveblocks } from "@liveblocks/node";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TOKENS } from "@/lib/tokens.generated";

const C = TOKENS.color.light;
const COLORS = [C["person-1"], C["person-2"], C["person-3"], C["person-4"], C["person-5"], C["person-6"]];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]!;

export async function POST(req: NextRequest) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { room } = (await req.json().catch(() => ({}))) as { room?: string };
  if (!room) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // RLS: only tabs of notebooks the user belongs to are visible.
  const { data: tab } = await supabase.from("tabs").select("notebook_id").eq("liveblocks_room", room).maybeSingle();
  if (!tab) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: member } = await supabase
    .from("notebook_members").select("role").eq("notebook_id", tab.notebook_id).eq("user_id", auth.user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: profile } = await supabase.from("profiles").select("display_name,avatar_url").eq("id", auth.user.id).maybeSingle();

  const liveblocks = new Liveblocks({ secret });
  const session = liveblocks.prepareSession(auth.user.id, {
    userInfo: { name: profile?.display_name ?? "Someone", avatar: profile?.avatar_url ?? undefined, color: colorFor(auth.user.id) },
  });
  const perms =
    member.role === "owner" || member.role === "editor"
      ? (["room:write"] as const)
      : member.role === "commenter"
        ? (["room:read", "room:presence:write", "comments:write"] as const)
        : (["room:read", "room:presence:write"] as const);
  session.allow(room, perms as unknown as ["room:write"]);
  const { status, body } = await session.authorize();
  return new NextResponse(body, { status });
}
