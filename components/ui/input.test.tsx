// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './input'

describe('Input', () => {
  it('renders with passed props and className', () => {
    render(<Input type="email" placeholder="Email" className="custom-input" />)

    const input = screen.getByPlaceholderText('Email')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveClass('custom-input')
    expect(input).toHaveClass('h-10')
  })

  it('fires onChange events', () => {
    const onChange = vi.fn()
    render(<Input aria-label="name" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Pantry' } })

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
