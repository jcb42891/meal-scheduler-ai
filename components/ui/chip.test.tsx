// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chip } from './chip'

describe('Chip', () => {
  it('renders content and applies base classes', () => {
    render(<Chip>Vegetarian</Chip>)

    const chip = screen.getByText('Vegetarian')
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveClass('rounded-full')
    expect(chip).toHaveClass('text-xs')
  })

  it('merges custom className', () => {
    render(<Chip className="custom-chip">Beef</Chip>)

    expect(screen.getByText('Beef')).toHaveClass('custom-chip')
  })
})
