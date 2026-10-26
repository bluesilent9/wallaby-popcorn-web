#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} != --build ]]; then
    echo 'Source preparation only. After reboot, run: bash packaging/build-web-deb.sh --build [output-directory]'
    exit 0
fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
output=${2:-"$repo/artifacts"}
mkdir -p "$output"
output=$(cd "$output" && pwd)
command -v node >/dev/null
command -v dpkg-deb >/dev/null
[[ $(node -p "require('./package.json').version") == 12.2.0 ]]
[[ -f node_modules/webpack/bin/webpack.js ]]
# Run sequentially: no concurrent targets or architecture builds.
export NODE_ENV=production
export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=4096}
node node_modules/webpack/bin/webpack.js --config packaging/webpack.low-memory.cjs
[[ -s dist/index.html && -s dist/serviceworker.js ]]
stage=$(mktemp -d "$output/.wallaby-web-package.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/DEBIAN" "$stage/usr/share/wallaby-popcorn/web" "$stage/usr/share/doc/wallaby-popcorn-web"
cp -a dist/. "$stage/usr/share/wallaby-popcorn/web/"
cp LICENSE "$stage/usr/share/doc/wallaby-popcorn-web/copyright"
cp docs/server-web.md "$stage/usr/share/doc/wallaby-popcorn-web/README.md"
cat > "$stage/DEBIAN/control" <<'CONTROL'
Package: wallaby-popcorn-web
Version: 12.2.0-0wallaby1
Section: web
Priority: optional
Architecture: all
Maintainer: Wallaby Popcorn maintainers <wallaby-popcorn@users.noreply.github.com>
Recommends: jellyfin-server (>= 12.2), jellyfin-server (<< 12.3~)
Description: Wallaby Popcorn web interface for Jellyfin Server 12.2
 Server-delivered desktop and web TV interface, retaining mobile layouts.
 Installs separately and does not change the active server web directory.
CONTROL
chmod -R a+rX "$stage"
dpkg-deb --root-owner-group --build "$stage" "$output/wallaby-popcorn-web_12.2.0-0wallaby1_all.deb"
(cd "$output" && sha256sum wallaby-popcorn-web_12.2.0-0wallaby1_all.deb > wallaby-popcorn-web_12.2.0-0wallaby1_all.deb.sha256)
# Like upstream's jellyfin metapackage, one overall server installer selects components.
meta=$(mktemp -d "$output/.wallaby-server-package.XXXXXXXX")
trap 'rm -rf -- "$stage" "$meta"' EXIT
mkdir -p "$meta/DEBIAN" "$meta/usr/share/doc/wallaby-popcorn-server"
cp docs/server-web.md "$meta/usr/share/doc/wallaby-popcorn-server/README.md"
cat > "$meta/DEBIAN/control" <<'CONTROL'
Package: wallaby-popcorn-server
Version: 12.2.0-0wallaby1
Section: metapackages
Priority: optional
Architecture: all
Maintainer: Wallaby Popcorn maintainers <wallaby-popcorn@users.noreply.github.com>
Depends: wallaby-popcorn-web (= 12.2.0-0wallaby1), jellyfin-server (>= 12.2), jellyfin-server (<< 12.3~), jellyfin-ffmpeg8
Description: Wallaby Popcorn Server components
 Installs the matching Wallaby web interface and Jellyfin server backend.
 Web directory activation is documented separately; networking is unchanged.
CONTROL
chmod -R a+rX "$meta"
dpkg-deb --root-owner-group --build "$meta" "$output/wallaby-popcorn-server_12.2.0-0wallaby1_all.deb"
(cd "$output" && sha256sum wallaby-popcorn-server_12.2.0-0wallaby1_all.deb > wallaby-popcorn-server_12.2.0-0wallaby1_all.deb.sha256)
echo 'Built server installer and web-assets package. No backend compilation, installation, service restart or network change performed.'
