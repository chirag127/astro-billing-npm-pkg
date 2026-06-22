// astro-billing/src/data/tiers.ts
//
// FAMILY_TIERS — the canonical 3-tier feature list rendered by
// <Pricing />. Sourced from knowledge/decisions/business/
// pricing-three-tiers.md. Lives in this package so every app that
// embeds <Pricing /> gets the same tier copy.

export interface TierFeature {
  label: string
}

export interface Tier {
  slug: 'free' | 'pro' | 'max'
  name: string
  priceMonthly: number // INR rupees (display) — 0 for Free
  priceYearly: number
  cta: { label: string; href?: string; planMonthly?: 'pro_monthly' | 'max_monthly'; planYearly?: 'pro_yearly' | 'max_yearly' }
  perks: string[]
  highlight?: boolean
}

export const FAMILY_TIERS: Tier[] = [
  {
    slug: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    cta: { label: 'Get started', href: '/sign-in' },
    perks: [
      'Every app, every package',
      'No card required',
      'MIT licensed source',
      'Sign in with Google or email',
    ],
  },
  {
    slug: 'pro',
    name: 'Pro',
    priceMonthly: 99,
    priceYearly: 799,
    highlight: true,
    cta: { label: 'Subscribe', planMonthly: 'pro_monthly', planYearly: 'pro_yearly' },
    perks: [
      'Everything in Free',
      'No ads across every app',
      'Bulk operations (100+ files)',
      'Save presets to your account',
      'Priority issue triage',
    ],
  },
  {
    slug: 'max',
    name: 'Max',
    priceMonthly: 299,
    priceYearly: 2499,
    cta: { label: 'Subscribe', planMonthly: 'max_monthly', planYearly: 'max_yearly' },
    perks: [
      'Everything in Pro',
      'Early access to new apps',
      'Quarterly architecture review',
      'Direct email to maintainer',
      'Supporter badge on /about',
    ],
  },
]
