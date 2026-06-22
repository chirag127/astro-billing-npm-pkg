// astro-billing/src/lib/razorpay-client.ts
//
// Thin singleton wrapper over the Razorpay Node SDK. Reads
// RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET from process.env at
// instantiation time (Cloudflare Pages Functions bind these as env
// at runtime; on a local Node dev server they come from .env).
//
// PLANS table maps our internal tier slug ("pro_monthly" etc.) to the
// Razorpay plan_id env var. Per the runbook, plan IDs differ between
// TEST and LIVE — the env-var indirection keeps the code mode-agnostic.
//
// See knowledge/runbooks/razorpay-end-to-end-setup.md section 5.

import Razorpay from 'razorpay'

let _rzp: Razorpay | null = null
function getRzp(): Razorpay {
  if (_rzp) return _rzp
  _rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? '',
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
  })
  return _rzp
}

// Proxy preserves the original `rzp.subscriptions.create(…)` call shape
// while deferring construction until first use (so module import is
// safe in test envs and at build time when env vars aren't set).
export const rzp = new Proxy({} as Razorpay, {
  get(_, prop) {
    return (getRzp() as unknown as Record<PropertyKey, unknown>)[prop]
  },
})

export type PlanTier = 'pro_monthly' | 'pro_yearly' | 'max_monthly' | 'max_yearly'

export const PLANS: Record<PlanTier, string | undefined> = {
  pro_monthly: process.env.RAZORPAY_PLAN_PRO_MONTHLY,
  pro_yearly: process.env.RAZORPAY_PLAN_PRO_YEARLY,
  max_monthly: process.env.RAZORPAY_PLAN_MAX_MONTHLY,
  max_yearly: process.env.RAZORPAY_PLAN_MAX_YEARLY,
}

// Map plan_id (resolved at runtime) back to { tier, interval } for the
// webhook handler. Used in billing-webhook/razorpay.ts.
export function planIdToTier(planId: string): { tier: 'pro' | 'max'; interval: 'monthly' | 'yearly' } | null {
  if (planId === PLANS.pro_monthly) return { tier: 'pro', interval: 'monthly' }
  if (planId === PLANS.pro_yearly) return { tier: 'pro', interval: 'yearly' }
  if (planId === PLANS.max_monthly) return { tier: 'max', interval: 'monthly' }
  if (planId === PLANS.max_yearly) return { tier: 'max', interval: 'yearly' }
  return null
}

// v0 offer-gating: hardcoded empty list. Promo codes (FOUNDER50,
// STUDENT50, etc.) ship later. The shape is here so callers don't
// need to be rewritten when offers go live — just populate this map
// from env vars and add the email/student-pack predicate.
export const OFFERS: Record<string, string | undefined> = {
  // founder50: process.env.RAZORPAY_OFFER_FOUNDER50,
  // student50: process.env.RAZORPAY_OFFER_STUDENT50,
}

/**
 * Server-side gate: given a user, return the offer_id (if any) to
 * attach to their subscription.create() call. v0 returns null for
 * everyone; promo codes ship later.
 */
export function resolveOfferForUser(_user: { uid: string; email?: string }): string | null {
  return null
}
