export const STAPLE_UNITS = [
  'unit',
  'oz',
  'g',
  'kg',
  'ml',
  'l',
  'tbsp',
  'tsp',
  'cup',
] as const

export type StapleUnit = (typeof STAPLE_UNITS)[number]
