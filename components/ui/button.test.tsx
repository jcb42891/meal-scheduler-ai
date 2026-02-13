// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders a native button by default', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveClass('bg-primary')
    expect(button).toHaveClass('h-10')
  })

  it('renders child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/meals">Meals</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Meals' })
    expect(link).toHaveAttribute('href', '/meals')
    expect(link).toHaveClass('inline-flex')
  })
})
