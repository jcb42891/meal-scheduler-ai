export type ImportSourceType = 'image' | 'url' | 'text'

export type ParsedIngredient = {
  name: string
  quantity?: number | string
  unit?: string | null
}

export type ParsedRecipe = {
  name: string
  description?: string
  category?: string | null
  weeknightFriendly?: boolean
  ingredients: ParsedIngredient[]
  instructions?: string[]
  warnings?: string[]
  confidence?: number | null
}

export type NormalizedMealIngredient = {
  name: string
  quantity: number
  unit: string
}

export type NormalizedRecipe = {
  name: string
  description: string
  category: string
  weeknightFriendly: boolean
  ingredients: NormalizedMealIngredient[]
  instructions: string[]
  warnings: string[]
  confidence: number | null
}

