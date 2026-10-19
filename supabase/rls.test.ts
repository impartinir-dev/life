// Runs schema.sql in an in-memory Postgres (PGlite) with a minimal stand-in for Supabase's
// auth schema, then checks the access rules from the point of view of different users.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public to authenticated, anon;
  grant usage on schema auth to authenticated, anon;
`

const ADAM = '00000000-0000-0000-0000-00000000000a'
const WIFE = '00000000-0000-0000-0000-00000000000b'
const STRANGER = '00000000-0000-0000-0000-00000000000c'
const EMAILS: Record<string, string> = {
  [ADAM]: 'adam@example.com',
  [WIFE]: 'wife@example.com',
  [STRANGER]: 'stranger@example.com',
}

let db: PGlite

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: user, email: EMAILS[user] }),
  ])
  await db.exec('set role authenticated')
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows

let home: string

beforeAll(async () => {
  db = new PGlite()
  await db.exec(AUTH_STUB)
  await db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  for (const [id, email] of Object.entries(EMAILS)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"language":"de"}')`, [id, email])
  }
  home = await as(ADAM, async () => {
    const [r] = (await rows(`select public.create_household('Home') as id`)) as { id: string }[]
    await rows(`insert into public.lists (id, household_id, name) values (gen_random_uuid(), $1, 'Groceries')`, [r.id])
    return r.id
  })
})

describe('access rules', () => {
  it('creates a profile for each new account', async () => {
    const [p] = (await rows(`select display_name, language from public.profiles where id = $1`, [ADAM])) as any[]
    expect(p).toEqual({ display_name: 'adam', language: 'de' })
  })

  it('hides a household from people who are not members', async () => {
    await as(STRANGER, async () => {
      expect(await rows(`select * from public.households`)).toHaveLength(0)
      expect(await rows(`select * from public.lists`)).toHaveLength(0)
      expect(await rows(`select * from public.profiles where id = $1`, [ADAM])).toHaveLength(0)
    })
  })

  it('refuses writes into another household', async () => {
    await as(STRANGER, async () => {
      await expect(
        rows(`insert into public.lists (id, household_id, name) values (gen_random_uuid(), $1, 'x')`, [home]),
      ).rejects.toThrow(/row-level security/)
    })
  })

  it('refuses joining a household directly', async () => {
    await as(STRANGER, async () => {
      await expect(
        rows(`insert into public.household_members (household_id, user_id) values ($1, $2)`, [home, STRANGER]),
      ).rejects.toThrow(/permission denied/)
    })
  })

  it('lets only the invited email accept an invite', async () => {
    const [invite] = (await as(ADAM, () =>
      rows(`insert into public.household_invites (household_id, email) values ($1, 'Wife@Example.com') returning id`, [home]),
    )) as { id: string }[]

    await as(STRANGER, async () => {
      expect(await rows(`select * from public.my_invites()`)).toHaveLength(0)
      await expect(rows(`select public.accept_invite($1)`, [invite.id])).rejects.toThrow(/invite not found/)
    })

    await as(WIFE, async () => {
      const mine = (await rows(`select household_name, invited_by_name from public.my_invites()`)) as any[]
      expect(mine).toEqual([{ household_name: 'Home', invited_by_name: 'adam' }])
      await rows(`select public.accept_invite($1)`, [invite.id])
      expect(await rows(`select name from public.lists`)).toEqual([{ name: 'Groceries' }])
      expect(await rows(`select id from public.profiles order by id`)).toHaveLength(2)
    })
  })

  it('keeps an item in the same household as its list', async () => {
    const other = await as(STRANGER, async () => {
      const [r] = (await rows(`select public.create_household('Other') as id`)) as { id: string }[]
      return r.id
    })
    await as(STRANGER, async () => {
      const [list] = (await rows(`select id from public.lists where household_id = $1`, [home])) as any[]
      expect(list).toBeUndefined()
    })
    // Adam is not in "Other", so he cannot plant an item there pointing at his own list.
    await as(ADAM, async () => {
      const [list] = (await rows(`select id from public.lists where household_id = $1`, [home])) as { id: string }[]
      await expect(
        rows(`insert into public.list_items (id, household_id, list_id, name) values (gen_random_uuid(), $1, $2, 'x')`, [
          other,
          list.id,
        ]),
      ).rejects.toThrow()
    })
  })

  it('denies anonymous access entirely', async () => {
    await db.exec('set role anon')
    try {
      await expect(rows(`select * from public.lists`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })
})
