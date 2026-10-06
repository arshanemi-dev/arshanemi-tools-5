import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { dummySubscription, dummyPlans } from '@/data/dummySubscription'
import { env } from '@/lib/env'

// ── Helpers ──────────────────────────────────────────────────────────────────

function razorpay() {
  const keyId     = env.RAZORPAY_KEY_ID
  const keySecret = env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return null
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  return {
    async get(path) {
      const r = await fetch(`https://api.razorpay.com/v1${path}`, {
        headers: { Authorization: `Basic ${auth}` },
      })
      return r.ok ? r.json() : null
    },
  }
}

async function getSubscriptionFromDB(userId) {
  try {
    const { getSingleton } = await import('@/lib/db')
    const data = await getSingleton(`subscription_${userId}`)
    return data ?? null
  } catch {
    return null
  }
}

async function saveSubscriptionToDB(userId, data) {
  try {
    const { updateSingleton } = await import('@/lib/db')
    await updateSingleton(`subscription_${userId}`, data)
  } catch {
    // DB unavailable — no persistence
  }
}

// ── GET /api/admin/subscription ──────────────────────────────────────────────

export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try to get saved subscription from DB
  const saved = await getSubscriptionFromDB(payload.userId)
  if (saved) {
    // If we have a live Razorpay subscription ID, refresh status from Razorpay
    if (saved.razorpaySubscriptionId) {
      const rz = razorpay()
      if (rz) {
        const live = await rz.get(`/subscriptions/${saved.razorpaySubscriptionId}`)
        if (live) {
          const updated = {
            ...saved,
            status:              mapRazorpayStatus(live.status),
            currentPeriodEnd:    live.current_end   ? new Date(live.current_end * 1000).toISOString()   : saved.currentPeriodEnd,
            currentPeriodStart:  live.current_start ? new Date(live.current_start * 1000).toISOString() : saved.currentPeriodStart,
            cancelAtPeriodEnd:   live.cancel_at_cycle_end ?? false,
          }
          await saveSubscriptionToDB(payload.userId, updated)
          return NextResponse.json(withPlanDetails(updated))
        }
      }
    }
    return NextResponse.json(withPlanDetails(saved))
  }

  return NextResponse.json(dummySubscription)
}

// ── Utils ────────────────────────────────────────────────────────────────────

function mapRazorpayStatus(s) {
  const map = { created: 'inactive', authenticated: 'inactive', active: 'active', pending: 'inactive', halted: 'past_due', cancelled: 'cancelled', completed: 'cancelled', expired: 'cancelled' }
  return map[s] ?? s
}

function withPlanDetails(sub) {
  const plan = dummyPlans.find(p => p.id === sub.planId)
  return { ...sub, planDetails: plan ?? null }
}
