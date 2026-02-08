import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg

const migrationPath = new URL('../drizzle/0003_m1_security_data_access_hardening.sql', import.meta.url)

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function emailFor(prefix, id) {
  return `${prefix}-${id.replace(/-/g, '')}@example.com`
}

async function expectPgError(client, action, expectedCodes, message) {
  const codeList = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes]
  await client.query('savepoint m1_expected_error')

  let thrownError = null
  try {
    await action()
  } catch (error) {
    thrownError = error
  }

  await client.query('rollback to savepoint m1_expected_error')
  await client.query('release savepoint m1_expected_error')

  if (!thrownError) {
    throw new Error(message)
  }

  const code = typeof thrownError === 'object' && thrownError !== null ? thrownError.code : undefined
  if (!codeList.includes(code)) {
    const details = thrownError instanceof Error ? thrownError.message : String(thrownError)
    throw new Error(`${message} (expected one of ${codeList.join(', ')}, got ${String(code)}: ${details})`)
  }
}

async function createUser(client, id, email) {
  await client.query(
    `
      insert into auth.users (
        id,
        email,
        aud,
        role,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_anonymous
      )
      values ($1, $2, 'authenticated', 'authenticated', now(), now(), '{}'::jsonb, '{}'::jsonb, false)
      on conflict (id) do update
      set email = excluded.email,
          aud = excluded.aud,
          role = excluded.role,
          updated_at = now()
    `,
    [id, email],
  )

  await client.query(
    `
      insert into public.profiles (id, email, updated_at)
      values ($1, $2, now())
      on conflict (id) do update
      set email = excluded.email,
          updated_at = now()
    `,
    [id, email],
  )
}

async function withAuthenticatedUser(client, userId, email, fn) {
  await client.query('reset role')
  await client.query('set local role authenticated')

  const claim = JSON.stringify({
    sub: userId,
    email,
    role: 'authenticated',
  })

  await client.query(`select set_config('request.jwt.claim', $1, true)`, [claim])
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
  await client.query(`select set_config('request.jwt.claim.email', $1, true)`, [email])

  try {
    await fn()
  } finally {
    try {
      await client.query('reset role')
    } catch {
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const migrationSql = await readFile(migrationPath, 'utf8')
  const client = new Client({ connectionString: databaseUrl })

  const ownerId = randomUUID()
  const memberId = randomUUID()
  const outsiderId = randomUUID()
  const invalidRoleUserId = randomUUID()

  const ownerEmail = emailFor('m1-owner', ownerId)
  const memberEmail = emailFor('m1-member', memberId)
  const outsiderEmail = emailFor('m1-outsider', outsiderId)
  const invalidRoleEmail = emailFor('m1-invalid-role', invalidRoleUserId)

  const groupId = randomUUID()
  const groupWithoutInviteId = randomUUID()
  const mealId = randomUUID()
  const stapleId = randomUUID()
  const invitationForOutsiderId = randomUUID()
  const invitationForMemberId = randomUUID()

  await client.connect()

  try {
    await client.query('begin')
    await client.query(migrationSql)

    await createUser(client, ownerId, ownerEmail)
    await createUser(client, memberId, memberEmail)
    await createUser(client, outsiderId, outsiderEmail)
    await createUser(client, invalidRoleUserId, invalidRoleEmail)

    await client.query(
      `
        insert into public.groups (id, name, owner_id)
        values ($1, 'M1 Security Test Group', $2)
      `,
      [groupId, ownerId],
    )

    await client.query(
      `
        insert into public.groups (id, name, owner_id)
        values ($1, 'M1 Security No-Invite Group', $2)
      `,
      [groupWithoutInviteId, ownerId],
    )

    await client.query(
      `
        insert into public.group_members (group_id, user_id, role)
        values
          ($1, $2, 'owner'),
          ($1, $3, 'member'),
          ($4, $2, 'owner')
      `,
      [groupId, ownerId, memberId, groupWithoutInviteId],
    )

    await client.query(
      `
        insert into public.meals (id, name, description, category, weeknight_friendly, group_id, created_by)
        values ($1, 'Security Test Meal', 'Seed row for RLS tests', 'Dinner', true, $2, $3)
      `,
      [mealId, groupId, ownerId],
    )

    await client.query(
      `
        insert into public.meal_calendar (id, meal_id, group_id, date)
        values ($1, $2, $3, current_date + 1)
      `,
      [randomUUID(), mealId, groupId],
    )

    await client.query(
      `
        insert into public.staple_ingredients (id, name, category, quantity, unit, group_id, created_by)
        values ($1, 'Security Test Staple', 'Pantry', 1, 'unit', $2, $3)
      `,
      [stapleId, groupId, ownerId],
    )

    await client.query(
      `
        insert into public.group_invitations (id, group_id, email, invited_by, status, expires_at)
        values
          ($1, $2, $3, $4, 'pending', now() + interval '3 days'),
          ($5, $2, $6, $4, 'pending', now() + interval '3 days')
      `,
      [invitationForOutsiderId, groupId, outsiderEmail, ownerId, invitationForMemberId, memberEmail],
    )

    await withAuthenticatedUser(client, outsiderId, outsiderEmail, async () => {
      const groupResult = await client.query('select id from public.groups where id = $1', [groupId])
      assert(groupResult.rowCount === 0, 'Unauthorized user can read group rows')

      const mealUpdateResult = await client.query(
        `update public.meals set name = 'Hacked by outsider' where id = $1 returning id`,
        [mealId],
      )
      assert(mealUpdateResult.rowCount === 0, 'Unauthorized user can update meals')

      const stapleDeleteResult = await client.query(
        `delete from public.staple_ingredients where id = $1 returning id`,
        [stapleId],
      )
      assert(stapleDeleteResult.rowCount === 0, 'Unauthorized user can delete staple ingredients')

      const inviteUpdateResult = await client.query(
        `update public.group_invitations set status = 'accepted' where id = $1 returning id`,
        [invitationForMemberId],
      )
      assert(inviteUpdateResult.rowCount === 0, 'Unauthorized user can update invitations not addressed to them')

      await expectPgError(
        client,
        () =>
          client.query(
            `
              insert into public.meal_calendar (id, meal_id, group_id, date)
              values ($1, $2, $3, current_date + 2)
            `,
            [randomUUID(), mealId, groupId],
          ),
        '42501',
        'Unauthorized user can insert meal calendar rows',
      )

      await expectPgError(
        client,
        () =>
          client.query(
            `
              insert into public.group_invitations (id, group_id, email, invited_by, status, expires_at)
              values ($1, $2, $3, $4, 'pending', now() + interval '1 day')
            `,
            [randomUUID(), groupId, emailFor('m1-random', randomUUID()), outsiderId],
          ),
        '42501',
        'Unauthorized user can create invitations',
      )

      await expectPgError(
        client,
        () =>
          client.query(
            `
              insert into public.group_members (group_id, user_id, role)
              values ($1, $2, 'owner')
            `,
            [groupId, outsiderId],
          ),
        ['42501', 'P0001'],
        'Unauthorized user can self-assign owner membership',
      )

      await expectPgError(
        client,
        () =>
          client.query(
            `
              insert into public.group_members (group_id, user_id, role)
              values ($1, $2, 'member')
            `,
            [groupWithoutInviteId, outsiderId],
          ),
        '42501',
        'Unauthorized user can join groups without a pending invitation',
      )
    })

    await withAuthenticatedUser(client, outsiderId, outsiderEmail, async () => {
      const contextResult = await client.query(
        `
          select
            auth.uid()::text as uid,
            public.current_user_email() as email
        `,
      )
      assert(contextResult.rows[0]?.uid === outsiderId, 'Auth context user id does not match expected outsider id')
      assert(contextResult.rows[0]?.email === outsiderEmail, 'Auth context email does not match expected outsider email')

      const visibleInviteResult = await client.query(
        `
          select id
          from public.group_invitations
          where id = $1
        `,
        [invitationForOutsiderId],
      )
      assert(visibleInviteResult.rowCount === 1, 'Invited user cannot see their own pending invitation')

      const canJoinResult = await client.query(
        `
          select exists (
            select 1
            from public.group_invitations gi
            where gi.group_id = $1
              and lower(gi.email) = public.current_user_email()
              and gi.status = 'pending'
              and (gi.expires_at is null or gi.expires_at > now())
          ) as can_join
        `,
        [groupId],
      )
      assert(canJoinResult.rows[0]?.can_join === true, 'Invitation lookup did not satisfy group membership join predicate')

      const joinResult = await client.query(
        `
          insert into public.group_members (group_id, user_id, role)
          values ($1, $2, 'member')
        `,
        [groupId, outsiderId],
      )
      assert(joinResult.rowCount === 1, 'Invited user could not join group')

      const membershipResult = await client.query(
        `
          select 1
          from public.group_members
          where group_id = $1
            and user_id = $2
        `,
        [groupId, outsiderId],
      )
      assert(membershipResult.rowCount === 1, 'Inserted membership row is not visible to the invited user')

      const acceptResult = await client.query(
        `
          update public.group_invitations
          set status = 'accepted'
          where id = $1
        `,
        [invitationForOutsiderId],
      )
      assert(acceptResult.rowCount === 1, 'Invited user could not accept invitation')

      const postJoinGroupResult = await client.query('select id from public.groups where id = $1', [groupId])
      assert(postJoinGroupResult.rowCount === 1, 'Joined member cannot read their group')
    })

    await expectPgError(
      client,
      () =>
        client.query(
          `
            insert into public.group_invitations (id, group_id, email, invited_by, status, expires_at)
            values ($1, $2, $3, $4, 'invalid_status', now() + interval '1 day')
          `,
          [randomUUID(), groupId, emailFor('m1-bad-status', randomUUID()), ownerId],
        ),
      '23514',
      'Invalid invitation status was accepted',
    )

    await expectPgError(
      client,
      () =>
        client.query(
          `
            insert into public.group_invitations (id, group_id, email, invited_by, status, expires_at)
            values ($1, $2, $3, $4, 'pending', null)
          `,
          [randomUUID(), groupId, emailFor('m1-no-expiry', randomUUID()), ownerId],
        ),
      '23514',
      'Pending invitation without expiry was accepted',
    )

    await expectPgError(
      client,
      () =>
        client.query(
          `
            insert into public.group_invitations (id, group_id, email, invited_by, status, expires_at)
            values ($1, $2, $3, $4, 'pending', now() + interval '2 days')
          `,
          [randomUUID(), groupId, memberEmail, ownerId],
        ),
      '23505',
      'Duplicate pending invitation was accepted',
    )

    await expectPgError(
      client,
      () =>
        client.query(
          `
            insert into public.group_members (group_id, user_id, role)
            values ($1, $2, 'admin')
          `,
          [groupId, invalidRoleUserId],
        ),
      '23514',
      'Invalid group member role was accepted',
    )

    await client.query('rollback')
    console.log('M1 security tests passed.')
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
    }
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
