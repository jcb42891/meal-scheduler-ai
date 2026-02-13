// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockUser = { email?: string | null } | null

const authState = {
  user: null as MockUser,
  signOut: vi.fn(),
  loading: false,
}

let pathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: React.ReactNode }) => {
    const normalizedHref = typeof href === 'string' ? href : href?.pathname ?? ''
    return (
      <a href={normalizedHref} {...props}>
        {children}
      </a>
    )
  },
}))

import { Navbar } from './navbar'

describe('Navbar', () => {
  beforeEach(() => {
    authState.user = null
    authState.loading = false
    authState.signOut.mockReset()
    pathname = '/'
  })

  it('shows sign-in action when unauthenticated', () => {
    render(<Navbar />)

    const signInLink = screen.getByRole('link', { name: 'Sign In' })
    expect(signInLink).toHaveAttribute('href', '/auth')
    expect(screen.queryByRole('link', { name: 'Calendar' })).not.toBeInTheDocument()
  })

  it('shows loading skeletons while auth state is loading', () => {
    authState.loading = true
    const { container } = render(<Navbar />)

    expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })

  it('renders navigation links for authenticated users and highlights active route', () => {
    authState.user = { email: 'cook@example.com' }
    pathname = '/meals'

    render(<Navbar />)

    expect(screen.getByRole('link', { name: 'Pantry Planner' })).toHaveAttribute('href', '/')
    const mealLibraryLinks = screen.getAllByRole('link', { name: 'Meal Library' })
    expect(mealLibraryLinks.length).toBeGreaterThan(0)
    expect(
      mealLibraryLinks.some(
        (link) =>
          link.className.includes('bg-primary text-primary-foreground') ||
          link.className.includes('border-primary/40 bg-primary/10 text-primary'),
      ),
    ).toBe(true)
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument()
  })
})
