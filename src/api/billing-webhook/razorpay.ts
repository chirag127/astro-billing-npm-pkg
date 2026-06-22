// astro-billing/src/api/billing-webhook/razorpay.ts
//
// CF Pages Function that receives Razorpay webhook POSTs, verifies
// the HMAC SHA256 signature, and writes the subscription state to
// Firestore. Per runbook section 6.
//
// Mount: copy to host app's `src/pages/api/billing-webhook/razorpay.ts`.
//
// Required env:
//   RAZORPAY_WEBHOOK_SECRET   — shared secret with Razorpay dashboard
//   FIREBASE_SERVICE_ACCOUNT_JSON — full JSON of a service account key
//
// Events handled (per runbook step 3):
//   subscription.activated  → tier active, set period_end
//   subscription.charged    → renew period_end (recurring charge ok)
//   subscription.cancelled  → status: cancelled
//   subscription.halted     → status: grace_period
//   subscription.expired    → status: expired
//   payment.failed          → status: grace_period (first-charge fail)
//   (subscription.updated / pending / completed) → log only
//
// Idempotency: processed_events/{event.id} doc prevents re-execution
// on Razorpay re-delivery.

import type { APIRoute } from 'astro'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { planIdToTier } from '../../lib/razorpay-client.ts'

// Lazy firebase-admin init — keeps cold start minimal for non-webhook
// routes and works in both Node and CF Pages Functions runtimes.
let _adminApp: unknown
let _adminDb: unknown

async function getFirestore(): Promise<any> {
  if (_adminDb) return _adminDb
  const admin = await import('firebase-admin')
  const { initializeApp, getApps, cert } = admin
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing')
  const credentials = JSON.parse(json)
  if (getApps().length === 0) {
    _adminApp = initializeApp({ credential: cert(credentials) })
  }
  const { getFirestore: gf } = await import('firebase-admin/firestore')
  _adminDb = gf()
  return _adminDb
}

function verifySignature(body: string, sig: string, secret: string): boolean {
  if (!sig || !secret) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface RzpEvent {
  event: string
  // every Razorpay webhook payload carries a unique id at the top level
  id?: string
  payload: {
    subscription?: { entity: any }
    payment?: { entity: any }
  }
  created_at?: number
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text()
  const sig = request.headers.get('x-razorpay-signature') ?? ''
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

  if (!verifySignature(body, sig, secret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let event: RzpEvent
  try {
    event = JSON.parse(body) as RzpEvent
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  // Razorpay event re-delivery — short-circuit on duplicate.
  // We derive an id from event.id, or fall back to "<event>:<sub_id>:<created_at>".
  const eventId =
    event.id ??
    [event.event, event.payload?.subscription?.entity?.id, event.created_at]
      .filter(Boolean)
      .join(':')

  const db = await getFirestore()
  const evRef = db.collection('processed_events').doc(eventId)
  const evSnap = await evRef.get()
  if (evSnap.exists) return new Response('OK (duplicate)', { status: 200 })

  const sub = event.payload?.subscription?.entity
  const payment = event.payload?.payment?.entity
  const uid: string | undefined = sub?.notes?.uid ?? payment?.notes?.uid

  // No uid → can't map. Log + ack so Razorpay stops retrying.
  if (!uid) {
    await evRef.set({ event: event.event, at: Date.now(), note: 'no-uid' })
    return new Response('OK (no uid)', { status: 200 })
  }

  const subDoc = db.collection('users').doc(uid).collection('subscriptions').doc('razorpay')

  const tierInfo = sub?.plan_id ? planIdToTier(sub.plan_id) : null

  const baseUpdate = {
    subscription_id: sub?.id ?? null,
    plan_id: sub?.plan_id ?? null,
    tier: tierInfo?.tier ?? null,
    interval: tierInfo?.interval ?? null,
    current_period_end: sub?.current_end ?? null,
    updated_at: Date.now(),
  }

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.updated':
      await subDoc.set({ ...baseUpdate, status: 'active' }, { merge: true })
      break
    case 'subscription.cancelled':
      await subDoc.set({ ...baseUpdate, status: 'cancelled' }, { merge: true })
      break
    case 'subscription.halted':
    case 'payment.failed':
      await subDoc.set({ ...baseUpdate, status: 'grace_period' }, { merge: true })
      break
    case 'subscription.expired':
    case 'subscription.completed':
      await subDoc.set({ ...baseUpdate, status: 'expired' }, { merge: true })
      break
    case 'subscription.pending':
      await subDoc.set({ ...baseUpdate, status: 'pending' }, { merge: true })
      break
    default:
      // Unknown event — log and ack.
      break
  }

  await evRef.set({ event: event.event, uid, at: Date.now() })
  return new Response('OK', { status: 200 })
}
