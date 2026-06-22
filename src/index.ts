// @chirag127/astro-billing — v0.1.1
//
// Razorpay checkout + Firestore-backed subscription state for the
// oriz family. Single-domain checkout (oriz.in/pricing only) per the
// Razorpay business-website rule.
//
// Exports:
//   • Pricing (Astro component) — 3-tier table with monthly/yearly toggle
//   • CheckoutButton (Astro component) — Razorpay Checkout JS modal opener
//   • FAMILY_TIERS — canonical tier feature list
//   • PLANS / rzp / planIdToTier — server-side Razorpay client helpers
//   • billing-create-subscription / razorpay-webhook — copy-mountable API routes

export const __pkg = '@chirag127/astro-billing' as const

export { FAMILY_TIERS } from './data/tiers.ts'
export type { Tier, TierFeature } from './data/tiers.ts'
export { rzp, PLANS, planIdToTier, resolveOfferForUser } from './lib/razorpay-client.ts'
export type { PlanTier } from './lib/razorpay-client.ts'

// Astro components and API routes are consumed via direct subpath import:
//   import Pricing from '@chirag127/astro-billing/Pricing.astro'
//   import CheckoutButton from '@chirag127/astro-billing/CheckoutButton.astro'
// (or by copying src/api/* into the host app's pages/api tree).
