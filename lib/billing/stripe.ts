import 'server-only'

import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not set.')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(apiKey)
  }

  return stripeClient
}
