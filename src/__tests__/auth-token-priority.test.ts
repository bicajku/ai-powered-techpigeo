import { resolveSentinelSessionUserIfTokenPresent } from "@/lib/auth"

const baseUser = {
  id: "user-123",
  email: "client@example.com",
  fullName: "Client User",
  role: "CLIENT",
  organizationId: "org-1",
  createdAt: Date.now(),
  lastLoginAt: Date.now(),
}

export const authTokenPriorityTests = {
  async testSkipsSessionLookupWhenTokenMissing() {
    let sessionCallCount = 0

    const user = await resolveSentinelSessionUserIfTokenPresent(
      () => null,
      async () => {
        sessionCallCount += 1
        return { user: baseUser }
      }
    )

    console.assert(user === null, "Should return null when token is missing")
    console.assert(sessionCallCount === 0, "Should not call session lookup when token is missing")
    console.log("✓ token-missing path does not call session lookup")
  },

  async testReturnsSessionUserWhenTokenPresent() {
    let sessionCallCount = 0

    const user = await resolveSentinelSessionUserIfTokenPresent(
      () => "sentinel-auth-token-value",
      async () => {
        sessionCallCount += 1
        return { user: baseUser }
      }
    )

    console.assert(user?.id === baseUser.id, "Should return sentinel session user when token exists")
    console.assert(sessionCallCount === 1, "Should call session lookup exactly once when token exists")
    console.log("✓ token-present path resolves sentinel session user first")
  },

  async runAll() {
    console.log("Running auth token priority tests...\n")
    await this.testSkipsSessionLookupWhenTokenMissing()
    await this.testReturnsSessionUserWhenTokenPresent()
    console.log("\n✓ All auth token priority tests passed!")
  },
}

export default authTokenPriorityTests
