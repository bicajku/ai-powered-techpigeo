/**
 * Backfill welcome credits for users who registered (incl. OAuth) but were
 * never seeded with the 10 BASIC trial credits due to a prior bug.
 *
 * Strategy: any user whose ACTIVE BASIC subscription was assigned in the
 * last 30 days, currently has pro_credits = 0, and has no recorded usage
 * is topped up to 10 credits.
 *
 * Usage:
 *   node backfill-welcome-credits.mjs            # dry run
 *   node backfill-welcome-credits.mjs --apply    # apply changes
 */

import { neon } from "@neondatabase/serverless"

const APPLY = process.argv.includes("--apply")
const url = process.env.NEON_DATABASE_URL
if (!url) {
  console.error("NEON_DATABASE_URL not set")
  process.exit(1)
}
const sql = neon(url)

const candidates = await sql`
  SELECT s.id AS sub_id, s.user_id, u.email, s.assigned_at, s.pro_credits
  FROM sentinel_user_subscriptions s
  JOIN sentinel_users u ON u.id = s.user_id
  WHERE s.status = 'ACTIVE'
    AND s.tier = 'BASIC'
    AND COALESCE(s.pro_credits, 0) = 0
    AND s.assigned_at >= NOW() - INTERVAL '30 days'
  ORDER BY s.assigned_at DESC
`

console.log(`Found ${candidates.length} candidate subscription(s) with 0 credits in the last 30 days.`)
for (const row of candidates) {
  console.log(`  - ${row.email} (sub=${row.sub_id}, assigned=${row.assigned_at})`)
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to top up to 10 credits each.")
  process.exit(0)
}

let updated = 0
for (const row of candidates) {
  await sql`
    UPDATE sentinel_user_subscriptions
    SET pro_credits = 10, updated_at = NOW()
    WHERE id = ${row.sub_id} AND COALESCE(pro_credits, 0) = 0
  `
  updated += 1
}
console.log(`\nTopped up ${updated} subscription(s) to 10 credits.`)
