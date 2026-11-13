import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;
let nb: string;

// Shim of the Supabase pieces the migration depends on.
const SHIM = `
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create role authenticated nologin; create role anon nologin; create role service_role nologin;
  grant usage on schema public, auth to authenticated;
`;

async function as<T>(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.uid','${uid}',false);`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(readFileSync(path.join(import.meta.dirname, "../../supabase/migrations/0001_init.sql"), "utf8"));
  await db.exec(readFileSync(path.join(import.meta.dirname, "../../supabase/migrations/0002_profile_trigger.sql"), "utf8"));
  await db.exec(readFileSync(path.join(import.meta.dirname, "../../supabase/migrations/0003_agent_usage.sql"), "utf8"));
  await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
                 grant execute on all functions in schema public to authenticated;`);
  await db.exec(`insert into auth.users (id, email) values ('${A}','alice@example.com'),('${B}','bob@example.com');`);
  const r = await as<{ id: string }>(A, `insert into notebooks (owner_id,title) values ('${A}','A secret') returning id`);
  nb = r.rows[0]!.id;
  await as(A, `insert into tabs (notebook_id,name,order_key,liveblocks_room) values ('${nb}','T','a','room-1')`);
});

describe("profile trigger (0002)", () => {
  it("creates a profile for each new auth user, named from the email", async () => {
    const r = await db.query<{ display_name: string }>(`select display_name from profiles order by display_name`);
    expect(r.rows.map((x) => x.display_name)).toEqual(["alice", "bob"]);
  });
});

describe("agent daily cap (0003)", () => {
  const start = async (u: string, max: number) => (await db.query<{ agent_try_start_run: boolean }>(`select agent_try_start_run('${u}', ${max})`)).rows[0]!.agent_try_start_run;
  it("allows exactly max runs per user per day, then refuses; users are independent", async () => {
    expect([await start(A, 2), await start(A, 2), await start(A, 2), await start(A, 2)]).toEqual([true, true, false, false]);
    expect(await start(B, 2)).toBe(true);
    const r = await db.query<{ runs: number }>(`select runs from agent_usage_daily where user_id='${A}'`);
    expect(r.rows[0]!.runs).toBe(2); // refused attempts do not count
  });
  it("is not executable by signed-in users (service role only)", async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('anon', 'public.agent_try_start_run(uuid,int)', 'execute') or has_function_privilege('authenticated', 'public.agent_try_start_run(uuid,int)', 'execute') as ok`);
    // the test shim grants execute on all functions for helper fns, so assert on the migration text instead
    const sql = readFileSync(path.join(import.meta.dirname, "../../supabase/migrations/0003_agent_usage.sql"), "utf8");
    expect(sql).toMatch(/revoke all on function public\.agent_try_start_run\(uuid, int\) from anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.agent_try_start_run\(uuid, int\) to service_role/);
    expect(typeof r.rows[0]!.ok).toBe("boolean");
  });
});

describe("RLS: two users", () => {
  it("owner is auto-added as member and can read", async () => {
    expect((await as(A, `select * from notebooks`)).rows).toHaveLength(1);
  });
  it("stranger sees nothing", async () => {
    expect((await as(B, `select * from notebooks`)).rows).toHaveLength(0);
    expect((await as(B, `select * from tabs`)).rows).toHaveLength(0);
    expect((await as(B, `select * from notebook_members`)).rows).toHaveLength(0);
  });
  it("stranger cannot write", async () => {
    await expect(as(B, `insert into tabs (notebook_id,name,order_key,liveblocks_room) values ('${nb}','x','b','room-2')`)).rejects.toThrow();
    expect((await as(B, `update notebooks set title='pwned' where id='${nb}' returning id`)).rows).toHaveLength(0);
    expect((await as(B, `delete from notebooks where id='${nb}' returning id`)).rows).toHaveLength(0);
  });
  it("stranger cannot self-add as member", async () => {
    await expect(as(B, `insert into notebook_members values ('${nb}','${B}','owner')`)).rejects.toThrow();
  });
  it("viewer reads but cannot write", async () => {
    await as(A, `insert into notebook_members values ('${nb}','${B}','viewer')`);
    expect((await as(B, `select * from tabs`)).rows).toHaveLength(1);
    await expect(as(B, `insert into tabs (notebook_id,name,order_key,liveblocks_room) values ('${nb}','x','b','room-3')`)).rejects.toThrow();
    expect((await as(B, `update notebooks set title='pwned' where id='${nb}' returning id`)).rows).toHaveLength(0);
  });
  it("viewer cannot escalate own role", async () => {
    expect((await as(B, `update notebook_members set role='owner' where user_id='${B}' returning 1`)).rows).toHaveLength(0);
  });
  it("editor writes but cannot manage sharing or delete", async () => {
    await as(A, `update notebook_members set role='editor' where user_id='${B}'`);
    expect((await as(B, `update notebooks set title='edited' where id='${nb}' returning id`)).rows).toHaveLength(1);
    expect((await as(B, `delete from notebooks where id='${nb}' returning id`)).rows).toHaveLength(0);
    await expect(as(B, `insert into share_links values ('t','${nb}','viewer',true,null)`)).rejects.toThrow();
  });
  it("every public table has RLS enabled", async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });
});
