import { Suspense } from 'react'
import { GroceryListClient } from './page.client'

export default function GroceryListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-16 h-16 rounded-full animate-pulse bg-surface-2" />
        </div>
      }
    >
      <GroceryListClient />
    </Suspense>
  )
}
