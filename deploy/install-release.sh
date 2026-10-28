#!/usr/bin/env bash
# Run as root only on a trusted, already provisioned TH-Server.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Root required'; exit 1; }
source_dir=$(realpath "${1:?Extracted release directory required}")
release_id=${2:?Release ID required}
[[ $release_id =~ ^[a-zA-Z0-9._-]+$ ]] || exit 1
[[ $(uname -m) == aarch64 ]] || { echo 'ARM64 required'; exit 1; }
for file in web/index.html server/index.js server/migrate.js runtime/bin/node node_modules/express/package.json deploy/nginx.conf deploy/th-ai.service; do test -f "$source_dir/$file"; done
id thai >/dev/null
[[ -f /etc/th-ai/runtime.env ]] || { echo 'Provision AI credentials first'; exit 1; }
[[ $(stat -c %U /etc/th-ai/runtime.env) == root ]] || exit 1
[[ $(stat -c %a /etc/th-ai/runtime.env) == 600 ]] || { echo 'runtime.env must have mode 600'; exit 1; }
nginx -t
# Reject a port collision before creating a first service.
if ! systemctl cat th-ai.service >/dev/null 2>&1 && ss -ltnH 'sport = :3100' | read -r _; then echo 'Port 3100 already in use'; exit 1; fi
# First install must not compete with an existing host configuration.
if [[ ! -e /etc/nginx/sites-enabled/th-ai ]] && nginx -T 2>&1 | sed '/^[[:space:]]*#/d' | grep -Eq 'server_name[^;]*ai\.th\.io\.vn'; then echo 'Existing AI hostname configuration; resolve before install'; exit 1; fi
install -d -m 755 /opt/th-ai/releases
install -d -o thai -g thai -m 700 /var/lib/th-ai/files
release=/opt/th-ai/releases/$release_id
[[ ! -e $release ]] || { echo 'Release already exists'; exit 1; }
mkdir "$release"
cp -a "$source_dir/." "$release/"
chown -R root:root "$release"
chmod -R go-w "$release"
# Only trusted AI-specific configuration may be sourced here.
set -a
source /etc/th-ai/runtime.env
set +a
[[ ${PORT:-} == 3100 && ${HOST:-} == 127.0.0.1 && ${FILES_ROOT:-} == /var/lib/th-ai/files ]] || { echo 'Invalid AI runtime paths'; exit 1; }
# Credentials must point to th_ai with th_ai_api, never the MES database.
"$release/runtime/bin/node" -e 'const u=new URL(process.env.DATABASE_URL);if(u.pathname!=="/th_ai"||u.username!=="th_ai_api")process.exit(1)'
(cd "$release" && runuser -u thai -- env DATABASE_URL="$DATABASE_URL" MIGRATIONS_DIR="$release/server/migrations" "$release/runtime/bin/node" server/migrate.js)
unset DATABASE_URL
old=$(readlink -f /opt/th-ai/current || true)
backup=$(mktemp -d /opt/th-ai/.rollback.XXXXXX)
for file in /etc/nginx/sites-available/th-ai /etc/systemd/system/th-ai.service; do [[ ! -f $file ]] || cp "$file" "$backup/$(basename "$file")"; done
rollback(){
 trap - ERR
 if [[ -n $old && -d $old ]]; then ln -sfn "$old" /opt/th-ai/.previous; mv -Tf /opt/th-ai/.previous /opt/th-ai/current; else rm -f /opt/th-ai/current; fi
 if [[ -f $backup/th-ai ]]; then cp "$backup/th-ai" /etc/nginx/sites-available/th-ai; else rm -f /etc/nginx/sites-enabled/th-ai /etc/nginx/sites-available/th-ai; fi
 if [[ -f $backup/th-ai.service ]]; then cp "$backup/th-ai.service" /etc/systemd/system/th-ai.service; else systemctl stop th-ai || true; rm -f /etc/systemd/system/th-ai.service; fi
 systemctl daemon-reload
 [[ -z $old ]] || systemctl restart th-ai || true
 nginx -t && systemctl reload nginx || true
 echo 'AI release rolled back. Database migrations remain applied.' >&2
}
trap rollback ERR
ln -s "$release" /opt/th-ai/.next
mv -Tf /opt/th-ai/.next /opt/th-ai/current
install -m 644 "$release/deploy/th-ai.service" /etc/systemd/system/th-ai.service
install -m 644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/th-ai
ln -sfn /etc/nginx/sites-available/th-ai /etc/nginx/sites-enabled/th-ai
nginx -t
systemctl daemon-reload
systemctl restart th-ai
ready=false
for attempt in {1..20}; do if curl --fail --silent --max-time 3 http://127.0.0.1:3100/api/ready >/dev/null; then ready=true; break; fi; sleep 1; done
[[ $ready == true ]]
systemctl reload nginx
curl --fail --silent --max-time 5 -H 'Host: ai.th.io.vn' http://127.0.0.1/api/ready >/dev/null
curl --fail --silent --max-time 5 -H 'Host: ai.th.io.vn' http://127.0.0.1/ >/dev/null
systemctl is-active --quiet th-app
curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health >/dev/null
systemctl enable th-ai
trap - ERR
rm -rf "$backup"
echo "AI release active: $release_id"
