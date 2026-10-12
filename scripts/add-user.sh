#!/usr/bin/env bash
# Create a Cognito account for someone new. See docs/deploy.md "Create accounts".
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: scripts/add-user.sh <username> <email>" >&2
  echo "  USER_POOL_ID defaults to the UserPoolId output of the recipe-book stack" >&2
  echo "  APP_URL (optional) is printed in the instructions for the new person" >&2
  exit 1
fi
username=$1
email=$2

pool=${USER_POOL_ID:-$(aws cloudformation describe-stacks --stack-name recipe-book \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)}

aws cognito-idp admin-create-user \
  --user-pool-id "$pool" --username "$username" \
  --user-attributes Name=email,Value="$email" Name=email_verified,Value=true \
  --message-action SUPPRESS
# Only clears Cognito's initial challenge; the app client has no password flow.
aws cognito-idp admin-set-user-password \
  --user-pool-id "$pool" --username "$username" \
  --password "$(openssl rand -base64 24)" --permanent

cat <<MSG

Created $username ($email). Tell them:
  1. Open ${APP_URL:-<app url>}/#/login (the sign-in link is hidden from visitors)
  2. Enter the username "$username"
  3. Choose "Email me a code instead" and enter the code from their inbox
  4. Accept the "Add a passkey" banner; after that it is Face ID/fingerprint only
MSG
