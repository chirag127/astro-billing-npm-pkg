// astro-billing/src/api/billing-create-subscription.ts
//
// Astro API route (CF Pages Function compatible). POST endpoint that
// creates a Razorpay subscription and returns the subscription_id +
// public key_id so the browser can open Razorpay Checkout.
//
// Mount: copy into the host app's `src/pages/api/billing-create-subscription.ts`.
//
// Flow (per runbook section 5):
//   1. Verify Firebase ID token from Authorization: Bearer …
//   2. planTier → PLANS[planTier] → real plan_id
//   3. Resolve optional offer_id (server-side gate — v0 returns null)
//   4. rzp.subscriptions.create({ plan_id, customer_notify: 1,
//        total_count: 120, notes: { uid }, offer_id? })
//   5. Return { subscription_id, key_id }

import type { APIRoute } from 'astro'
import { rzp, PLANS, resolveOfferForUser, type PlanTier } from '../lib/razorpay-client.ts'

interface CreateSubBody {
  planTier: PlanTier
}

// Verify Firebase ID token via the public REST endpoint. We keep this
// out of firebase-admin so the route stays edge-runtime friendly. For
// stricter verification, swap this for firebase-admin's verifyIdToken.
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  if (!idToken) return null
  try {
    const apiKey = process.env.PUBLIC_FIREBASE_API_KEY ?? process.env.FIREBASE_API_KEY
    if (!apiKey) return null
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { users?: Array<{ localId: string; email?: string }> }
    const u = data.users?.[0]
    if (!u) return null
    return { uid: u.localId, email: u.email }
  } catch {
    return null
  }
}

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? ''
  const idToken = auth.replace(/^Bearer\s+/i, '')
  const user = await verifyFirebaseToken(idToken)
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: CreateSubBody
  try {
    body = (await request.json()) as CreateSubBody
  } catch {
    return new Response(JSON.stringify({ error: 'bad body' }), { status: 400 })
  }

  const planId = PLANS[body.planTier]
  if (!planId) {
    return new Response(JSON.stringify({ error: 'unknown plan' }), { status: 400 })
  }

  const offerId = resolveOfferForUser(user)

  try {
    const sub = await rzp.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120, // 10 years monthly / billing cycles
      notes: { uid: user.uid, email: user.email ?? '' },
      ...(offerId ? { offer_id: offerId } : {}),
    } as Parameters<typeof rzp.subscriptions.create>[0])

    return new Response(
      JSON.stringify({
        subscription_id: sub.id,
        key_id: process.env.RAZORPAY_KEY_ID,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error('[billing-create-subscription]', err)
    return new Response(JSON.stringify({ error: 'razorpay failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
