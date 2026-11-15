"use client";
/* S09: who can open this, and with what access. Private by default. Only the owner can change it;
   everyone else sees the list and can leave. */
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { listPeople, removeAccess, setRole, shareByEmail, type ShareState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconLock, IconPeople } from "@/components/ui/icons";
import { Avatar, Badge, Skeleton } from "@/components/ui/misc";
import { ControlledDialog } from "@/components/ui/overlays";
import { Select } from "@/components/ui/select";
import type { Artifact, ShareRole } from "@/lib/data/types";

const ROLES = [{ value: "viewer", label: "Can view" }, { value: "editor", label: "Can edit" }];

export function ShareButton({ artifact, myEmail }: { artifact: Artifact; myEmail: string }) {
  const router = useRouter();
  const owner = artifact.role === "owner";
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState | null>(null);
  const [role, setNewRole] = useState<ShareRole>("viewer");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listPeople(artifact.id).then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [open, artifact.id]);

  const run = (fn: () => Promise<ShareState>, after?: (s: ShareState) => void) => start(async () => { const s = await fn(); setState(s); after?.(s); });
  const people = state?.people ?? [];
  const others = people.filter((p) => p.role !== "owner");

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setState(null); setOpen(true); }}><IconPeople /> <span className="ui-ws-wide">Share</span></Button>
      <ControlledDialog open={open} onOpenChange={setOpen} title={`Share “${artifact.title}”`} description={owner ? "People you add must sign in to open it." : "Only the owner can change who has access."}>
        <div className="ui-stack">
          {owner ? (
            <form style={{ display: "flex", gap: 8 }} noValidate onSubmit={(e) => { e.preventDefault(); if (email.trim()) run(() => shareByEmail(artifact.id, email, role), (s) => { if (!s.error) setEmail(""); }); }}>
              <Input type="email" name="email" aria-label="Email address" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 0 }} aria-invalid={state?.error ? true : undefined} aria-describedby={state?.error ? "share-error" : undefined} />
              <Select label="Access for the new person" value={role} onValueChange={(v) => setNewRole(v as ShareRole)} options={ROLES} />
              <Button type="submit" loading={pending} disabled={!pending && !email.trim()}>Share</Button>
            </form>
          ) : null}
          {state?.error ? <p className="ui-error" id="share-error" role="alert">{state.error}</p> : null}
          {state?.notice ? <p className="ui-hint" role="status">{state.notice}</p> : null}
          {!state ? <div className="ui-stack" aria-busy="true" aria-label="Loading who has access"><Skeleton h={28} /><Skeleton h={28} w="70%" /></div> : (
            <div role="list" aria-label="People with access">
              {people.map((p, i) => (
                <div key={p.email} role="listitem" className="ui-share-row">
                  <Avatar name={p.name} color={`var(--color-person-${(i % 6) + 1})`} />
                  <span className="ui-share-who"><span>{p.name}{p.email === myEmail ? " (you)" : ""}</span>{p.pending ? null : <small>{p.email}</small>}</span>
                  {p.pending ? <Badge tone="guest">Invited</Badge> : null}
                  {p.role === "owner" ? <Badge>Owner</Badge>
                    : owner ? <Select label={`Access for ${p.name}`} value={p.role} options={[...ROLES, { value: "remove", label: "Remove" }]}
                        onValueChange={(v) => run(() => (v === "remove" ? removeAccess(artifact.id, p.email) : setRole(artifact.id, p.email, v as ShareRole)))} />
                      : <Badge>{p.role === "editor" ? "Can edit" : p.role === "commenter" ? "Can comment" : "Can view"}</Badge>}
                </div>
              ))}
            </div>
          )}
          {state && !state.error ? (
            <div className="ui-linkbox">
              {others.length === 0 ? <IconLock /> : <IconPeople />}
              <span>{others.length === 0 ? "Private. Only the owner can open this." : `Shared with ${others.length} ${others.length === 1 ? "person" : "people"}. Nobody else can open it.`}</span>
              {!owner ? <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => removeAccess(artifact.id, myEmail), (s) => { if (!s.error || s.people.length === 0) { setOpen(false); router.push("/library"); router.refresh(); } })}>Leave</Button> : null}
            </div>
          ) : null}
        </div>
      </ControlledDialog>
    </>
  );
}
