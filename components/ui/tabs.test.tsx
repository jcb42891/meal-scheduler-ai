// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

describe('Tabs', () => {
  it('renders tab semantics and initial active content', () => {
    render(
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    )

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    const detailsTab = screen.getByRole('tab', { name: 'Details' })

    expect(overviewTab).toHaveAttribute('data-state', 'inactive')
    expect(detailsTab).toHaveAttribute('data-state', 'active')
    expect(screen.queryByText('Overview content')).not.toBeInTheDocument()
    expect(screen.getByText('Details content')).toHaveAttribute('data-state', 'active')
  })
})
