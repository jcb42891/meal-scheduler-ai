// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './icon-button'

describe('IconButton', () => {
  it('defaults to button type and ghost styles', () => {
    render(<IconButton aria-label="delete">X</IconButton>)

    const button = screen.getByRole('button', { name: 'delete' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('h-9')
  })

  it('supports variant and click handler', () => {
    const onClick = vi.fn()
    render(
      <IconButton aria-label="remove" variant="destructive" onClick={onClick}>
        X
      </IconButton>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'remove' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'remove' })).toHaveClass('text-destructive')
  })
})
