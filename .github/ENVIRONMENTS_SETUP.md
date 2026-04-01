# GitHub Environments & Secrets Setup

These steps must be performed manually in GitHub Settings to enable the production approval gate and Heroku deployments.

## Step 1 — Create the `production` Environment

1. Go to **Settings → Environments → New environment**
2. Name it exactly: **`production`**
3. Click **Configure environment**
4. Under **Deployment protection rules**, enable **"Required reviewers"**
5. Add the repo owner (**`umerslone`**) as a required reviewer
6. Save the environment

This ensures every deployment to Heroku production requires manual approval before it proceeds. The `deploy-production` job in `.github/workflows/deploy.yml` uses `environment: production`, so it will pause and wait for your approval on every merge to `main`.

## Step 2 — Add GitHub Actions Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add the following secrets:

| Secret Name | Description |
|-------------|-------------|
| `HEROKU_API_KEY` | Your Heroku API key (found in Heroku Account Settings) |
| `HEROKU_STAGING_APP_NAME` | The name of your Heroku staging app (e.g. `my-app-staging`) |
| `HEROKU_PROD_APP_NAME` | The name of your Heroku production app (e.g. `my-app-prod`) |
| `HEROKU_EMAIL` | The email address associated with your Heroku account |

These secrets are referenced in `.github/workflows/deploy.yml` and are required for both staging and production deployments to work.

## How the Full Flow Works After Setup

```
Feature branch → PR opened
       ↓
CI runs (lint + type check + build) — job name: build-and-test
       ↓
❌ CI fails? → PR is blocked from merging (branch protection rule)
✅ CI passes? → PR can be reviewed and merged
       ↓
Merge to main
       ↓
deploy.yml triggers automatically
       ↓
Staging deploys to Heroku automatically
       ↓
You receive an approval request → click Approve
       ↓
Production deploys to Heroku
```
