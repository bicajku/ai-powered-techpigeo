/**
 * Sentinel SAAS - Database Seed
 *
 * Seeds the initial Sentinel Commander (Super Admin) account.
 * Run once after applying migrations.sql.
 *
 * The password is hashed using the same SHA-256 + salt scheme
 * as the rest of the platform so that both in-KV and DB auth
 * can verify credentials interchangeably.
 */

import { getNeonClient } from "@/lib/neon-client"
import { SENTINEL_CONFIG } from "../config"

const SENTINEL_COMMANDER_EMAIL = SENTINEL_CONFIG.adminEmail
const SENTINEL_COMMANDER_NAME = "Sentinel Commander"

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salted = `sentinel:${password}:v2`
  const data = encoder.encode(salted)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function seedSentinelCommander(): Promise<void> {
  const sql = await getNeonClient()

  const passwordHash = await hashPassword(SENTINEL_CONFIG.commanderDefaultPass)

  // Check if commander already exists
  const existing = await sql`
    SELECT id FROM sentinel_users
    WHERE email = ${SENTINEL_COMMANDER_EMAIL}
    LIMIT 1
  ` as Array<Record<string, unknown>>

  if (existing.length > 0) {
    console.info("Sentinel Commander already exists — skipping seed.")
    return
  }

  // Insert commander
  const [commander] = await sql`
    INSERT INTO sentinel_users (
      email, full_name, password_hash, role, is_active
    ) VALUES (
      ${SENTINEL_COMMANDER_EMAIL},
      ${SENTINEL_COMMANDER_NAME},
      ${passwordHash},
      'SENTINEL_COMMANDER',
      TRUE
    )
    RETURNING id
  ` as Array<{ id: string }>

  // Create sentinel organization
  const [org] = await sql`
    INSERT INTO sentinel_organizations (
      name, tier, admin_user_id
    ) VALUES (
      'Sentinel SAAS',
      'ENTERPRISE',
      ${commander.id}
    )
    RETURNING id
  ` as Array<{ id: string }>

  // Link commander to organization
  await sql`
    UPDATE sentinel_users
    SET organization_id = ${org.id}
    WHERE id = ${commander.id}
  `

  // Seed default subscription tiers
  await sql`
    INSERT INTO sentinel_subscriptions (tier, description, pricing_monthly, pricing_yearly, features, max_members, includes_ngo_saas, requires_approval)
    VALUES
      ('BASIC',      'Essential tools for individuals',                 9,  90,  '["Core strategy generation","Basic analytics","PDF exports","5 projects"]',           1,    FALSE, FALSE),
      ('PRO',        'Advanced features for power users',              29, 290,  '["Everything in Basic","Advanced AI models","Plagiarism detection","25 projects"]',   1,    FALSE, FALSE),
      ('TEAMS',      'Collaboration tools for teams',                  79, 790,  '["Everything in Pro","Up to 10 team members","Team admin controls","Shared workspace"]', 10, FALSE, FALSE),
      ('ENTERPRISE', 'Enterprise-grade with NGO SAAS module',           0,   0,  '["Everything in Teams","Unlimited members","NGO SAAS module","Custom branding","Audit logs"]', NULL, TRUE, TRUE)
    ON CONFLICT DO NOTHING
  `

  console.info("✅ Sentinel Commander seeded successfully:", commander.id)
  console.info("✅ Sentinel Organization seeded:", org.id)
}
