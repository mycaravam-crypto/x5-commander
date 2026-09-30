#!/usr/bin/env bash
# Build X5 Commander and deploy it as a new atomic release (the same layout as vanspace3d):
#   $REMOTE_PATH/releases/<timestamp>/   <- this deploy: dist/, server/, package.json
#   $REMOTE_PATH/current                 <- symlink, flipped at the end
#   $REMOTE_PATH/shared/scores.db        <- the scoreboard, kept across releases (backups in shared/backups/)
# The Node server (systemd user service x5-commander, see deploy/x5-commander.service) is restarted on the new
# release and health-checked; if it doesn't come up, the symlink flips back and the old release is restarted.
# Caddy proxies x5.vi0lins.de to it (deploy/Caddyfile, which also has the one-time server setup).
#
# Usage:
#   X5_DEPLOY_HOST=mycaravam@vi0lins.de ./deploy/deploy.sh
# Optional: X5_DEPLOY_PATH (/var/www/x5-commander) · X5_PORT (8095) · X5_KEEP_RELEASES (5) · X5_SKIP_TESTS=1
#
# Requires: SSH key access to the host (no password prompt), rsync, and the one-time setup in deploy/Caddyfile.

set -euo pipefail

HOST="${X5_DEPLOY_HOST:?Set X5_DEPLOY_HOST, e.g. mycaravam@vi0lins.de}"
REMOTE_PATH="${X5_DEPLOY_PATH:-/var/www/x5-commander}"
PORT="${X5_PORT:-8095}"
KEEP_RELEASES="${X5_KEEP_RELEASES:-5}"

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
RELEASE_PATH="$REMOTE_PATH/releases/$TIMESTAMP"
cd "$(dirname "$0")/.."

echo "Installing dependencies..."
npm ci
if [ "${X5_SKIP_TESTS:-}" != "1" ]; then
    echo "Testing..."
    npm test
fi
echo "Building..."
npm run build

echo "Checking the server's Node..."
NODE="$(ssh "$HOST" 'command -v node || true')"
if [ -z "$NODE" ] || ! ssh "$HOST" "'$NODE' -e \"const [a,b]=process.versions.node.split('.').map(Number); if (a < 22 || a === 22 && b < 18) process.exit(1); require('node:sqlite')\" 2>/dev/null"; then
    echo "Node 22.18+ with node:sqlite is needed on $HOST (found: ${NODE:-none}). See deploy/Caddyfile for the one-time setup." >&2
    exit 1
fi
echo "Node: $NODE ($(ssh "$HOST" "'$NODE' --version"))"

echo "Backing up the scoreboard..."
ssh "$HOST" "mkdir -p '$REMOTE_PATH/shared/backups' && cd '$REMOTE_PATH/shared' && if [ -f scores.db ]; then
    '$NODE' --disable-warning=ExperimentalWarning -e \"new (require('node:sqlite').DatabaseSync)('scores.db').exec(\\\"VACUUM INTO 'backups/scores-$TIMESTAMP.db'\\\")\" &&
    ls -1t backups | tail -n +11 | xargs -r -I{} rm -f -- 'backups/{}'; fi"

echo "Uploading release $TIMESTAMP ..."
ssh "$HOST" "mkdir -p '$RELEASE_PATH/server'"
rsync -az --delete dist/ "$HOST:$RELEASE_PATH/dist/"
rsync -az server/index.ts server/scores.ts "$HOST:$RELEASE_PATH/server/"
rsync -az package.json "$HOST:$RELEASE_PATH/"

echo "Installing the service..."
sed -e "s#@PATH@#$REMOTE_PATH#g" -e "s#@NODE@#$NODE#g" -e "s#@PORT@#$PORT#g" deploy/x5-commander.service |
    ssh "$HOST" 'mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/x5-commander.service && systemctl --user daemon-reload && systemctl --user enable x5-commander >/dev/null 2>&1'

PREVIOUS="$(ssh "$HOST" "readlink '$REMOTE_PATH/current' || true")"
echo "Flipping current -> releases/$TIMESTAMP (was: ${PREVIOUS:-none}) ..."
ssh "$HOST" "ln -sfn '$RELEASE_PATH' '$REMOTE_PATH/current' && systemctl --user restart x5-commander"

# Up when /healthz answers ok on the new release (30 s).
healthy() {
    ssh "$HOST" "for i in \$(seq 30); do '$NODE' -e \"fetch('http://127.0.0.1:$PORT/healthz').then(r => r.text()).then(t => process.exit(t === 'ok' ? 0 : 1), () => process.exit(1))\" && exit 0; sleep 1; done; exit 1"
}
if ! healthy; then
    echo "New release failed its health check. Last log lines:" >&2
    ssh "$HOST" 'journalctl --user -u x5-commander -n 30 --no-pager' >&2 || true
    if [ -n "$PREVIOUS" ]; then
        echo "Rolling back to $PREVIOUS ..." >&2
        ssh "$HOST" "ln -sfn '$PREVIOUS' '$REMOTE_PATH/current' && systemctl --user restart x5-commander"
        healthy && echo "Previous release is back up." >&2 || echo "Previous release is NOT healthy either: check the server." >&2
    fi
    exit 1
fi

echo "Pruning old releases (keeping last $KEEP_RELEASES) ..."
ssh "$HOST" "cd '$REMOTE_PATH/releases' && ls -1t | tail -n +$((KEEP_RELEASES + 1)) | grep -vx '$TIMESTAMP' | xargs -r rm -rf --"

echo "Done. Live release: $TIMESTAMP · https://x5.vi0lins.de"
