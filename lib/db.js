import { nanoid } from 'nanoid'
import { readBlobJson, writeBlobJson } from './blobStore.js'

function now() {
  return new Date().toISOString()
}

// ─── Storage backend ────────────────────────────────────────────────────────
// No relational database — every read/write below goes through a flat JSON
// file in Vercel Blob (lib/blobStore.js), one file per collection, singleton
// or table, namespaced under TOOLS_NAME. This app only ever has two modes:
// fully local (reads/writes its own Blob JSON, everything in this file) or
// fully NEXT_PUBLIC_IS_CONNECT-proxied to the root admin panel's API (see
// lib/connect.js) — every route already branches on IS_CONNECT before ever
// calling into this file, so nothing here needs to know about that mode.

async function readSetting(name) {
  return readBlobJson(name, null)
}

async function writeSetting(name, value) {
  await writeBlobJson(name, value)
}

// ─── List Collections ──────────────────────────────────────────────────────────

export async function getCollection(name) {
  const data = await readSetting(name)
  return Array.isArray(data) ? data : []
}

export async function getItem(name, id) {
  const items = await getCollection(name)
  return items.find((i) => i.id === id) ?? null
}

// ─── Singleton Collections ─────────────────────────────────────────────────────

export async function getSingleton(name) {
  return (await readSetting(name)) ?? {}
}

export async function updateSingleton(name, data) {
  await writeSetting(name, data)
  return data
}

// ─── Users (JSON array table: 'users') ─────────────────────────────────────────

export async function getUserByEmail(email) {
  const users = await getCollection('users')
  return users.find((u) => u.email === email) ?? null
}

export async function getUserByMobile(mobile) {
  const users = await getCollection('users')
  return users.find((u) => u.mobile === mobile) ?? null
}

export async function getUserById(id) {
  const users = await getCollection('users')
  return users.find((u) => u.id === id) ?? null
}

// Mirrors barmeto-admin-pannels' lib/db.js function of the same name, used
// by /api/auth/me to populate serializeProfile's `walletExpiresAt`. That app
// sources this from its `wallet_topups` table, part of the full coin-wallet
// billing system — this app never got that system ported, so this is a safe
// no-op stub that always reports "no expiry" rather than querying data that
// doesn't exist. Give it a real implementation if that billing system is
// ever ported to this app.
export async function getLatestWalletExpiry(_userId) {
  return null
}

export async function updateUserPassword(userId, passwordHash) {
  const users = await getCollection('users')
  const idx = users.findIndex((u) => u.id === userId)
  if (idx === -1) throw new Error('User not found')
  users[idx] = { ...users[idx], password_hash: passwordHash, updated_at: now() }
  await writeSetting('users', users)
}

// Partial update for admin-managed users (name/email/mobile/role/company/status/otp).
export async function updateUser(id, updates) {
  const users = await getCollection('users')
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) throw new Error('User not found')

  const patch = {}
  if ('name' in updates) patch.name = updates.name
  if ('email' in updates) patch.email = updates.email ? updates.email.toLowerCase().trim() : null
  if ('mobile' in updates) patch.mobile = updates.mobile || null
  if ('role' in updates) patch.role = updates.role
  if ('companyId' in updates) patch.company_id = updates.companyId
  if ('isActive' in updates) patch.is_active = updates.isActive
  if ('otpEnabled' in updates) patch.otp_enabled = updates.otpEnabled
  if ('address1' in updates) patch.address1 = updates.address1 || null
  if ('address2' in updates) patch.address2 = updates.address2 || null
  if ('addressCity' in updates) patch.address_city = updates.addressCity || null
  if ('addressState' in updates) patch.address_state = updates.addressState || null
  if ('addressCountry' in updates) patch.address_country = updates.addressCountry || null
  if ('addressPincode' in updates) patch.address_pincode = updates.addressPincode || null
  if ('businessName' in updates) patch.company_name = updates.businessName || null
  if ('gstNumber' in updates) patch.gst_number = updates.gstNumber || null
  if ('walletCreditsTotal' in updates) patch.wallet_credits_total = updates.walletCreditsTotal
  if ('walletCreditsUsed' in updates) patch.wallet_credits_used = updates.walletCreditsUsed
  patch.updated_at = now()

  users[idx] = { ...users[idx], ...patch }
  await writeSetting('users', users)
  return users[idx]
}

// ─── OTP (JSON array table: 'user_otp') ────────────────────────────────────────

// Single point of truth for the OTP bypass — every OTP-gated route (login,
// change-password, verify-contact-change, verify-otp) calls verifyOTP()
// rather than checking user_otp itself, so gating it here disables OTP
// enforcement everywhere at once without touching each route individually.
const OTP_DISABLED = process.env.NEXT_PUBLIC_IS_OTP_Verifications_Disable === 'true'

// There's no DB trigger to auto-expire old rows anymore, so every write
// opportunistically drops entries whose expiry is more than 10 minutes in
// the past — keeps the file bounded without needing a separate cron job for
// a table this low-traffic.
const OTP_GRACE_MS = 10 * 60 * 1000

export async function createOTP({ identifier, type, otpCode, purpose = 'reset_password' }) {
  let otps = await getCollection('user_otp')
  // Delete any existing OTP for this identifier + purpose first (doesn't touch
  // a pending OTP for a different purpose, e.g. login vs password reset)
  otps = otps.filter((o) => !(o.identifier === identifier && o.purpose === purpose))
  const record = {
    id: nanoid(),
    identifier,
    type,
    otp_code: otpCode,
    purpose,
    expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
    used: false,
    created_at: now(),
  }
  otps.push(record)
  const cutoff = Date.now() - OTP_GRACE_MS
  otps = otps.filter((o) => o.id === record.id || new Date(o.expires_at).getTime() > cutoff)
  await writeSetting('user_otp', otps)
  return record
}

export async function verifyOTP({ identifier, otpCode, purpose = 'reset_password' }) {
  if (OTP_DISABLED) return true
  const otps = await getCollection('user_otp')
  const idx = otps.findIndex((o) =>
    o.identifier === identifier &&
    o.otp_code === otpCode &&
    o.purpose === purpose &&
    !o.used &&
    new Date(o.expires_at).getTime() > Date.now()
  )
  if (idx === -1) return false
  otps[idx] = { ...otps[idx], used: true }
  await writeSetting('user_otp', otps)
  return true
}

// ─── Companies ────────────────────────────────────────────────────────────────

function toCompanySlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

export async function getCompanyById(id) {
  const companies = await getCollection('companies')
  return companies.find((c) => c.id === id) ?? null
}

// Creates a company row. folderId must already be reserved before calling this.
export async function createCompany({ name, email, phone, website, address, folderId }) {
  const companies = await getCollection('companies')
  const company = {
    id: nanoid(),
    name: name || null,
    slug: name ? toCompanySlug(name) : null,
    email: email.toLowerCase().trim(),
    phone: phone || null,
    website: website || null,
    address: address || null,
    folder_id: folderId,
    is_active: true,
    created_at: now(),
    updated_at: now(),
  }
  companies.push(company)
  await writeSetting('companies', companies)
  return company
}

// Updates company details. If name changes, updates slug + folder_id.
// Returns { company, folderChanged, oldFolderId, newFolderId }
export async function updateCompany(id, updates) {
  const companies = await getCollection('companies')
  const idx = companies.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error('Company not found')
  const current = companies[idx]

  const patch = {}
  if ('name' in updates) {
    patch.name = updates.name || null
    patch.slug = updates.name ? toCompanySlug(updates.name) : null
    // rename folder only when name changes and a new slug can be derived
    if (patch.slug && patch.slug !== current.slug) {
      patch.folder_id = patch.slug
    }
  }
  if ('email' in updates) patch.email = updates.email.toLowerCase().trim()
  if ('phone' in updates) patch.phone = updates.phone || null
  if ('website' in updates) patch.website = updates.website || null
  if ('address' in updates) patch.address = updates.address || null
  if ('is_active' in updates) patch.is_active = updates.is_active
  patch.updated_at = now()

  const updated = { ...current, ...patch }
  companies[idx] = updated
  await writeSetting('companies', companies)

  const folderChanged = patch.folder_id && patch.folder_id !== current.folder_id
  return {
    company: updated,
    folderChanged: !!folderChanged,
    oldFolderId: current.folder_id,
    newFolderId: patch.folder_id ?? current.folder_id,
  }
}

export async function deleteCompany(id) {
  const companies = await getCollection('companies')
  await writeSetting('companies', companies.filter((c) => c.id !== id))
}
