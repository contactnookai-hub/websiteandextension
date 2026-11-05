#!/usr/bin/env bash
# Deploy the site to Cloudflare Pages. Usage: ./deploy.sh [project-name]   (default: trynook)
# Check `npx wrangler whoami` first: it deploys to whichever Cloudflare account is logged in.
set -euo pipefail
cd "$(dirname "$0")"
npx wrangler pages deploy public --project-name "${1:-trynook}" --branch main
