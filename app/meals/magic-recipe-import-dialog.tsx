'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconButton } from '@/components/ui/icon-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/contexts/AuthContext'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MEAL_CATEGORIES, MealCategory, WEEKNIGHT_FRIENDLY_LABEL, getCategoryColor, getWeeknightFriendlyColor, getWeeknightNotFriendlyColor } from './meal-utils'
import { Plus, Sparkles, X } from 'lucide-react'

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
}

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

function makeRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatConfidence(confidence: number | null) {
  if (typeof confidence !== 'number') return 'N/A'
  return `${Math.round(confidence * 100)}%`
}

function mergeDescription(description: string, instructionsText: string) {
  const base = description.trim()
  const instructions = instructionsText.trim()
  if (!instructions) return base
  if (!base) return `Instructions:\n${instructions}`
  return `${base}\n\nInstructions:\n${instructions}`
}

export function MagicRecipeImportDialog({ open, onOpenChange, groupId, onMealImported }: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [sourceType, setSourceType] = useState<'image' | 'url' | 'text'>('text')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceImage, setSourceImage] = useState<File | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [parseConfidence, setParseConfidence] = useState<number | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

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
    setSourceType('text')
    setSourceUrl('')
    setSourceText('')
    setSourceImage(null)
    setParseWarnings([])
    setParseConfidence(null)
    setMealName('')
    setDescription('')
    setInstructionsText('')
    setCategory('')
    setWeeknightFriendly(false)
    setEditableIngredients([])
    setIngredientSearchTerm('')
  }, [open])

  const handleParse = async () => {
    if (!groupId) {
      toast.error('Select a group before importing')
      return
    }

    if (sourceType === 'url' && !sourceUrl.trim()) {
      toast.error('Enter a recipe URL')
      return
    }
    if (sourceType === 'text' && !sourceText.trim()) {
      toast.error('Paste recipe text to parse')
      return
    }
    if (sourceType === 'image' && !sourceImage) {
      toast.error('Upload an image to parse')
      return
    }

    setIsParsing(true)
    try {
      const formData = new FormData()
      formData.append('groupId', groupId)
      formData.append('sourceType', sourceType)
      if (sourceType === 'url') formData.append('url', sourceUrl.trim())
      if (sourceType === 'text') formData.append('text', sourceText.trim())
      if (sourceType === 'image' && sourceImage) formData.append('image', sourceImage)

      const response = await fetch('/api/recipe-import/parse', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to parse recipe')
      }

      const data = payload as ParseResponse
      setMealName(data.recipe.name || '')
      setDescription(data.recipe.description || '')
      setCategory(data.recipe.category || '')
      setWeeknightFriendly(Boolean(data.recipe.weeknightFriendly))
      setInstructionsText((data.recipe.instructions || []).join('\n'))
      setParseWarnings(data.recipe.warnings || [])
      setParseConfidence(data.recipe.confidence ?? null)
      setEditableIngredients(
        (data.recipe.ingredients || []).map((ingredient) => ({
          rowId: makeRowId(),
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit || 'unit',
        })),
      )
      setStep('review')
      toast.success('Recipe parsed. Review and save your meal.')
    } catch (error) {
      console.error('Error parsing recipe:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to parse recipe')
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
        name: ingredient.name.trim(),
      }))
      .filter((ingredient) => ingredient.name.length > 0)

    if (cleanedIngredients.length === 0) {
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

      for (const ingredient of cleanedIngredients) {
        const lookup = ingredient.name.toLowerCase()
        let matched = ingredientCache.get(lookup)

        if (!matched) {
          const { data: createdIngredient, error: createIngredientError } = await supabase
            .from('ingredients')
            .insert({ name: ingredient.name })
            .select()
            .single()

          if (createIngredientError) {
            const { data: existingIngredient, error: existingIngredientError } = await supabase
              .from('ingredients')
              .select('*')
              .eq('name', ingredient.name)
              .single()

            if (existingIngredientError || !existingIngredient) {
              throw createIngredientError
            }
            matched = existingIngredient
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
      toast.error('Failed to save imported meal')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-3xl mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Magic Recipe Import
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
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
                    onChange={(event) => setSourceImage(event.target.files?.[0] || null)}
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
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[10px] border border-border/60 bg-surface-2/40 p-3 text-sm">
                <p className="font-medium text-foreground">Parse confidence: {formatConfidence(parseConfidence)}</p>
                {parseWarnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
                    {parseWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>

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
                            className="h-10 w-full rounded-[10px] border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
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
            <Button type="button" onClick={handleParse} disabled={isParsing || !groupId}>
              {isParsing ? 'Parsing...' : 'Parse Recipe'}
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
