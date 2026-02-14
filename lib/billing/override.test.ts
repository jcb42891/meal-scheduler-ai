import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isMagicImportOverrideUser } from './override'

describe('isMagicImportOverrideUser', () => {
  const originalIds = process.env.MAGIC_IMPORT_OVERRIDE_USER_IDS
  const originalEmails = process.env.MAGIC_IMPORT_OVERRIDE_USER_EMAILS

  beforeEach(() => {
    delete process.env.MAGIC_IMPORT_OVERRIDE_USER_IDS
    delete process.env.MAGIC_IMPORT_OVERRIDE_USER_EMAILS
  })

  afterEach(() => {
    process.env.MAGIC_IMPORT_OVERRIDE_USER_IDS = originalIds
    process.env.MAGIC_IMPORT_OVERRIDE_USER_EMAILS = originalEmails
  })

  it('matches configured user ids', () => {
    process.env.MAGIC_IMPORT_OVERRIDE_USER_IDS = 'user-1,user-2'

    expect(
      isMagicImportOverrideUser({
        userId: 'User-2',
      }),
    ).toBe(true)
  })

  it('matches configured emails', () => {
    process.env.MAGIC_IMPORT_OVERRIDE_USER_EMAILS = 'owner@example.com,other@example.com'

    expect(
      isMagicImportOverrideUser({
        email: 'OWNER@example.com',
      }),
    ).toBe(true)
  })

  it('returns false when user is not in override lists', () => {
    process.env.MAGIC_IMPORT_OVERRIDE_USER_IDS = 'user-9'
    process.env.MAGIC_IMPORT_OVERRIDE_USER_EMAILS = 'admin@example.com'

    expect(
      isMagicImportOverrideUser({
        userId: 'user-1',
        email: 'user@example.com',
      }),
    ).toBe(false)
  })
})
