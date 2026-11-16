import { beforeEach, describe, expect, it } from "vitest";
import { DEMO, memoryData, resetMemory } from "@/lib/data/memory";
import type { User } from "@/lib/data/types";

let me: User, priya: User, docId: string;
beforeEach(async () => {
  resetMemory();
  me = await memoryData.signIn(DEMO);
  priya = await memoryData.signIn({ email: "priya@draftly.test", password: "draftly-demo" });
  docId = (await memoryData.createArtifact(me.id, { kind: "doc" })).artifact.id;
});

describe("sharing", () => {
  it("a new doc is private: only its owner is listed, and nobody else can open it", async () => {
    expect((await memoryData.people(me.id, docId)).map((p) => p.role)).toEqual(["owner"]);
    expect(await memoryData.getArtifact(priya.id, docId)).toBeNull();
    await expect(memoryData.people(priya.id, docId)).rejects.toMatchObject({ code: "not_found" });
  });
  it("the owner shares by email with view or edit access, and can change it", async () => {
    expect(await memoryData.shareByEmail(me.id, docId, " Priya@Draftly.test ", "viewer")).toBe("shared");
    expect((await memoryData.getArtifact(priya.id, docId))?.artifact.role).toBe("viewer");
    await memoryData.setRole(me.id, docId, "priya@draftly.test", "editor");
    expect(await memoryData.roleOn(priya.id, docId)).toBe("editor");
    expect((await memoryData.listArtifacts(priya.id)).some((a) => a.id === docId)).toBe(true);
  });
  it("an address with no account is invited, and gets access on signing up with it", async () => {
    expect(await memoryData.shareByEmail(me.id, docId, "new@example.com", "editor")).toBe("invited");
    expect((await memoryData.people(me.id, docId)).at(-1)).toMatchObject({ email: "new@example.com", pending: true, role: "editor" });
    const u = await memoryData.signUp({ email: "new@example.com", password: "a-long-password", name: "New Person" });
    expect(await memoryData.roleOn(u.id, docId)).toBe("editor");
    expect((await memoryData.people(me.id, docId)).some((p) => p.pending)).toBe(false);
  });
  it("only the owner can share, change access or remove others", async () => {
    await memoryData.shareByEmail(me.id, docId, "priya@draftly.test", "editor");
    await expect(memoryData.shareByEmail(priya.id, docId, "x@example.com", "viewer")).rejects.toMatchObject({ code: "forbidden" });
    await expect(memoryData.setRole(priya.id, docId, "priya@draftly.test", "editor")).rejects.toMatchObject({ code: "forbidden" });
    await expect(memoryData.removeAccess(priya.id, docId, DEMO.email)).rejects.toMatchObject({ code: "forbidden" });
    await expect(memoryData.renameArtifact(priya.id, docId, "Mine")).rejects.toMatchObject({ code: "forbidden" });
    await expect(memoryData.deleteArtifact(priya.id, docId)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("the owner cannot be removed, demoted or added twice", async () => {
    await expect(memoryData.removeAccess(me.id, docId, DEMO.email)).rejects.toMatchObject({ code: "invalid" });
    await expect(memoryData.setRole(me.id, docId, DEMO.email, "viewer")).rejects.toMatchObject({ code: "invalid" });
    await expect(memoryData.shareByEmail(me.id, docId, DEMO.email, "viewer")).rejects.toMatchObject({ code: "invalid" });
  });
  it("only view and edit can be granted; a bad address is refused", async () => {
    await expect(memoryData.shareByEmail(me.id, docId, "priya@draftly.test", "owner" as never)).rejects.toMatchObject({ code: "invalid" });
    await expect(memoryData.shareByEmail(me.id, docId, "not-an-address", "viewer")).rejects.toMatchObject({ code: "invalid" });
  });
  it("the owner removes someone, and a person can leave on their own", async () => {
    await memoryData.shareByEmail(me.id, docId, "priya@draftly.test", "viewer");
    await memoryData.removeAccess(me.id, docId, "priya@draftly.test");
    expect(await memoryData.roleOn(priya.id, docId)).toBeNull();
    await memoryData.shareByEmail(me.id, docId, "priya@draftly.test", "viewer");
    await memoryData.removeAccess(priya.id, docId, "priya@draftly.test");
    expect(await memoryData.getArtifact(priya.id, docId)).toBeNull();
  });
});
