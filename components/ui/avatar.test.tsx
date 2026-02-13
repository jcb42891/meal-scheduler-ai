// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar, AvatarFallback, AvatarImage } from './avatar'

describe('Avatar', () => {
  it('renders avatar root and fallback content', () => {
    const { container } = render(
      <Avatar className="custom-avatar">
        <AvatarImage src="/avatar.png" alt="User Avatar" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    )

    expect(screen.getByText('AB')).toHaveClass('rounded-full')
    expect(screen.getByText('AB').closest('.custom-avatar')).toBeInTheDocument()
    expect(container.querySelector('.custom-avatar')).toHaveClass('rounded-full')
  })
})
