import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getData, type User } from "@/lib/data";

const COOKIE = "session";
const secret = () => process.env.SESSION_SECRET ?? "dev-only-secret-change-me";
const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("hex");

export async function startSession(userId: string) {
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function endSession() { (await cookies()).delete(COOKIE); }

export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, mac] = raw.split(".");
  if (!id || !mac) return null;
  const want = Buffer.from(sign(id), "hex"), got = Buffer.from(mac, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return getData().user(id);
}
/** For pages: send signed-out visitors to the sign-in screen and bring them back afterwards. */
export async function requireUser(next?: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}
