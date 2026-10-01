#!/usr/bin/env bash
# Roll the live release back (see deploy/deploy.sh) and restart the server on it. The scoreboard isn't rolled back:
# it lives in shared/, with a backup from before each deploy in shared/backups/.
#
# Usage:
#   X5_DEPLOY_HOST=user@your-server ./deploy/rollback.sh                   # the release before the live one
#   X5_DEPLOY_HOST=user@your-server ./deploy/rollback.sh 20260930101500    # a specific release
#   X5_DEPLOY_HOST=user@your-server ./deploy/rollback.sh --list            # the releases there are
# Optional: X5_DEPLOY_PATH (/var/www/x5-commander)

set -euo pipefail

HOST="${X5_DEPLOY_HOST:?Set X5_DEPLOY_HOST, e.g. user@your-server}"
REMOTE_PATH="${X5_DEPLOY_PATH:-/var/www/x5-commander}"

if [[ "${1:-}" == "--list" ]]; then
    ssh "$HOST" "cd '$REMOTE_PATH/releases' && live=\$(basename \"\$(readlink '$REMOTE_PATH/current')\") && for r in \$(ls -1t); do [ \"\$r\" = \"\$live\" ] && echo \"\$r  <- live\" || echo \"\$r\"; done"
    exit 0
fi

if [[ -n "${1:-}" ]]; then
    TARGET="$1"
else
    # The release just older than the live one.
    TARGET="$(ssh "$HOST" "cd '$REMOTE_PATH/releases' && ls -1t | grep -A1 -x \"\$(basename \"\$(readlink '$REMOTE_PATH/current')\")\" | sed -n 2p")"
fi

if [[ -z "$TARGET" ]]; then
    echo "No previous release found to roll back to." >&2
    exit 1
fi

TARGET_PATH="$REMOTE_PATH/releases/$TARGET"
echo "Rolling back current -> releases/$TARGET ..."
ssh "$HOST" "test -d '$TARGET_PATH' && ln -sfn '$TARGET_PATH' '$REMOTE_PATH/current' && systemctl --user restart x5-commander"
echo "Done. Live release: $TARGET"
