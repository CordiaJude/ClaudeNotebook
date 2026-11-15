// Runs replica/schema.sql in an in-memory Postgres (PGlite) with a small stand-in for Supabase's auth and storage
// schemas, then checks the permission rules as four different people.  Usage: node replica/schema-check.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
const db = new PGlite();
const U = (c) => `00000000-0000-0000-0000-00000000000${c}`;
const [A, B, C, D] = ["a", "b", "c", "d"].map(U);
await db.exec(`
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create role authenticated nologin; create role anon nologin; create role service_role nologin;
  grant usage on schema public, auth to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
`);
await db.exec(readFileSync(process.argv[2] ?? path.join(import.meta.dirname, "schema.sql"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  -> " + extra : ""}`); };
async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.uid','${uid}',false);`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role;`); }
}
const fails = async (uid, sql) => { try { const r = await as(uid, sql); return r.affectedRows === 0 && r.rows.length === 0 ? "0 rows" : null; } catch (e) { return String(e.message).slice(0, 70); } };
const n = async (uid, sql) => (await as(uid, sql)).rows.length;

await db.exec(`insert into auth.users (id,email,raw_user_meta_data,email_confirmed_at) values
  ('${A}','Alice@Example.com','{"full_name":"Alice A"}',now()),('${B}','bob@example.com','{}',now()),('${D}','dan@example.com','{}',now());`);
const prof = await db.query(`select email, display_name from profiles order by email`);
ok("sign-up creates profile (lowercased email, provider name)", prof.rows[0].email === "alice@example.com" && prof.rows[0].display_name === "Alice A" && prof.rows.length === 3);
const wsA = (await as(A, `select id from workspaces`)).rows;
ok("each person sees only their personal workspace", wsA.length === 1);
const ws = wsA[0].id;

const art = (await as(A, `insert into artifacts (kind,title,owner_id,workspace_id) values ('doc','Secret plan','${A}','${ws}') returning id`)).rows[0].id;
ok("owner creates a doc (insert returning works)", !!art);
ok("new doc is private: exactly one permission row, the owner", (await db.query(`select role from permissions where artifact_id='${art}'`)).rows.map(r => r.role).join() === "owner");
const tab = (await as(A, `insert into doc_tabs (artifact_id,position,room) values ('${art}','a0','room-1') returning id`)).rows[0].id;
const conv = (await as(A, `insert into conversations (artifact_id,user_id) values ('${art}','${A}') returning id`)).rows[0].id;
await db.exec(`insert into messages (conversation_id,role,content) values ('${conv}','user','{"text":"hi"}')`);
ok("doc cannot carry deck-only fields", !!(await fails(A, `insert into artifacts (kind,owner_id,workspace_id,room) values ('doc','${A}','${ws}','r')`)));
ok("cannot create an artifact owned by someone else", !!(await fails(B, `insert into artifacts (kind,owner_id,workspace_id) values ('doc','${A}','${ws}')`)));
ok("cannot create an artifact in someone else's workspace", !!(await fails(B, `insert into artifacts (kind,owner_id,workspace_id) values ('doc','${B}','${ws}')`)));

// stranger
ok("stranger sees no artifact", (await n(B, `select 1 from artifacts`)) === 0);
ok("stranger sees no tab", (await n(B, `select 1 from doc_tabs`)) === 0);
ok("stranger cannot add a tab", !!(await fails(B, `insert into doc_tabs (artifact_id,position,room) values ('${art}','a1','room-x')`)));
ok("stranger cannot grant themself access", !!(await fails(B, `insert into permissions (artifact_id,user_id,role) values ('${art}','${B}','editor')`)));
ok("stranger cannot share by email", !!(await fails(B, `select share_by_email('${art}','dan@example.com','viewer')`)));
ok("stranger cannot see the owner's profile", (await n(B, `select 1 from profiles where id='${A}'`)) === 0);

// viewer
ok("owner shares by email with an existing account", (await as(A, `select share_by_email('${art}','BOB@example.com','viewer') r`)).rows[0].r === "shared");
ok("viewer sees the artifact and its tab", (await n(B, `select 1 from artifacts`)) === 1 && (await n(B, `select 1 from doc_tabs`)) === 1);
ok("viewer cannot write content", !!(await fails(B, `update doc_tabs set title='x' where id='${tab}'`)));
ok("viewer cannot comment", !!(await fails(B, `insert into comments (artifact_id,tab_id,author_id,body) values ('${art}','${tab}','${B}','hi')`)));
ok("viewer can queue an export", (await as(B, `insert into export_jobs (artifact_id,user_id,format) values ('${art}','${B}','pdf') returning id`)).rows.length === 1);
ok("viewer cannot mark their export done", !!(await fails(B, `insert into export_jobs (artifact_id,user_id,format,status) values ('${art}','${B}','pdf','done')`)));
ok("viewer cannot read the owner's conversation or messages", (await n(B, `select 1 from conversations`)) === 0 && (await n(B, `select 1 from messages`)) === 0);

// commenter
await as(A, `update permissions set role='commenter' where artifact_id='${art}' and user_id='${B}'`);
ok("commenter can comment", (await as(B, `insert into comments (artifact_id,tab_id,author_id,body) values ('${art}','${tab}','${B}','nice') returning id`)).rows.length === 1);
ok("commenter cannot ask the AI in a comment", !!(await fails(B, `insert into comments (artifact_id,tab_id,author_id,body,mentions_ai) values ('${art}','${tab}','${B}','@AI fix',true)`)));
ok("commenter cannot flip mentions_ai on later", !!(await fails(B, `update comments set mentions_ai=true where author_id='${B}'`)));
ok("commenter cannot pose as the AI", !!(await fails(B, `insert into comments (artifact_id,tab_id,author_id,body,author_type) values ('${art}','${tab}','${B}','x','ai')`)));
ok("commenter cannot write content", !!(await fails(B, `update doc_tabs set title='x' where id='${tab}'`)));
ok("comment body is capped at 1000 characters", !!(await fails(B, `insert into comments (artifact_id,tab_id,author_id,body) values ('${art}','${tab}','${B}',repeat('x',1001))`)));

// editor
await as(A, `update permissions set role='editor' where artifact_id='${art}' and user_id='${B}'`);
ok("editor can write content", (await as(B, `update doc_tabs set title='Edited' where id='${tab}' returning id`)).rows.length === 1);
ok("editor can ask the AI in a comment", (await as(B, `insert into comments (artifact_id,tab_id,author_id,body,mentions_ai) values ('${art}','${tab}','${B}','@AI fix',true) returning id`)).rows.length === 1);
ok("editor cannot rename", !!(await fails(B, `update artifacts set title='Mine now' where id='${art}'`)), await fails(B, `update artifacts set title='Mine now' where id='${art}'`));
ok("editor cannot delete", !!(await fails(B, `select delete_artifact('${art}')`)), await fails(B, `select delete_artifact('${art}')`));
ok("editor cannot share", !!(await fails(B, `select share_by_email('${art}','dan@example.com','viewer')`)) && !!(await fails(B, `insert into permissions (artifact_id,user_id,role) values ('${art}','${D}','viewer')`)));
ok("editor cannot make themself owner", !!(await fails(B, `update permissions set role='owner' where artifact_id='${art}' and user_id='${B}'`)));
ok("editor cannot remove the owner", !!(await fails(B, `delete from permissions where artifact_id='${art}' and user_id='${A}'`)));
ok("title really unchanged", (await db.query(`select title from artifacts where id='${art}'`)).rows[0].title === "Secret plan");

// owner
ok("owner can rename", (await as(A, `update artifacts set title='Plan v2' where id='${art}' returning id`)).rows.length === 1);
ok("owner cannot give the artifact away", !!(await fails(A, `update artifacts set owner_id='${B}' where id='${art}'`)));
ok("owner cannot add a second owner", !!(await fails(A, `update permissions set role='owner' where artifact_id='${art}' and user_id='${B}'`)));
ok("nobody can set their own plan", !!(await fails(A, `update profiles set plan='team' where id='${A}'`)));
ok("people can change their display name", (await as(A, `update profiles set display_name='Alice' where id='${A}' returning id`)).rows.length === 1);

// invite someone with no account
ok("share with an address that has no account -> invited", (await as(A, `select share_by_email('${art}','carol@example.com','editor') r`)).rows[0].r === "invited");
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${C}','carol@example.com','{}')`);
ok("unconfirmed address claims nothing", (await as(C, `select claim_invites() r`)).rows[0].r === 0 && (await n(C, `select 1 from artifacts`)) === 0);
await db.exec(`update auth.users set email_confirmed_at=now() where id='${C}'`);
ok("confirmed address claims the invite", (await as(C, `select claim_invites() r`)).rows[0].r === 1 && (await as(C, `select role_on('${art}') r`)).rows[0].r === "editor");
ok("claiming twice adds nothing", (await as(C, `select claim_invites() r`)).rows[0].r === 0);

// share link
await as(A, `insert into share_links (artifact_id,token_hash,role,created_by) values ('${art}','hash-1','viewer','${A}')`);
ok("share link cannot grant edit", !!(await fails(A, `update share_links set role='editor' where artifact_id='${art}'`)));
ok("signed-in visitor with the link becomes a viewer", (await as(D, `select redeem_share_link('hash-1') r`)).rows[0].r === art && (await as(D, `select role_on('${art}') r`)).rows[0].r === "viewer");
await as(B, `select redeem_share_link('hash-1')`);
ok("link never downgrades an existing role", (await as(B, `select role_on('${art}') r`)).rows[0].r === "editor");
ok("wrong token gives nothing", (await as(D, `select redeem_share_link('nope') r`)).rows[0].r === null);
await db.exec(`set role anon; select set_config('request.jwt.uid','',false);`);
let anonErr = null; try { await db.query(`select redeem_share_link('hash-1')`); } catch (e) { anonErr = e.message; } await db.exec(`reset role`);
ok("signed-out visitor cannot redeem a link", !!anonErr, anonErr?.slice(0, 60));
ok("a person can leave", (await as(D, `delete from permissions where artifact_id='${art}' and user_id='${D}' returning 1`)).rows.length === 1);

// AI cap
const start = async (u, m) => (await db.query(`select ai_try_start_run('${u}', ${m}) r`)).rows[0].r;
ok("daily AI cap: exactly max runs", [await start(A, 2), await start(A, 2), await start(A, 2)].join() === "true,true,false");
ok("daily AI cap is not callable by signed-in people", !!(await fails(A, `select ai_try_start_run('${A}', 99)`)));
ok("people cannot write AI runs or messages directly", !!(await fails(A, `insert into ai_runs (artifact_id,user_id,mode) values ('${art}','${A}','chat')`)) && !!(await fails(A, `insert into messages (conversation_id,role,content) values ('${conv}','assistant','{}')`)));

// soft delete
const direct = await fails(A, `update artifacts set deleted_at=now() where id='${art}'`);
console.log("     (direct soft-delete UPDATE by owner:", direct ?? "succeeded", ")");
await db.exec(`update artifacts set deleted_at=null where id='${art}'`);
await as(A, `select delete_artifact('${art}')`);
ok("owner deletes; nobody sees it or its content afterwards", (await n(A, `select 1 from artifacts`)) === 0 && (await n(B, `select 1 from doc_tabs`)) === 0 && (await n(B, `select 1 from comments`)) === 0);

// structure
const norls = (await db.query(`select tablename from pg_tables where schemaname='public' and not rowsecurity`)).rows;
ok("every table has RLS", norls.length === 0, norls.map(r => r.tablename).join());
const tables = (await db.query(`select count(*)::int c from pg_tables where schemaname='public'`)).rows[0].c;
const unindexed = (await db.query(`
  select c.conrelid::regclass::text t, a.attname col from pg_constraint c
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.connamespace='public'::regnamespace
  and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])`)).rows;
ok("every foreign key column leads an index", unindexed.length === 0, unindexed.map(r => `${r.t}.${r.col}`).join(", "));
const pol = (await db.query(`select count(*)::int c from pg_policies where schemaname='public'`)).rows[0].c;
console.log(`\n${pass} passed, ${fail} failed | tables: ${tables}, policies: ${pol}`);
process.exit(fail ? 1 : 0);
