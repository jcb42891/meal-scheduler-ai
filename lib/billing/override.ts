function readCsvEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isMagicImportOverrideUser(input: {
  userId?: string | null
  email?: string | null
}) {
  const userIds = readCsvEnv('MAGIC_IMPORT_OVERRIDE_USER_IDS')
  const emails = readCsvEnv('MAGIC_IMPORT_OVERRIDE_USER_EMAILS')

  const normalizedUserId = input.userId?.trim().toLowerCase() ?? ''
  const normalizedEmail = input.email?.trim().toLowerCase() ?? ''

  if (normalizedUserId && userIds.includes(normalizedUserId)) {
    return true
  }

  if (normalizedEmail && emails.includes(normalizedEmail)) {
    return true
  }

  return false
}
