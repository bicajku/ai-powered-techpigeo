#!/usr/bin/env node
/**
 * Policy invariant guard.
 *
 * Locks the seven policies shipped during the May 2026 governance pass.
 * Every invariant is anchored by a unique `INVARIANT[<id>]` marker in the
 * referenced source file. If any marker is removed/renamed/moved out of its
 * file, this script exits non-zero and CI fails.
 *
 * To intentionally relax a policy, update BOTH this script AND
 * /memories/repo/policies.md in the same PR with a clear justification.
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** @type {{id: string, file: string, marker: string, mustContain?: string[]}[]} */
const INVARIANTS = [
  {
    id: "platform-admin-rbac",
    file: "src/lib/auth.ts",
    marker: "INVARIANT[platform-admin-rbac]",
    mustContain: [`user.role === "SENTINEL_COMMANDER"`],
  },
  {
    id: "admin-credits-display",
    file: "src/components/WelcomeBanner.tsx",
    marker: "INVARIANT[admin-credits-display]",
    mustContain: [`if (isAdmin) return`, `isAdmin ? "Unlimited"`],
  },
  {
    id: "idea-credit-costs",
    file: "src/lib/subscription.ts",
    marker: "INVARIANT[idea-credit-costs]",
    mustContain: [
      "export const IDEA_CANVAS_CREDIT_COST = 2",
      "export const IDEA_PITCH_CREDIT_COST = 4",
    ],
  },
  {
    id: "sticky-user-deletion",
    file: "backend/db.mjs",
    marker: "INVARIANT[sticky-user-deletion]",
    mustContain: [
      "google_id = NULL",
      "github_id = NULL",
      "microsoft_id = NULL",
      "is_active = FALSE",
    ],
  },
  {
    id: "oauth-deleted-block",
    file: "backend/oauth.mjs",
    marker: "INVARIANT[oauth-deleted-block]",
    mustContain: ["wasEmailDeleted", "is_active = TRUE"],
  },
  {
    id: "register-deleted-block",
    file: "backend/server.mjs",
    marker: "INVARIANT[register-deleted-block]",
    mustContain: ["wasEmailDeleted"],
  },
  {
    id: "enterprise-grant-persistence",
    file: "backend/db.mjs",
    marker: "INVARIANT[enterprise-grant-persistence]",
    mustContain: [
      "setEnterpriseGrant",
      "ngo_access_level",
      "granted_via",
      "ngoAccessLevel requires grantedVia",
    ],
  },
  {
    id: "enterprise-grant-route",
    file: "backend/server.mjs",
    marker: "INVARIANT[enterprise-grant-persistence]",
    mustContain: [
      "/api/sentinel/admin/enterprise-grant",
      "hasMinimumRole(actor.role, \"TEAM_ADMIN\")",
      "grantedVia",
    ],
  },
  {
    id: "enterprise-grant-client",
    file: "src/lib/enterprise-subscription.ts",
    marker: "INVARIANT[enterprise-grant-persistence]",
    mustContain: [
      "persistEnterpriseGrantToBackend",
      "/api/sentinel/admin/enterprise-grant",
      "grantedVia: \"enterprise\"",
    ],
  },
  {
    id: "enterprise-grant-auth-mapping",
    file: "src/lib/auth.ts",
    marker: "INVARIANT[enterprise-grant-persistence]",
    mustContain: [
      "hasEnterpriseGrant",
      `plan: "enterprise"`,
      "ngoAccessLevel",
    ],
  },
]

let failed = 0
const failures = []

for (const inv of INVARIANTS) {
  const abs = resolve(repoRoot, inv.file)
  if (!existsSync(abs)) {
    failures.push(`[${inv.id}] missing file: ${inv.file}`)
    failed++
    continue
  }
  const src = readFileSync(abs, "utf8")
  if (!src.includes(inv.marker)) {
    failures.push(`[${inv.id}] missing marker "${inv.marker}" in ${inv.file}`)
    failed++
    continue
  }
  for (const needle of inv.mustContain || []) {
    if (!src.includes(needle)) {
      failures.push(
        `[${inv.id}] ${inv.file} has marker but is missing required clause: ${JSON.stringify(needle)}`,
      )
      failed++
    }
  }
}

if (failed > 0) {
  console.error("\n✖ Policy guard failed:\n")
  for (const f of failures) console.error("  - " + f)
  console.error(
    "\nThese policies are locked. To change them, update BOTH scripts/guard-policies.mjs AND /memories/repo/policies.md in the same PR.\n",
  )
  process.exit(1)
}

console.log(`✓ Policy guard passed (${INVARIANTS.length} invariants verified).`)
