import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import { acknowledgeWelcome, workspaceDetails } from '../src/server/workspaces'

test('welcome acknowledgement persists once per account across workspace reads', async () => {
  const pg = new PGlite()
  try {
    for (const file of [
      '0000_thankful_groot',
      '0001_workspace_slug',
      '0003_require_workspace_slug',
      '0006_cuddly_stature',
      '0007_red_ser_duncan',
      '0009_open_junta',
      '0016_volatile_bullseye',
    ])
      await pg.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'))
    const db = drizzle(pg, { schema }) as unknown as Database
    const viewer = { id: 'owner', name: 'Owner', email: 'owner@example.test' }
    await db.insert(schema.user).values(viewer)
    await db.insert(schema.workspace).values({
      id: 'workspace',
      slug: 'workspace',
      name: 'Test workspace',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Asia/Jakarta',
      createdBy: viewer.id,
    })
    await db.insert(schema.workspaceMember).values({
      id: 'membership',
      workspaceId: 'workspace',
      userId: viewer.id,
      role: 'admin',
    })

    expect((await workspaceDetails(db, viewer, 'workspace')).welcomeSeenAt).toBeNull()
    await acknowledgeWelcome(db, viewer)
    const seen = (await workspaceDetails(db, viewer, 'workspace')).welcomeSeenAt
    expect(seen).toBeInstanceOf(Date)
    await acknowledgeWelcome(db, viewer)
    expect((await workspaceDetails(db, viewer, 'workspace')).welcomeSeenAt).toEqual(seen)
  } finally {
    await pg.close()
  }
})
