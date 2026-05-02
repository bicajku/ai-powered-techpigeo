/**
 * One-off backfill: send Welcome + Bonus emails to all existing BASIC users.
 *
 * Safety features:
 *   - Skips users whose email is in sentinel_deleted_emails (no bonus on re-signup).
 *   - Skips already-flagged users via sentinel_welcome_backfill_log (idempotent — safe to re-run).
 *   - Throttles between sends (default 1500 ms) to stay under Graph / SMTP rate limits
 *     and to avoid burst patterns that trigger spam filters.
 *   - Dry-run by default. Pass `--apply` to actually send.
 *   - Optional `--limit=N` to cap how many users get processed in one run.
 *
 * Usage:
 *   node send-welcome-backfill.mjs                # dry run, lists targets
 *   node send-welcome-backfill.mjs --apply        # send to all eligible BASIC users
 *   node send-welcome-backfill.mjs --apply --limit=50
 *   node send-welcome-backfill.mjs --apply --delay=2500
 */

import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { sendWelcomeEmail, sendBonusClaimEmail } from "./backend/mail-service.mjs"

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="))
  return a ? Math.max(1, Number(a.split("=")[1]) || 0) : 0
})()
const DELAY_MS = (() => {
  const a = args.find((x) => x.startsWith("--delay="))
  return a ? Math.max(250, Number(a.split("=")[1]) || 1500) : 1500
})()

if (!process.env.NEON_DATABASE_URL) {
  console.error("[backfill] NEON_DATABASE_URL not set. Aborting.")
  process.exit(1)
}

const sql = neon(process.env.NEON_DATABASE_URL)

async function ensureLogTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS sentinel_welcome_backfill_log (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      welcome_sent BOOLEAN NOT NULL DEFAULT FALSE,
      bonus_sent BOOLEAN NOT NULL DEFAULT FALSE,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      error TEXT
    )
  `
}

async function fetchEligibleBasicUsers() {
  // Active BASIC users (either via subscription tier or fallback role) who:
  //   - have a real email
  //   - are NOT in sentinel_deleted_emails
  //   - have NOT already been backfilled
  const rows = await sql`
    SELECT DISTINCT u.id, u.email, u.full_name AS "fullName"
    FROM sentinel_users u
    LEFT JOIN sentinel_user_subscriptions s
      ON s.user_id = u.id AND s.status = 'ACTIVE'
    LEFT JOIN sentinel_deleted_emails d ON d.email = u.email
    LEFT JOIN sentinel_welcome_backfill_log b ON b.user_id = u.id
    WHERE u.is_active = TRUE
      AND u.email IS NOT NULL
      AND u.email NOT LIKE 'deleted+%@novussparks.invalid'
      AND (s.tier = 'BASIC' OR s.tier IS NULL)
      AND d.email IS NULL
      AND b.user_id IS NULL
    ORDER BY u.email ASC
  `
  return rows
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log(`[backfill] mode = ${APPLY ? "APPLY (sending real emails)" : "DRY RUN"}`)
  console.log(`[backfill] throttle = ${DELAY_MS} ms between users`)
  if (LIMIT) console.log(`[backfill] limit = ${LIMIT} users`)

  await ensureLogTable()
  const users = await fetchEligibleBasicUsers()
  const targets = LIMIT ? users.slice(0, LIMIT) : users

  console.log(`[backfill] eligible users: ${users.length} (processing ${targets.length})`)
  if (!targets.length) {
    console.log("[backfill] nothing to do.")
    return
  }

  if (!APPLY) {
    targets.forEach((u, i) => {
      console.log(`  ${String(i + 1).padStart(4)}. ${u.email}  (${u.fullName || "—"})`)
    })
    console.log("\n[backfill] dry run complete. Re-run with --apply to send.")
    return
  }

  let okWelcome = 0
  let okBonus = 0
  let failures = 0

  for (let i = 0; i < targets.length; i++) {
    const u = targets[i]
    const idx = `[${i + 1}/${targets.length}]`
    let welcomeOk = false
    let bonusOk = false
    let errMsg = null

    try {
      const w = await sendWelcomeEmail({ to: u.email, fullName: u.fullName })
      welcomeOk = !!w?.ok
      if (welcomeOk) okWelcome++

      // Tiny intra-user gap so the two messages don't burst back-to-back.
      await sleep(400)

      const b = await sendBonusClaimEmail({ to: u.email, fullName: u.fullName })
      bonusOk = !!b?.ok
      if (bonusOk) okBonus++

      if (!welcomeOk || !bonusOk) {
        errMsg = `welcome=${w?.error || w?.skipped ? "skipped" : "ok"} bonus=${b?.error || b?.skipped ? "skipped" : "ok"}`
      }

      console.log(`${idx} ${u.email} → welcome:${welcomeOk ? "✓" : "✗"} bonus:${bonusOk ? "✓" : "✗"}`)
    } catch (err) {
      failures++
      errMsg = err?.message || String(err)
      console.error(`${idx} ${u.email} → FAILED: ${errMsg}`)
    }

    try {
      await sql`
        INSERT INTO sentinel_welcome_backfill_log (user_id, email, welcome_sent, bonus_sent, error)
        VALUES (${u.id}, ${u.email}, ${welcomeOk}, ${bonusOk}, ${errMsg})
        ON CONFLICT (user_id) DO UPDATE
          SET welcome_sent = EXCLUDED.welcome_sent,
              bonus_sent  = EXCLUDED.bonus_sent,
              sent_at     = now(),
              error       = EXCLUDED.error
      `
    } catch (logErr) {
      console.warn(`${idx} ${u.email} → log write failed:`, logErr?.message)
    }

    if (i < targets.length - 1) await sleep(DELAY_MS)
  }

  console.log("\n[backfill] complete.")
  console.log(`  Welcome sent: ${okWelcome}/${targets.length}`)
  console.log(`  Bonus   sent: ${okBonus}/${targets.length}`)
  console.log(`  Failures   : ${failures}`)
}

main().catch((err) => {
  console.error("[backfill] fatal:", err)
  process.exit(1)
})
