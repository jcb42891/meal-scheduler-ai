'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconButton } from '@/components/ui/icon-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/contexts/AuthContext'
import { getRecipeImportParseErrorMessage, readRecipeImportErrorPayload } from '@/lib/recipe-import/client-errors'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { notifyBillingStatusUpdated } from '@/lib/billing/client'
import { getMagicImportBillingCtas } from './magic-import-billing-cta'
import { MEAL_CATEGORIES, MealCategory, WEEKNIGHT_FRIENDLY_LABEL, getCategoryColor, getWeeknightFriendlyColor, getWeeknightNotFriendlyColor } from './meal-utils'
import { Loader2, Plus, Sparkles, X } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  onMealImported: () => void
}

type Ingredient = {
  id: string
  name: string
}

type EditableIngredient = {
  rowId: string
  name: string
  quantity: number
  unit: string
}

type ParseResponse = {
  recipe: {
    name: string
    description: string
    category: string
    weeknightFriendly: boolean
    ingredients: Array<{ name: string; quantity: number; unit: string }>
    instructions: string[]
    warnings: string[]
    confidence: number | null
  }
  source?: {
    sourceType: 'image' | 'url' | 'text'
    url?: string | null
  }
  usage?: {
    creditsCharged: number
    creditsRemaining: number
    monthlyCredits: number
    usedCredits: number
    periodStart: string
    planTier: string
  }
}

type BillingStatusResponse = {
  planTier: string
  allowed: boolean
  reasonCode: string | null
  periodStart: string
  monthlyCredits: number
  usedCredits: number
  remainingCredits: number
  requiredCredits: number
  isUnlimited: boolean
  hasActiveSubscription: boolean
  graceActive: boolean
  isEnvOverride: boolean
  sourceCosts: {
    text: number
    url: number
    image: number
  }
  billing: {
    stripeConfigured: boolean
    canManage: boolean
  }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const ALLOWED_UNITS = [
  { value: 'unit', label: 'unit' },
  { value: 'oz', label: 'oz' },
  { value: 'g', label: 'grams' },
  { value: 'kg', label: 'kilograms' },
  { value: 'ml', label: 'milliliters' },
  { value: 'l', label: 'liters' },
  { value: 'tbsp', label: 'tablespoons' },
  { value: 'tsp', label: 'teaspoons' },
  { value: 'cup', label: 'cups' },
] as const

const PARSE_LOADING_MESSAGES = [
  'Teaching the meal wizard new tricks...',
  'Simmering your recipe into structured magic...',
  'Whisking ingredients into neat little rows...',
  'Consulting the spice oracle...',
  'Untangling steps, one noodle at a time...',
  'Converting kitchen chaos into dinner plans...',
  'Sprinkling a little parser pixie dust...',
  'Finding the "pinch of salt" in all that text...',
  'Preheating the import engine...',
]

function makeRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function mergeDescription(description: string, instructionsText: string) {
  const base = description.trim()
  const instructions = instructionsText.trim()
  if (!instructions) return base
  if (!base) return `Instructions:\n${instructions}`
  return `${base}\n\nInstructions:\n${instructions}`
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getRandomParseLoadingMessage() {
  return PARSE_LOADING_MESSAGES[Math.floor(Math.random() * PARSE_LOADING_MESSAGES.length)]
}

function isParseResponse(payload: unknown): payload is ParseResponse {
  if (!payload || typeof payload !== 'object') return false
  const recipe = (payload as { recipe?: unknown }).recipe
  return Boolean(recipe && typeof recipe === 'object')
}

class UserFacingParseError extends Error {}

export function MagicRecipeImportDialog({ open, onOpenChange, groupId, onMealImported }: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [sourceType, setSourceType] = useState<'image' | 'url' | 'text'>('url')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceImage, setSourceImage] = useState<File | null>(null)
  const [parseLoadingMessage, setParseLoadingMessage] = useState(PARSE_LOADING_MESSAGES[0])
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [parseConfidence, setParseConfidence] = useState<number | null>(null)
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null)
  const [isBillingStatusLoading, setIsBillingStatusLoading] = useState(false)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isPortalLoading, setIsPortalLoading] = useState(false)

  const [mealName, setMealName] = useState('')
  const [description, setDescription] = useState('')
  const [instructionsText, setInstructionsText] = useState('')
  const [category, setCategory] = useState('')
  const [weeknightFriendly, setWeeknightFriendly] = useState(false)
  const [editableIngredients, setEditableIngredients] = useState<EditableIngredient[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState('')

  const ingredientNameMap = useMemo(() => {
    const map = new Map<string, Ingredient>()
    for (const ingredient of ingredients) {
      map.set(ingredient.name.trim().toLowerCase(), ingredient)
    }
    return map
  }, [ingredients])

  useEffect(() => {
    if (!open) return
    const fetchIngredients = async () => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name')
      if (error) {
        toast.error('Failed to load ingredients for import')
        return
      }
      setIngredients(data || [])
    }
    fetchIngredients()
  }, [open])

  useEffect(() => {
    if (open) return
    setStep('input')
    setSourceType('url')
    setSourceUrl('')
    setSourceText('')
    setSourceImage(null)
    setMealName('')
    setDescription('')
    setInstructionsText('')
    setCategory('')
    setWeeknightFriendly(false)
    setEditableIngredients([])
    setIngredientSearchTerm('')
    setParseWarnings([])
    setParseConfidence(null)
    setBillingStatus(null)
    setIsBillingStatusLoading(false)
    setIsCheckoutLoading(false)
    setIsPortalLoading(false)
  }, [open])

  const parseConfidencePercent = useMemo(() => {
    if (parseConfidence === null || !Number.isFinite(parseConfidence)) return null
    return Math.round(parseConfidence * 100)
  }, [parseConfidence])

  const validateSourceInput = () => {
    if (sourceType === 'url') {
      const trimmedUrl = sourceUrl.trim()
      if (!trimmedUrl) {
        toast.error('Enter a recipe URL')
        return false
      }

      try {
        const parsed = new URL(trimmedUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          toast.error('Only http/https URLs are supported')
          return false
        }
      } catch {
        toast.error('Enter a valid recipe URL')
        return false
      }
    }

    if (sourceType === 'text' && !sourceText.trim()) {
      toast.error('Paste recipe text to parse')
      return false
    }

    if (sourceType === 'image') {
      if (!sourceImage) {
        toast.error('Upload an image to parse')
        return false
      }

      if (!ALLOWED_IMAGE_TYPES.has(sourceImage.type)) {
        toast.error('Only PNG, JPEG, and WEBP images are supported')
        return false
      }

      if (sourceImage.size > MAX_IMAGE_BYTES) {
        toast.error('Image file exceeds the 8MB upload limit')
        return false
      }
    }

    return true
  }

  const fetchBillingStatus = useCallback(async () => {
    if (!open) return

    setIsBillingStatusLoading(true)
    try {
      const query = new URLSearchParams({
        sourceType,
      })
      const response = await fetch(`/api/billing/status?${query.toString()}`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error('Unable to load import quota.')
      }

      const payload = (await response.json()) as BillingStatusResponse
      setBillingStatus(payload)
    } catch {
      setBillingStatus(null)
    } finally {
      setIsBillingStatusLoading(false)
    }
  }, [open, sourceType])

  useEffect(() => {
    fetchBillingStatus()
  }, [fetchBillingStatus])

  const startBillingRedirect = async (path: '/api/billing/checkout' | '/api/billing/portal') => {
    const setLoading = path === '/api/billing/checkout' ? setIsCheckoutLoading : setIsPortalLoading
    setLoading(true)
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'Unable to open billing.'
        throw new Error(message)
      }

      const url = payload && typeof payload.url === 'string' ? payload.url : ''
      if (!url) {
        throw new Error('Billing redirect URL is missing.')
      }

      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open billing.')
    } finally {
      setLoading(false)
    }
  }

  const handleParse = async () => {
    if (!groupId) {
      toast.error('Select a group before importing')
      return
    }

    if (billingStatus && !billingStatus.allowed && !billingStatus.isUnlimited) {
      toast.error('Your account is out of Magic Import credits. Upgrade to continue importing.')
      return
    }

    if (!validateSourceInput()) {
      return
    }

    setParseLoadingMessage(getRandomParseLoadingMessage())
    setIsParsing(true)
    try {
      const formData = new FormData()
      formData.append('groupId', groupId)
      formData.append('sourceType', sourceType)
      if (sourceType === 'url') formData.append('url', sourceUrl.trim())
      if (sourceType === 'text') formData.append('text', sourceText.trim())
      if (sourceType === 'image' && sourceImage) formData.append('image', sourceImage)

      let response: Response
      try {
        response = await fetch('/api/recipe-import/parse', {
          method: 'POST',
          body: formData,
        })
      } catch {
        throw new UserFacingParseError('Unable to reach recipe import. Check your connection and try again.')
      }

      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (!response.ok) {
        const { code, retryAfterSeconds } = readRecipeImportErrorPayload(payload)
        throw new UserFacingParseError(
          getRecipeImportParseErrorMessage({
            status: response.status,
            code,
            retryAfterSeconds,
          }),
        )
      }

      if (!isParseResponse(payload)) {
        throw new UserFacingParseError('Recipe import returned an unexpected response. Please try again.')
      }

      const data = payload
      setMealName(data.recipe.name || '')
      setDescription(data.recipe.description || '')
      setCategory(data.recipe.category || '')
      setWeeknightFriendly(Boolean(data.recipe.weeknightFriendly))
      setInstructionsText((data.recipe.instructions || []).join('\n'))
      setEditableIngredients(
        (data.recipe.ingredients || []).map((ingredient) => ({
          rowId: makeRowId(),
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit || 'unit',
        })),
      )
      setParseWarnings(data.recipe.warnings || [])
      setParseConfidence(data.recipe.confidence ?? null)
      if (data.usage) {
        setBillingStatus((prev) =>
          prev
            ? {
                ...prev,
                planTier: data.usage?.planTier ?? prev.planTier,
                monthlyCredits: data.usage?.monthlyCredits ?? prev.monthlyCredits,
                usedCredits: data.usage?.usedCredits ?? prev.usedCredits,
                remainingCredits: data.usage?.creditsRemaining ?? prev.remainingCredits,
              }
            : prev,
        )
      } else {
        fetchBillingStatus()
      }
      notifyBillingStatusUpdated(groupId)
      setStep('review')
      toast.success('Recipe parsed. Review and save your meal.')
    } catch (error) {
      console.error('Error parsing recipe:', error)
      const message =
        error instanceof UserFacingParseError
          ? error.message
          : 'We could not import that recipe right now. Please try again.'
      toast.error(message)
    } finally {
      setIsParsing(false)
    }
  }

  const handleAddIngredient = () => {
    const name = ingredientSearchTerm.trim()
    if (!name) return
    setEditableIngredients((prev) => [...prev, { rowId: makeRowId(), name, quantity: 1, unit: 'unit' }])
    setIngredientSearchTerm('')
  }

  const handleSave = async () => {
    if (!user || !groupId) {
      toast.error('Missing user or group context')
      return
    }
    if (!mealName.trim()) {
      toast.error('Meal name is required')
      return
    }

    const cleanedIngredients = editableIngredients
      .map((ingredient) => ({
        ...ingredient,
        name: toTitleCase(ingredient.name.trim()),
      }))
      .filter((ingredient) => ingredient.name.length > 0)

    const consolidatedIngredients = Array.from(
      cleanedIngredients.reduce(
        (acc, ingredient) => {
          const key = ingredient.name.toLowerCase()
          const existing = acc.get(key)
          if (!existing) {
            acc.set(key, {
              name: ingredient.name,
              quantity: ingredient.quantity > 0 ? ingredient.quantity : 1,
              unit: ingredient.unit || 'unit',
            })
            return acc
          }

          existing.quantity += ingredient.quantity > 0 ? ingredient.quantity : 1
          return acc
        },
        new Map<string, { name: string; quantity: number; unit: string }>(),
      ).values(),
    )

    if (consolidatedIngredients.length === 0) {
      toast.error('At least one ingredient is required')
      return
    }

    setIsSaving(true)
    try {
      const descriptionValue = mergeDescription(description, instructionsText)
      const { data: meal, error: mealError } = await supabase
        .from('meals')
        .insert({
          name: mealName.trim(),
          description: descriptionValue,
          category,
          weeknight_friendly: weeknightFriendly,
          group_id: groupId,
          created_by: user.id,
        })
        .select()
        .single()

      if (mealError) throw mealError

      const mealIngredientRows: Array<{ meal_id: string; ingredient_id: string; quantity: number; unit: string }> = []
      const ingredientCache = new Map(ingredientNameMap)

      for (const ingredient of consolidatedIngredients) {
        const lookup = ingredient.name.toLowerCase()
        let matched = ingredientCache.get(lookup)

        if (!matched) {
          const { data: createdIngredient, error: createIngredientError } = await supabase
            .from('ingredients')
            .insert({ name: ingredient.name })
            .select()
            .single()

          if (createIngredientError) {
            const { data: existingIngredients, error: existingIngredientError } = await supabase
              .from('ingredients')
              .select('*')
              .ilike('name', ingredient.name)
              .limit(1)

            if (existingIngredientError || !existingIngredients?.[0]) {
              throw createIngredientError
            }
            matched = existingIngredients[0]
          } else {
            matched = createdIngredient
            setIngredients((prev) => [...prev, createdIngredient])
          }

          if (!matched) {
            throw new Error(`Failed to resolve ingredient "${ingredient.name}"`)
          }

          ingredientCache.set(lookup, matched)
        }

        mealIngredientRows.push({
          meal_id: meal.id,
          ingredient_id: matched.id,
          quantity: ingredient.quantity > 0 ? ingredient.quantity : 1,
          unit: ingredient.unit || 'unit',
        })
      }

      const { error: mealIngredientsError } = await supabase.from('meal_ingredients').insert(mealIngredientRows)
      if (mealIngredientsError) throw mealIngredientsError

      toast.success('Meal imported successfully')
      onMealImported()
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving imported meal:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save imported meal')
    } finally {
      setIsSaving(false)
    }
  }

  const isImportBlocked = Boolean(billingStatus && !billingStatus.allowed && !billingStatus.isUnlimited)
  const currentSourceCost = billingStatus?.sourceCosts[sourceType] ?? null
  const billingCtas = getMagicImportBillingCtas(billingStatus)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-3xl mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Magic Recipe Import
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-visible px-1">
          {step === 'input' ? (
            <div className="space-y-4">
              <Tabs value={sourceType} onValueChange={(value) => setSourceType(value as 'image' | 'url' | 'text')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="image">Screenshot</TabsTrigger>
                  <TabsTrigger value="url">Recipe URL</TabsTrigger>
                  <TabsTrigger value="text">Raw Text</TabsTrigger>
                </TabsList>

                <TabsContent value="image" className="space-y-2">
                  <Label htmlFor="recipe-image">Recipe screenshot</Label>
                  <Input
                    id="recipe-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      if (!file) {
                        setSourceImage(null)
                        return
                      }
                      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
                        toast.error('Only PNG, JPEG, and WEBP images are supported')
                        event.currentTarget.value = ''
                        setSourceImage(null)
                        return
                      }
                      if (file.size > MAX_IMAGE_BYTES) {
                        toast.error('Image file exceeds the 8MB upload limit')
                        event.currentTarget.value = ''
                        setSourceImage(null)
                        return
                      }
                      setSourceImage(file)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Supported: PNG, JPEG, WEBP (up to 8MB)</p>
                </TabsContent>

                <TabsContent value="url" className="space-y-2">
                  <Label htmlFor="recipe-url">Recipe URL</Label>
                  <Input
                    id="recipe-url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://example.com/recipe"
                  />
                </TabsContent>

                <TabsContent value="text" className="space-y-2">
                  <Label htmlFor="recipe-text">Recipe text</Label>
                  <Textarea
                    id="recipe-text"
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    rows={12}
                    placeholder="Paste ingredients and instructions..."
                  />
                </TabsContent>
              </Tabs>

              <div className="rounded-[10px] border border-border/60 bg-surface-2/40 p-3 text-sm">
                {isBillingStatusLoading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading Magic Import credits...
                  </p>
                ) : billingStatus ? (
                  <div className="space-y-2">
                    <p className="font-medium">
                      {billingStatus.remainingCredits} of {billingStatus.monthlyCredits} credits left this month
                      {currentSourceCost !== null ? ` - ${currentSourceCost} credit${currentSourceCost === 1 ? '' : 's'} for this import` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Plan: {billingStatus.planTier}
                      {billingStatus.graceActive ? ' (grace window active)' : ''}
                    </p>
                    {billingStatus.isEnvOverride && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        Developer override active for your user. Credits are not charged while this override is enabled.
                      </p>
                    )}
                    {(billingCtas.showBlockedNotice || billingCtas.showUpgrade || billingCtas.showManage) && (
                      <div className="space-y-2 rounded-[8px] border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-950 dark:text-amber-100">
                        {billingCtas.showBlockedNotice ? (
                          <p>Magic Import credits are exhausted for your account.</p>
                        ) : (
                          <p>Upgrade to Pro for more monthly Magic Import credits.</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {billingCtas.showUpgrade && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => startBillingRedirect('/api/billing/checkout')}
                              disabled={isCheckoutLoading}
                            >
                              {isCheckoutLoading ? 'Opening Stripe...' : 'Upgrade with Stripe'}
                            </Button>
                          )}
                          {billingCtas.showManage && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => startBillingRedirect('/api/billing/portal')}
                              disabled={isPortalLoading}
                            >
                              {isPortalLoading ? 'Opening portal...' : 'Manage billing'}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Unable to load Magic Import quota right now.</p>
                )}
              </div>

              <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
                Imported URL/text/image content is sent to an external AI provider to extract recipe fields. Do not import sensitive personal data.
              </div>

              {isParsing && (
                <div className="rounded-[10px] border border-border/60 bg-surface-2/40 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {parseLoadingMessage}
                  </p>
                  <p className="mt-1 text-muted-foreground">This can take up to 15 seconds for complex recipes.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(parseWarnings.length > 0 || parseConfidencePercent !== null) && (
                <div className="space-y-2">
                  {parseConfidencePercent !== null && (
                    <div className="rounded-[10px] border border-border/60 bg-surface-2/40 p-3 text-sm">
                      Parse confidence: {parseConfidencePercent}%
                    </div>
                  )}
                  {parseWarnings.length > 0 && (
                    <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
                      <p className="font-medium">Review notes</p>
                      <ul className="mt-1 list-disc pl-5">
                        {parseWarnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="import-name">Meal name</Label>
                <Input id="import-name" value={mealName} onChange={(event) => setMealName(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(MEAL_CATEGORIES).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        category === cat
                          ? getCategoryColor(cat as MealCategory)
                          : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80',
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Weeknight friendly</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWeeknightFriendly(true)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      weeknightFriendly
                        ? getWeeknightFriendlyColor()
                        : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80',
                    )}
                  >
                    {WEEKNIGHT_FRIENDLY_LABEL}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeeknightFriendly(false)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      !weeknightFriendly
                        ? getWeeknightNotFriendlyColor()
                        : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80',
                    )}
                  >
                    Not weeknight friendly
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-description">Description</Label>
                <Textarea
                  id="import-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-instructions">Instructions</Label>
                <Textarea
                  id="import-instructions"
                  value={instructionsText}
                  onChange={(event) => setInstructionsText(event.target.value)}
                  rows={8}
                />
              </div>

              <div className="space-y-3">
                <Label>Ingredients</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={ingredientSearchTerm}
                    onChange={(event) => setIngredientSearchTerm(event.target.value)}
                    placeholder="Add ingredient"
                  />
                  <Button type="button" onClick={handleAddIngredient} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                <div className="space-y-2">
                  {editableIngredients.map((ingredient, index) => (
                    <div
                      key={ingredient.rowId}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-[10px] border border-border/60 bg-card p-2"
                    >
                      <Input
                        value={ingredient.name}
                        onChange={(event) => {
                          const next = [...editableIngredients]
                          next[index].name = event.target.value
                          setEditableIngredients(next)
                        }}
                        className="flex-1"
                        placeholder="Ingredient name"
                      />
                      <div className="flex w-full sm:w-auto gap-2 items-end">
                        <div className="w-24">
                          <Label className="text-xs" htmlFor={`qty-${ingredient.rowId}`}>
                            Quantity
                          </Label>
                          <Input
                            id={`qty-${ingredient.rowId}`}
                            type="number"
                            min="0"
                            step="0.1"
                            value={ingredient.quantity || ''}
                            onChange={(event) => {
                              const next = [...editableIngredients]
                              next[index].quantity = event.target.value === '' ? 0 : parseFloat(event.target.value)
                              setEditableIngredients(next)
                            }}
                          />
                        </div>
                        <div className="w-28">
                          <Label className="text-xs" htmlFor={`unit-${ingredient.rowId}`}>
                            Unit
                          </Label>
                          <select
                            id={`unit-${ingredient.rowId}`}
                            value={ingredient.unit}
                            onChange={(event) => {
                              const next = [...editableIngredients]
                              next[index].unit = event.target.value
                              setEditableIngredients(next)
                            }}
                            className="box-border h-10 w-full appearance-none rounded-[10px] border border-solid border-input bg-card px-3 text-sm shadow-sm [background-clip:padding-box] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                          >
                            {ALLOWED_UNITS.map((unit) => (
                              <option key={unit.value} value={unit.value}>
                                {unit.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <IconButton
                          aria-label={`Remove ${ingredient.name}`}
                          variant="destructive"
                          onClick={() =>
                            setEditableIngredients((prev) => prev.filter((_, ingredientIndex) => ingredientIndex !== index))
                          }
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t mt-4">
          {step === 'review' && (
            <Button type="button" variant="outline" onClick={() => setStep('input')} disabled={isSaving}>
              Back to input
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isParsing || isSaving}>
            Cancel
          </Button>
          {step === 'input' ? (
            <Button
              type="button"
              onClick={handleParse}
              disabled={isParsing || !groupId || isImportBlocked || isBillingStatusLoading}
            >
              {isParsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Import
                </>
              )}
            </Button>
          ) : (
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Meal'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

