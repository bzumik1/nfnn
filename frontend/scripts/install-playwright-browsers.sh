#!/usr/bin/env bash
set -uo pipefail

attempts=${PLAYWRIGHT_INSTALL_ATTEMPTS:-3}
seconds=${PLAYWRIGHT_INSTALL_SECONDS:-180}
playwright=${PLAYWRIGHT_INSTALL_BIN:-$PWD/node_modules/.bin/playwright}
apt_conf=${PLAYWRIGHT_INSTALL_APT_CONF:-/etc/apt/apt.conf.d/80-nfnn-ci-network}
mirrors=${PLAYWRIGHT_INSTALL_MIRRORS:-/etc/apt/apt-mirrors.txt}
read -r -a as_root <<< "${PLAYWRIGHT_INSTALL_AS_ROOT:-sudo}"

browsers=()
for argument in "$@"; do
  case "$argument" in
    --with-deps) echo "::error::$0 installs the system libraries itself; leave out --with-deps" >&2; exit 2 ;;
    -*) ;;
    *) browsers+=("$argument") ;;
  esac
done
[ "${#browsers[@]}" -gt 0 ] || { echo "::error::$0 needs the browsers to install" >&2; exit 2; }
[ -x "$playwright" ] || { echo "::error::$playwright is missing: run npm ci first" >&2; exit 2; }

printf '%s\n' 'Acquire::Retries "5";' 'Acquire::http::Timeout "20";' 'Acquire::https::Timeout "20";' \
  | "${as_root[@]}" tee "$apt_conf" > /dev/null

drop_azure_mirror() {
  [ -f "$mirrors" ] || return 0
  grep -q 'azure\.archive\.ubuntu\.com' "$mirrors" || return 0
  grep -v 'azure\.archive\.ubuntu\.com' "$mirrors" | grep -q '[a-z]' || return 0
  echo "Leaving out azure.archive.ubuntu.com for the next attempt"
  "${as_root[@]}" sed -i '/azure\.archive\.ubuntu\.com/d' "$mirrors"
}

attempt() {
  local what=$1 before_retry=$2
  shift 2
  local n
  for n in $(seq "$attempts"); do
    echo "$what, attempt $n of $attempts (at most ${seconds} s)"
    if "$@"; then
      return 0
    fi
    echo "::warning::$what: attempt $n of $attempts failed or ran out of time"
    [ "$n" -lt "$attempts" ] && "$before_retry"
  done
  echo "::error::$what: every attempt failed"
  return 1
}

repair_and_switch_mirror() {
  "${as_root[@]}" dpkg --configure -a > /dev/null 2>&1 || true
  drop_azure_mirror
}

nothing() { :; }

attempt "System libraries for ${browsers[*]}" repair_and_switch_mirror \
  "${as_root[@]}" env "PATH=$PATH" timeout --kill-after=15 "$seconds" "$playwright" install-deps "${browsers[@]}" \
  || exit 1

attempt "Playwright's ${browsers[*]}" nothing \
  timeout --kill-after=15 "$seconds" "$playwright" install "$@" \
  || exit 1
