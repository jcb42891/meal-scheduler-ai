export const MEAL_CATEGORIES = {
  POULTRY: 'Poultry',
  BEEF: 'Beef',
  PORK: 'Pork',
  FISH: 'Fish',
  VEGETARIAN: 'Vegetarian'
} as const

export type MealCategory = typeof MEAL_CATEGORIES[keyof typeof MEAL_CATEGORIES]

export const WEEKNIGHT_FRIENDLY_LABEL = 'Weeknight friendly'

export const getWeeknightFriendlyColor = () => 'bg-emerald-100 text-emerald-800'
export const getWeeknightNotFriendlyColor = () => 'bg-slate-100 text-slate-700'

export const getCategoryColor = (category: MealCategory) => {
  switch (category) {
    case MEAL_CATEGORIES.POULTRY:
      return 'bg-amber-100 text-amber-800'
    case MEAL_CATEGORIES.BEEF:
      return 'bg-red-100 text-red-900'
    case MEAL_CATEGORIES.PORK:
      return 'bg-orange-100 text-orange-800'
    case MEAL_CATEGORIES.FISH:
      return 'bg-blue-100 text-blue-800'
    case MEAL_CATEGORIES.VEGETARIAN:
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
} 
