import { z } from 'zod'

export const importSourceTypeSchema = z.enum(['image', 'url', 'text'])

export const parsedIngredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.union([z.number(), z.string().trim()]).optional(),
  unit: z.string().trim().optional().nullable(),
})

export const parsedRecipeSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default(''),
  category: z.string().optional().nullable(),
  weeknightFriendly: z.boolean().optional().default(false),
  ingredients: z.array(parsedIngredientSchema).min(1),
  instructions: z.array(z.string().trim().min(1)).optional().default([]),
  warnings: z.array(z.string().trim().min(1)).optional().default([]),
  confidence: z.number().min(0).max(1).optional().nullable(),
})

export const parseRequestJsonSchema = z.object({
  groupId: z.string().uuid(),
  sourceType: importSourceTypeSchema,
  url: z.string().trim().url().optional(),
  text: z.string().trim().optional(),
})

