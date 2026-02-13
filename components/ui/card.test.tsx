// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

describe('Card primitives', () => {
  it('renders full card structure', () => {
    render(
      <Card className="custom-card">
        <CardHeader>
          <CardTitle>Meal Card</CardTitle>
          <CardDescription>A short description</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>Footer actions</CardFooter>
      </Card>,
    )

    expect(screen.getByText('Meal Card')).toHaveClass('font-semibold')
    expect(screen.getByText('A short description')).toHaveClass('text-muted-foreground')
    expect(screen.getByText('Body content')).toHaveClass('p-5')
    expect(screen.getByText('Footer actions')).toHaveClass('items-center')
    expect(screen.getByText('Meal Card').closest('.custom-card')).toBeInTheDocument()
  })
})
