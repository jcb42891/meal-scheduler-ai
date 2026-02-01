'use client'

import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type WeeknightFilter = 'all' | 'friendly' | 'not-friendly'

export type WeeknightFilterOption = {
  value: WeeknightFilter
  label: string
  activeClassName?: string
}

type Props = {
  searchTerm: string
  onSearchTermChange: (value: string) => void
  selectedCategory: string
  onCategoryChange: (value: string) => void
  weeknightFilter: WeeknightFilter
  onWeeknightFilterChange: (value: WeeknightFilter) => void
  categoryOptions: string[]
  weeknightOptions: WeeknightFilterOption[]
  className?: string
}

export function MealFilterRack({
  searchTerm,
  onSearchTermChange,
  selectedCategory,
  onCategoryChange,
  weeknightFilter,
  onWeeknightFilterChange,
  categoryOptions,
  weeknightOptions,
  className,
}: Props) {
  const activeCategoryLabel =
    selectedCategory === 'all'
      ? 'All categories'
      : selectedCategory
  const activeWeeknightLabel =
    weeknightOptions.find((option) => option.value === weeknightFilter)?.label ??
    'All meals'

  const activeFilterCount =
    (selectedCategory !== 'all' ? 1 : 0) + (weeknightFilter !== 'all' ? 1 : 0)

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="meal-filter-search"
            type="search"
            placeholder="Search meals..."
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 w-full justify-between sm:w-auto">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              Category
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={selectedCategory}
              onValueChange={onCategoryChange}
            >
              <DropdownMenuRadioItem value="all">All categories</DropdownMenuRadioItem>
              {categoryOptions.map((category) => (
                <DropdownMenuRadioItem key={category} value={category}>
                  {category}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              Weeknight friendliness
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={weeknightFilter}
              onValueChange={(value) =>
                onWeeknightFilterChange(value as WeeknightFilter)
              }
            >
              {weeknightOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Active filters</span>
        <button
          type="button"
          onClick={() => onCategoryChange('all')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-surface-2',
            selectedCategory === 'all' && 'opacity-60'
          )}
        >
          {activeCategoryLabel}
          {selectedCategory !== 'all' && <X className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => onWeeknightFilterChange('all')}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/60 px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-surface-2',
            weeknightFilter === 'all' && 'opacity-60'
          )}
        >
          {activeWeeknightLabel}
          {weeknightFilter !== 'all' && <X className="h-3 w-3" />}
        </button>
      </div>
    </div>
  )
}
