// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Textarea } from './textarea'

describe('Textarea', () => {
  it('renders textarea with provided classes', () => {
    render(<Textarea placeholder="Notes" className="custom-textarea" />)

    const textarea = screen.getByPlaceholderText('Notes')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveClass('custom-textarea')
    expect(textarea).toHaveClass('min-h-[80px]')
  })

  it('supports controlled updates via onChange', () => {
    const onChange = vi.fn()
    render(<Textarea aria-label="description" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('description'), { target: { value: 'Meal prep details' } })

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
