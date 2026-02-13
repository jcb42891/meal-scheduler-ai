// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Label } from './label'
import { Input } from './input'

describe('Label', () => {
  it('associates with form controls using htmlFor', () => {
    render(
      <div>
        <Label htmlFor="meal-name">Meal Name</Label>
        <Input id="meal-name" />
      </div>,
    )

    expect(screen.getByText('Meal Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Meal Name')).toHaveAttribute('id', 'meal-name')
  })

  it('merges className with variant styles', () => {
    render(<Label className="custom-label">Category</Label>)

    expect(screen.getByText('Category')).toHaveClass('custom-label')
    expect(screen.getByText('Category')).toHaveClass('font-medium')
  })
})
