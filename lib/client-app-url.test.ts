import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildClientAppUrl } from './client-app-url'

describe('buildClientAppUrl', () => {
  const originalAppOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN
  const originalDevOverride = process.env.NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_ORIGIN
    delete process.env.NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_ORIGIN = originalAppOrigin
    process.env.NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE = originalDevOverride
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubWindowLocation(origin: string, hostname: string) {
    vi.stubGlobal('window', {
      location: {
        origin,
        hostname,
      },
    })
  }

  it('throws when called outside the browser context', () => {
    expect(() => buildClientAppUrl('/auth')).toThrow('buildClientAppUrl must be called in a browser context.')
  })

  it('uses runtime origin when NEXT_PUBLIC_APP_ORIGIN is not set', () => {
    stubWindowLocation('https://runtime.example.com', 'runtime.example.com')

    expect(buildClientAppUrl('/auth/update-password')).toBe('https://runtime.example.com/auth/update-password')
  })

  it('falls back to runtime origin when configured app origin is invalid', () => {
    stubWindowLocation('https://runtime.example.com', 'runtime.example.com')
    process.env.NEXT_PUBLIC_APP_ORIGIN = 'not-a-valid-url'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(buildClientAppUrl('/profile')).toBe('https://runtime.example.com/profile')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'NEXT_PUBLIC_APP_ORIGIN must be a valid absolute URL. Falling back to current origin.',
    )
  })

  it('prefers runtime localhost origin unless dev override is enabled', () => {
    stubWindowLocation('http://localhost:3000', 'localhost')
    process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://app.example.com'

    expect(buildClientAppUrl('/groups')).toBe('http://localhost:3000/groups')

    process.env.NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE = 'true'

    expect(buildClientAppUrl('/groups')).toBe('https://app.example.com/groups')
  })

  it('uses configured origin in non-localhost runtime contexts', () => {
    stubWindowLocation('https://staging.example.com', 'staging.example.com')
    process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://app.example.com'

    expect(buildClientAppUrl('/calendar')).toBe('https://app.example.com/calendar')
  })
})
