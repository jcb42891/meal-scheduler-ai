const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

function toOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Build an absolute URL for auth email redirects.
 * Defaults to the current browser origin to avoid localhost links leaking into production emails.
 */
export function buildClientAppUrl(pathname: string) {
  if (typeof window === 'undefined') {
    throw new Error('buildClientAppUrl must be called in a browser context.')
  }

  const runtimeOrigin = window.location.origin
  const runtimeHostname = window.location.hostname
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim()
  const allowDevOverride = process.env.NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE === 'true'

  if (!configuredOrigin) {
    return new URL(pathname, runtimeOrigin).toString()
  }

  const parsedConfiguredOrigin = toOrigin(configuredOrigin)
  if (!parsedConfiguredOrigin) {
    console.error('NEXT_PUBLIC_APP_ORIGIN must be a valid absolute URL. Falling back to current origin.')
    return new URL(pathname, runtimeOrigin).toString()
  }

  const shouldPreferRuntimeOrigin = LOCAL_HOSTNAMES.has(runtimeHostname) && !allowDevOverride
  const preferredOrigin = shouldPreferRuntimeOrigin ? runtimeOrigin : parsedConfiguredOrigin

  return new URL(pathname, preferredOrigin).toString()
}
