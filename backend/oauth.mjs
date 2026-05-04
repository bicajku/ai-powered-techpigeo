import { getSql } from './db.mjs';
import { signToken } from './auth.mjs';
import crypto from 'node:crypto';

// Get base URL for redirects
const getBaseUrl = () => {
  if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
  if (process.env.NODE_ENV === 'production') {
    return 'https://ai-powered-techpigeo.herokuapp.com'; // Adjust if needed
  }
  return 'http://localhost:5173'; // Default Vite dev port
};

// ============================================================================
// Google OAuth
// ============================================================================
export async function getGoogleAuthUrl() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/auth/google/callback`;
  
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.append("client_id", clientId);
  url.searchParams.append("redirect_uri", redirectUri);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("scope", "email profile");
  url.searchParams.append("access_type", "online");
  url.searchParams.append("prompt", "consent");
  
  return url.toString();
}

export async function handleGoogleCallback(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/auth/google/callback`;

  // 1. Exchange code for token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) throw new Error(`Failed to get Google token: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json();

  // 2. Get user profile
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) throw new Error(`Failed to get Google user info: ${await userRes.text()}`);
  const userData = await userRes.json();

  return await processOAuthUser({
    providerId: userData.id,
    provider: "google",
    email: userData.email,
    fullName: userData.name || userData.given_name || "Google User",
    avatarUrl: userData.picture
  });
}

// ============================================================================
// GitHub OAuth
// ============================================================================
export async function getGithubAuthUrl() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || `${getBaseUrl()}/api/auth/github/callback`;
  
  if (!clientId) throw new Error("GITHUB_CLIENT_ID is not configured");

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.append("client_id", clientId);
  url.searchParams.append("redirect_uri", redirectUri);
  url.searchParams.append("scope", "read:user user:email");
  
  return url.toString();
}

export async function handleGithubCallback(code) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || `${getBaseUrl()}/api/auth/github/callback`;

  // 1. Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    }),
  });

  if (!tokenRes.ok) throw new Error(`Failed to get GitHub token: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json();
  
  if (tokenData.error) throw new Error(`GitHub token error: ${tokenData.error_description}`);

  // 2. Get user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: { 
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "NovusSparks-AI-App"
    },
  });

  if (!userRes.ok) throw new Error(`Failed to get GitHub user info: ${await userRes.text()}`);
  const userData = await userRes.json();

  // 3. Get user email (GitHub might return null email if private)
  let email = userData.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { 
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "NovusSparks-AI-App"
      },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primaryEmail = emails.find(e => e.primary) || emails[0];
      if (primaryEmail) email = primaryEmail.email;
    }
  }

  if (!email) throw new Error("Could not retrieve email from GitHub");

  return await processOAuthUser({
    providerId: userData.id.toString(),
    provider: "github",
    email: email,
    fullName: userData.name || userData.login || "GitHub User",
    avatarUrl: userData.avatar_url
  });
}

// ============================================================================
// Microsoft (Office / Work / Personal account) OAuth — Entra ID v2.0
// ============================================================================
//
// Required env vars:
//   MS_CLIENT_ID            — App registration Application (client) ID
//   MS_CLIENT_SECRET        — App registration secret value
//   MS_TENANT_ID            — "common" (work + personal), "organizations" (work only),
//                              "consumers" (personal only), or your tenant GUID/domain.
//                              Default: "common".
//   MS_REDIRECT_URI         — Optional override (defaults to <baseUrl>/api/auth/microsoft/callback)
//
// In Entra: register an app, add a Web platform redirect URI matching MS_REDIRECT_URI,
// add delegated permissions: openid, profile, email, User.Read.
function getMicrosoftTenant() {
  return process.env.MS_TENANT_ID || "common"
}

export async function getMicrosoftAuthUrl() {
  const clientId = process.env.MS_CLIENT_ID;
  const redirectUri = process.env.MS_REDIRECT_URI || `${getBaseUrl()}/api/auth/microsoft/callback`;

  if (!clientId) throw new Error("MS_CLIENT_ID is not configured");

  const tenant = getMicrosoftTenant();
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.append("client_id", clientId);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("redirect_uri", redirectUri);
  url.searchParams.append("response_mode", "query");
  url.searchParams.append("scope", "openid profile email User.Read offline_access");
  url.searchParams.append("prompt", "select_account");

  return url.toString();
}

export async function handleMicrosoftCallback(code) {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI || `${getBaseUrl()}/api/auth/microsoft/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth is not configured (MS_CLIENT_ID / MS_CLIENT_SECRET missing)");
  }

  const tenant = getMicrosoftTenant();

  // 1. Exchange code for token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "openid profile email User.Read offline_access",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    throw new Error(`Failed to get Microsoft token: ${detail}`);
  }
  const tokenData = await tokenRes.json();

  // 2. Get profile from Microsoft Graph (/me)
  const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    const detail = await userRes.text().catch(() => "");
    throw new Error(`Failed to get Microsoft user info: ${detail}`);
  }
  const userData = await userRes.json();

  // 3. Resolve email — work accounts often only expose `mail` or `userPrincipalName`
  const email = (
    userData.mail ||
    userData.userPrincipalName ||
    userData.preferred_username ||
    ""
  ).toLowerCase();
  if (!email) throw new Error("Could not retrieve email from Microsoft account");

  // 4. Best-effort profile photo from Graph (some tenants/accounts disallow it)
  let avatarUrl = null;
  try {
    const photoRes = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (photoRes.ok) {
      const buf = Buffer.from(await photoRes.arrayBuffer());
      const contentType = photoRes.headers.get("content-type") || "image/jpeg";
      // Inline as data URL — small enough for avatars; skip if > 200 KB
      if (buf.length <= 200 * 1024) {
        avatarUrl = `data:${contentType};base64,${buf.toString("base64")}`;
      }
    }
  } catch {
    // ignore photo fetch errors
  }

  return await processOAuthUser({
    providerId: userData.id,
    provider: "microsoft",
    email,
    fullName: userData.displayName || userData.givenName || "Microsoft User",
    avatarUrl,
  });
}

// ============================================================================
// Common OAuth User Processing
// ============================================================================
async function processOAuthUser(profile) {
  const sql = getSql();

  // INVARIANT[oauth-deleted-block]: OAuth login/signup MUST be blocked for emails
  // that were previously deleted by an admin AND lookups MUST filter is_active = TRUE.
  // Removing either check allows admin-deleted users to log back in via OAuth.
  // See /memories/repo/policies.md.
  // Admin must remove the row from sentinel_deleted_emails to allow rejoin.
  try {
    const { wasEmailDeleted } = await import("./db.mjs");
    if (await wasEmailDeleted(profile.email)) {
      const err = new Error("This account was removed by an administrator and cannot sign in. Contact support if you believe this is a mistake.");
      err.code = "ACCOUNT_DELETED";
      throw err;
    }
  } catch (err) {
    if (err?.code === "ACCOUNT_DELETED") throw err;
    // Best effort — if the check fails (db error), continue.
  }

  // 1. Find existing user by email or provider ID (active accounts only).
  let user;

  if (profile.provider === "google") {
    user = await sql`SELECT * FROM sentinel_users WHERE (google_id = ${profile.providerId} OR email = ${profile.email}) AND is_active = TRUE LIMIT 1`;
  } else if (profile.provider === "github") {
    user = await sql`SELECT * FROM sentinel_users WHERE (github_id = ${profile.providerId} OR email = ${profile.email}) AND is_active = TRUE LIMIT 1`;
  } else if (profile.provider === "microsoft") {
    user = await sql`SELECT * FROM sentinel_users WHERE (microsoft_id = ${profile.providerId} OR email = ${profile.email}) AND is_active = TRUE LIMIT 1`;
  }

  if (user && user.length > 0) {
    user = user[0];

    // Update existing user with provider ID if missing
    if (profile.provider === "google" && !user.google_id) {
      await sql`UPDATE sentinel_users SET google_id = ${profile.providerId} WHERE id = ${user.id}`;
    } else if (profile.provider === "github" && !user.github_id) {
      await sql`UPDATE sentinel_users SET github_id = ${profile.providerId} WHERE id = ${user.id}`;
    } else if (profile.provider === "microsoft" && !user.microsoft_id) {
      await sql`UPDATE sentinel_users SET microsoft_id = ${profile.providerId} WHERE id = ${user.id}`;
    }
    
    // Update last login
    await sql`UPDATE sentinel_users SET last_login_at = NOW() WHERE id = ${user.id}`;
  } else {
    // 2. Create new user
    const newUser = await sql`
      INSERT INTO sentinel_users (
        id,
        email, 
        full_name, 
        role, 
        is_active, 
        avatar_url,
        google_id,
        github_id,
        microsoft_id
      ) VALUES (
        ${crypto.randomUUID()},
        ${profile.email}, 
        ${profile.fullName}, 
        'USER', 
        true, 
        ${profile.avatarUrl || null},
        ${profile.provider === 'google' ? profile.providerId : null},
        ${profile.provider === 'github' ? profile.providerId : null},
        ${profile.provider === 'microsoft' ? profile.providerId : null}
      )
      RETURNING *
    `;
    user = newUser[0];

    // 3. Bootstrap a personal org for this user
    const orgId = crypto.randomUUID();
    await sql`
      INSERT INTO sentinel_organizations (id, name, tier, admin_user_id)
      VALUES (${orgId}, ${profile.fullName + "'s Workspace"}, 'BASIC', ${user.id})
    `;

    // Link user to org
    await sql`
      UPDATE sentinel_users
      SET organization_id = ${orgId}, updated_at = NOW()
      WHERE id = ${user.id}
    `;
    user.organization_id = orgId;

    // 4. Create a 7-day BASIC trial subscription with welcome credits
    const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const subId = crypto.randomUUID();
    await sql`
      INSERT INTO sentinel_user_subscriptions
        (id, user_id, organization_id, tier, status, assigned_by, pro_credits, expires_at, auto_renew)
      VALUES
        (${subId}, ${user.id}, ${orgId}, 'BASIC', 'ACTIVE', ${user.id}, 10, ${trialExpiresAt}::TIMESTAMPTZ, false)
    `;

    console.log(`[oauth] New user provisioned: ${profile.email} | org: ${orgId} | trial expires: ${trialExpiresAt}`);

    // Fire welcome + bonus claim emails for newly provisioned OAuth users
    // (non-blocking, mail-service no-ops gracefully when nothing is configured).
    // Returning users (previously deleted) get a "welcome back" email and skip the bonus.
    try {
      const { sendWelcomeEmail, sendWelcomeBackEmail, sendBonusClaimEmail, sendNewUserAdminNotification } = await import("./mail-service.mjs");
      const { wasEmailDeleted, markEmailRejoined } = await import("./db.mjs");
      let isReturningUser = false;
      try {
        isReturningUser = await wasEmailDeleted(profile.email);
        if (isReturningUser) {
          markEmailRejoined(profile.email).catch(() => {});
        }
      } catch (err) {
        console.warn("[oauth] returning-user check failed (treating as new):", err?.message);
      }

      if (isReturningUser) {
        sendWelcomeBackEmail({ to: profile.email, fullName: profile.fullName }).catch(() => {});
      } else {
        sendWelcomeEmail({ to: profile.email, fullName: profile.fullName }).catch(() => {});
        sendBonusClaimEmail({ to: profile.email, fullName: profile.fullName }).catch(() => {});
      }
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.M365_SENDER_EMAIL;
      if (adminEmail) {
        sendNewUserAdminNotification({
          adminEmail,
          newUserEmail: profile.email,
          newUserName: profile.fullName,
          source: `oauth-${profile.provider}${isReturningUser ? "-returning" : ""}`,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[oauth] welcome email dispatch skipped:", err?.message);
    }
  }

  // Get subscription for token
  // Get subscription info from user's latest active subscription (not from a subscription product)
  // The org.subscription_id field links to sentinel_subscriptions for plan details,
  // but our user might have a direct user_subscription already.
  let tier = "BASIC"
  try {
    const subData = await sql`
      SELECT tier FROM sentinel_user_subscriptions
      WHERE user_id = ${user.id} AND status = 'ACTIVE'
      ORDER BY assigned_at DESC
      LIMIT 1
    `
    if (subData.length > 0) {
      tier = subData[0].tier
    }
  } catch (err) {
    console.warn("[oauth] Failed to fetch user subscription tier:", err?.message)
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id || null,
    subscriptionTier: tier,
  });
  
  return { user, token };
}

export function generateOAuthCallbackHtml(token, user) {
  // Safe HTML that sets the token in localStorage and closes itself/redirects
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Successful</title>
    </head>
    <body>
      <p>Authentication successful! Redirecting...</p>
      <script>
        // Clear any existing session (old admin or previous user)
        localStorage.removeItem('current-user-id');
        localStorage.removeItem('current-user-id-local');
        localStorage.removeItem('platform-users');
        localStorage.removeItem('user-credentials');

        // Store the new OAuth token and user
        localStorage.setItem('sentinel-auth-token', '${token}');
        localStorage.setItem('sentinel-current-user', '${user.id}');
        
        // Redirect back to main app
        window.location.href = '/';
      </script>
    </body>
    </html>
  `;
}
