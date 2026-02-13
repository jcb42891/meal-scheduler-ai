'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Copy, Download, Mail } from 'lucide-react'

type IngredientTotal = {
  key: string
  name: string
  total: number
  unit: string
}

type StapleListItem = IngredientTotal & {
  category: string | null
}

type MealIngredient = {
  quantity: number
  unit: string
  ingredient: {
    name: string
  }
}

type MealCalendarEntry = {
  meal: {
    meal_ingredients: MealIngredient[]
  } | null
}

type MealIngredientEntry = {
  meal_ingredients: MealIngredient[]
}

type StapleIngredient = {
  id: string
  name: string
  category: string | null
  quantity: number
  unit: string
}

const STEP_LABELS = ['Meal ingredients', 'Staple ingredients', 'Final list'] as const

const makeKey = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`

const QUARTER_FRACTIONS: Record<number, string> = {
  1: '1/4',
  2: '1/2',
  3: '3/4',
}

const formatQuantityToQuarter = (quantity: number) => {
  if (!Number.isFinite(quantity)) return '0'

  const quarterUnits = Math.round(quantity * 4)
  const sign = quarterUnits < 0 ? '-' : ''
  const absoluteQuarterUnits = Math.abs(quarterUnits)
  const whole = Math.floor(absoluteQuarterUnits / 4)
  const remainder = absoluteQuarterUnits % 4

  if (remainder === 0) {
    return `${sign}${whole}`
  }

  const fraction = QUARTER_FRACTIONS[remainder]
  return whole === 0 ? `${sign}${fraction}` : `${sign}${whole} ${fraction}`
}

const formatQuantityWithUnit = (quantity: number, unit: string) =>
  `${formatQuantityToQuarter(quantity)} ${unit || 'unit'}`

export function GroceryListClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0)
  const [mealItems, setMealItems] = useState<IngredientTotal[]>([])
  const [stapleItems, setStapleItems] = useState<StapleListItem[]>([])
  const [selectedMealKeys, setSelectedMealKeys] = useState<Set<string>>(new Set())
  const [selectedStapleKeys, setSelectedStapleKeys] = useState<Set<string>>(new Set())
  const [loadingMeals, setLoadingMeals] = useState(true)
  const [loadingStaples, setLoadingStaples] = useState(true)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  const source = searchParams.get('source') === 'meals' ? 'meals' : 'calendar'
  const groupId = searchParams.get('groupId') || ''
  const start = searchParams.get('start') || ''
  const end = searchParams.get('end') || ''
  const mealIdsParam = searchParams.get('mealIds') || ''
  const mealIds = useMemo(
    () =>
      Array.from(
        new Set(
          mealIdsParam
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ),
    [mealIdsParam],
  )

  const listContextLabel =
    source === 'calendar'
      ? `${start} to ${end}`
      : `${mealIds.length} selected meal${mealIds.length === 1 ? '' : 's'}`

  useEffect(() => {
    const hasValidCalendarParams = source === 'calendar' && !!start && !!end
    const hasValidMealParams = source === 'meals' && mealIds.length > 0
    if (!groupId || (!hasValidCalendarParams && !hasValidMealParams)) {
      toast.error('Missing grocery list details.')
      router.replace(source === 'meals' ? '/meals' : '/calendar')
    }
  }, [groupId, source, start, end, mealIds.length, router])

  useEffect(() => {
    if (!groupId) return
    if (source === 'calendar' && (!start || !end)) return
    if (source === 'meals' && mealIds.length === 0) return

    const fetchMealIngredients = async () => {
      setLoadingMeals(true)
      try {
        const totals: Record<string, IngredientTotal> = {}

        if (source === 'calendar') {
          const { data, error } = await supabase
            .from('meal_calendar')
            .select(`
              meal:meals(
                meal_ingredients(
                  quantity,
                  unit,
                  ingredient:ingredients(name)
                )
              )
            `)
            .eq('group_id', groupId)
            .gte('date', start)
            .lte('date', end)
            .returns<MealCalendarEntry[]>()

          if (error) throw error

          data.forEach((entry) => {
            if (!entry.meal) return
            entry.meal.meal_ingredients.forEach((mi) => {
              const key = makeKey(mi.ingredient.name, mi.unit)
              if (!totals[key]) {
                totals[key] = {
                  key,
                  name: mi.ingredient.name,
                  total: 0,
                  unit: mi.unit,
                }
              }
              totals[key].total += mi.quantity
            })
          })
        } else {
          const { data, error } = await supabase
            .from('meals')
            .select(`
              meal_ingredients(
                quantity,
                unit,
                ingredient:ingredients(name)
              )
            `)
            .eq('group_id', groupId)
            .in('id', mealIds)
            .returns<MealIngredientEntry[]>()

          if (error) throw error

          data.forEach((meal) => {
            meal.meal_ingredients.forEach((mi) => {
              const key = makeKey(mi.ingredient.name, mi.unit)
              if (!totals[key]) {
                totals[key] = {
                  key,
                  name: mi.ingredient.name,
                  total: 0,
                  unit: mi.unit,
                }
              }
              totals[key].total += mi.quantity
            })
          })
        }

        const items = Object.values(totals).sort((a, b) => a.name.localeCompare(b.name))
        setMealItems(items)
        setSelectedMealKeys(new Set(items.map((item) => item.key)))
      } catch (error) {
        console.error('Error fetching meal ingredients:', error)
        toast.error('Failed to load meal ingredients')
      } finally {
        setLoadingMeals(false)
      }
    }

    const fetchStapleIngredients = async () => {
      setLoadingStaples(true)
      try {
        const { data, error } = await supabase
          .from('staple_ingredients')
          .select('id, name, category, quantity, unit')
          .eq('group_id', groupId)
          .order('name')
          .returns<StapleIngredient[]>()

        if (error) throw error

        const items = (data || []).map((staple) => ({
          key: makeKey(staple.name, staple.unit),
          name: staple.name,
          total: staple.quantity,
          unit: staple.unit,
          category: staple.category,
        }))
        setStapleItems(items)
        setSelectedStapleKeys(new Set())
      } catch (error) {
        console.error('Error fetching staple ingredients:', error)
        toast.error('Failed to load staple ingredients')
      } finally {
        setLoadingStaples(false)
      }
    }

    fetchMealIngredients()
    fetchStapleIngredients()
  }, [groupId, source, start, end, mealIds, mealIdsParam])

  const combinedItems = useMemo(() => {
    const combined: Record<string, IngredientTotal> = {}

    mealItems.forEach((item) => {
      if (!selectedMealKeys.has(item.key)) return
      combined[item.key] = { ...item }
    })

    stapleItems.forEach((item) => {
      if (!selectedStapleKeys.has(item.key)) return
      if (combined[item.key]) {
        combined[item.key].total += item.total
      } else {
        combined[item.key] = { ...item }
      }
    })

    return Object.values(combined).sort((a, b) => a.name.localeCompare(b.name))
  }, [mealItems, stapleItems, selectedMealKeys, selectedStapleKeys])

  const handleToggle = (key: string, type: 'meal' | 'staple') => {
    if (type === 'meal') {
      setSelectedMealKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      return
    }

    setSelectedStapleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const copyToClipboard = () => {
    const text = combinedItems
      .map((item) => `${item.name}: ${formatQuantityWithUnit(item.total, item.unit)}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const handlePrint = () => {
    window.print()
  }

  const emailToSelf = async () => {
    if (combinedItems.length === 0) {
      toast.error('No grocery list items to email.')
      return
    }

    setIsSendingEmail(true)
    try {
      const response = await fetch('/api/grocery-list/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listContextLabel,
          items: combinedItems.map(({ name, total, unit }) => ({ name, total, unit })),
        }),
      })

      let payload: { error?: string } | null = null
      try {
        payload = (await response.json()) as { error?: string }
      } catch {
        payload = null
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send grocery list email.')
      }

      toast.success('Grocery list email sent.')
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to send grocery list email.'
      toast.error(message)
    } finally {
      setIsSendingEmail(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Grocery list builder</p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Finalize your list</h1>
            </div>
            <Chip className="text-xs">{listContextLabel}</Chip>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {STEP_LABELS.map((label, index) => (
                <span key={label} className={index === step ? 'text-foreground font-medium' : ''}>
                  {label}
                </span>
              ))}
            </div>
            <div className="h-2 w-full rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <Card>
          <CardHeader className="space-y-1">
            <h2 className="text-lg font-semibold">{STEP_LABELS[step]}</h2>
            <p className="text-sm text-muted-foreground">
              {step === 0 && 'Review meal ingredients and uncheck anything you already have.'}
              {step === 1 && 'Select any staple ingredients that you need.'}
              {step === 2 && 'Your final list is ready to copy, download, or email.'}
            </p>
          </CardHeader>
          <CardContent>
            {step === 0 && (
              <div className="space-y-3">
                {loadingMeals ? (
                  <p className="text-sm text-muted-foreground">Loading meal ingredients...</p>
                ) : mealItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {source === 'calendar'
                      ? 'No meal ingredients were found for this range.'
                      : 'No meal ingredients were found for the selected meals.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {mealItems.map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedMealKeys.has(item.key)}
                            onChange={() => handleToggle(item.key, 'meal')}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {formatQuantityWithUnit(item.total, item.unit)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                {loadingStaples ? (
                  <p className="text-sm text-muted-foreground">Loading staple ingredients...</p>
                ) : stapleItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No staple ingredients have been added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {stapleItems.map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedStapleKeys.has(item.key)}
                            onChange={() => handleToggle(item.key, 'staple')}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm font-medium">{item.name}</span>
                          {item.category && <Chip className="text-xs">{item.category}</Chip>}
                        </div>
                        <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {formatQuantityWithUnit(item.total, item.unit)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {combinedItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items selected.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={copyToClipboard} variant="secondary">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </Button>
                      <Button onClick={handlePrint} variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </Button>
                      <Button onClick={emailToSelf} variant="outline" disabled={isSendingEmail}>
                        <Mail className="h-4 w-4 mr-2" />
                        {isSendingEmail ? 'Sending...' : 'Email to Yourself'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {combinedItems.map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3"
                        >
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                            {formatQuantityWithUnit(item.total, item.unit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < STEP_LABELS.length - 1 && (
            <Button onClick={() => setStep((prev) => Math.min(STEP_LABELS.length - 1, prev + 1))}>
              {step === STEP_LABELS.length - 2 ? 'Generate Final List' : 'Next'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
