'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="meal-filter-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </Label>
          <div className="relative">
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
        </div>

        <div className="w-full space-y-2 lg:w-56">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Category
          </Label>
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full space-y-2 lg:w-[320px]">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weeknight friendliness
          </Label>
          <div className="flex flex-wrap gap-2">
            {weeknightOptions.map((option) => {
              const isActive = weeknightFilter === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onWeeknightFilterChange(option.value)}
                  className={cn(
                    'rounded-full border border-border/70 px-3 py-1 text-xs font-semibold transition hover:bg-surface-2/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    isActive
                      ? option.activeClassName ?? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-surface-2/60 text-muted-foreground',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
