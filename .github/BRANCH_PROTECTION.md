# Branch Protection Rules for `main`

Branch protection rules cannot be set via code — they must be configured manually in GitHub Settings.

## Setup Instructions

1. Go to **Settings → Branches → Add ruleset**
2. Set the ruleset name (e.g. `Protect main`) and target branch pattern: `main`
3. Configure the following settings:

### Required Status Checks
- Enable **"Require status checks to pass before merging"**
- Add the required status check: **`build-and-test`** (this is the job name in `.github/workflows/ci.yml`)
- Enable **"Require branches to be up to date before merging"**

### Pull Request Requirements
- Enable **"Require a pull request before merging"**
- This blocks all direct pushes to `main` — all changes must go through a PR

### Push Restrictions
- Enable **"Block force pushes"**

### Bypass Policy
- Set **"Do not allow bypassing the above settings"** — this applies the rules to everyone, including admins and repository owners

## Why These Rules Matter

With these rules in place:
- A PR with a failing `build-and-test` CI job **cannot be merged** into `main`
- Nobody (including admins) can push broken code directly to `main`
- The deploy workflow (`.github/workflows/deploy.yml`) only triggers on pushes to `main`, so only code that passed CI can ever be deployed
