// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MealFilterRack } from './meal-filter-rack'

const weeknightOptions = [
  { value: 'all', label: 'All meals' },
  { value: 'friendly', label: 'Weeknight friendly' },
  { value: 'not-friendly', label: 'Not weeknight friendly' },
] as const

describe('MealFilterRack', () => {
  it('calls search callback when typing in search input', () => {
    const onSearchTermChange = vi.fn()

    render(
      <MealFilterRack
        searchTerm=""
        onSearchTermChange={onSearchTermChange}
        selectedCategory="all"
        onCategoryChange={vi.fn()}
        weeknightFilter="all"
        onWeeknightFilterChange={vi.fn()}
        categoryOptions={['Beef', 'Fish']}
        weeknightOptions={weeknightOptions}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search meals...'), { target: { value: 'tacos' } })

    expect(onSearchTermChange).toHaveBeenCalledWith('tacos')
  })

  it('shows active filter count and clears chips back to all', () => {
    const onCategoryChange = vi.fn()
    const onWeeknightFilterChange = vi.fn()

    render(
      <MealFilterRack
        searchTerm="chicken"
        onSearchTermChange={vi.fn()}
        selectedCategory="Beef"
        onCategoryChange={onCategoryChange}
        weeknightFilter="friendly"
        onWeeknightFilterChange={onWeeknightFilterChange}
        categoryOptions={['Beef', 'Fish']}
        weeknightOptions={weeknightOptions}
      />,
    )

    expect(screen.getByText('2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Beef' }))
    fireEvent.click(screen.getByRole('button', { name: 'Weeknight friendly' }))

    expect(onCategoryChange).toHaveBeenCalledWith('all')
    expect(onWeeknightFilterChange).toHaveBeenCalledWith('all')
  })
})
