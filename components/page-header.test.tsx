// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders title and optional description', () => {
    render(<PageHeader title="Meal Plan" description="Plan meals for the week" />)

    expect(screen.getByRole('heading', { name: 'Meal Plan' })).toBeInTheDocument()
    expect(screen.getByText('Plan meals for the week')).toBeInTheDocument()
  })

  it('renders context, actions, and footer when provided', () => {
    render(
      <PageHeader
        title="Meals"
        context={<span>Group: Family</span>}
        actions={<button type="button">Create Meal</button>}
        footer={<p>Footer note</p>}
        className="custom-class"
      />,
    )

    expect(screen.getByText('Group: Family')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Meal' })).toBeInTheDocument()
    expect(screen.getByText('Footer note')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meals' }).closest('section')).toHaveClass('custom-class')
  })

  it('does not render optional sections when omitted', () => {
    render(<PageHeader title="Calendar" />)

    expect(screen.queryByText('Footer note')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
  })
})
