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
// Common OAuth User Processing
// ============================================================================
async function processOAuthUser(profile) {
  const sql = getSql();
  
  // 1. Find existing user by email or provider ID
  let user;
  
  if (profile.provider === "google") {
    user = await sql`SELECT * FROM sentinel_users WHERE google_id = ${profile.providerId} OR email = ${profile.email} LIMIT 1`;
  } else if (profile.provider === "github") {
    user = await sql`SELECT * FROM sentinel_users WHERE github_id = ${profile.providerId} OR email = ${profile.email} LIMIT 1`;
  }
  
  if (user && user.length > 0) {
    user = user[0];
    
    // Update existing user with provider ID if missing
    if (profile.provider === "google" && !user.google_id) {
      await sql`UPDATE sentinel_users SET google_id = ${profile.providerId} WHERE id = ${user.id}`;
    } else if (profile.provider === "github" && !user.github_id) {
      await sql`UPDATE sentinel_users SET github_id = ${profile.providerId} WHERE id = ${user.id}`;
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
        github_id
      ) VALUES (
        ${crypto.randomUUID()},
        ${profile.email}, 
        ${profile.fullName}, 
        'USER', 
        true, 
        ${profile.avatarUrl || null},
        ${profile.provider === 'google' ? profile.providerId : null},
        ${profile.provider === 'github' ? profile.providerId : null}
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

    // 4. Create a 7-day BASIC trial subscription
    const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const subId = crypto.randomUUID();
    await sql`
      INSERT INTO sentinel_user_subscriptions
        (id, user_id, organization_id, tier, status, assigned_by, expires_at, auto_renew)
      VALUES
        (${subId}, ${user.id}, ${orgId}, 'BASIC', 'ACTIVE', ${user.id}, ${trialExpiresAt}::TIMESTAMPTZ, false)
    `;

    console.log(`[oauth] New user provisioned: ${profile.email} | org: ${orgId} | trial expires: ${trialExpiresAt}`);
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
