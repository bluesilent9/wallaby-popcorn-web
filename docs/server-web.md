# Wallaby Popcorn server web interface

Development source; stop before the production build until the user has rebooted.

## Upstream and compatibility

This is the server-delivered frontend, forked from **jellyfin/jellyfin-web v12.2** (61b1f890365ad15138e943e694af723c1d47df2a), matching the inspected server's Jellyfin Server and Web 12.2 packages. Upstream keeps the backend in `jellyfin/jellyfin` and this interface in `jellyfin/jellyfin-web`; no backend fork or networking change is needed for these UI changes. Keep the upstream version 12.2.0; the DEB has a Wallaby packaging revision.

Desktop and TV web layouts use the same modern view system, with Standard alongside Grid/List in the existing menu. Each user/library remembers its view on that device. Mobile and legacy mobile keep upstream rendering, images, pagination and preferences. A native Android TV client renders its own interface: deploying these web assets does not redesign it.

The desktop client remains a wrapper around the server interface with its existing SSH connection. These changes are compiled into the server's frontend source, not injected by the client into received HTML.

## Design and navigation

Standard View has a fixed title/year list and independent scroll area, a fixed details panel, dimmed full-screen fanart and technical media details. Original language comes only from scraped OriginalLanguage, never guessed from audio tracks. All three browse modes share bounded data batches (100 entries per request, maximum eight cached batches) and virtual rendering. The request size is internal, not a user filter or total library limit. Native sort/filter/alphabet queries and item actions remain in use. Only an explicit playback/queue action gathers the complete matching queue; this does not expand the browsing cache.

Artwork holds for one second, preloads/decodes and crossfades without clearing the previous image. Home uses the Wallaby cinema artwork for library tiles or no hovered title. Escape returns details to their originating library and saved position, then Home. Browser tabs cannot generally close themselves; Home Escape requests native exit only when a native host exposes it. Backslash toggles fullscreen using the standard browser/native fullscreen support. The user menu, dashboard tools, administrator permissions and playback controls retain upstream behavior.

## Source checks (no production build)

Use the Node version in `.nvmrc` and npm 11. Install with `npm ci --ignore-scripts`. The lockfile adds the missing transitive `@noble/hashes` resolutions required by the upstream lock. Then:

```sh
node node_modules/typescript/bin/tsc --noEmit
TMPDIR="$PWD/.test-tmp" node node_modules/vitest/vitest.mjs run src/wallaby --maxWorkers=1 --no-file-parallelism
```

Create `.test-tmp` first. No webpack dev server or production bundle is needed for these checks.

## Build after reboot

```sh
bash packaging/build-web-deb.sh --build /absolute/output/directory
```

Jellyfin presents the server as one product but packages a `jellyfin` metapackage, `jellyfin-server` backend and `jellyfin-web` frontend. On the inspected server `jellyfin` depends on both components and `jellyfin-ffmpeg8`; the backend itself merely recommends the web package. Wallaby mirrors that component relationship: **wallaby-popcorn-server** is the overall installer, depending on an exact matching **wallaby-popcorn-web**, the compatible Jellyfin backend and FFmpeg. Source repositories remain separate; dependencies refer to binary packages, not repositories. A separate backend fork is only needed when backend source changes are required.

This runs one production webpack build with one minifier process, then packages architecture-independent web files as `wallaby-popcorn-web_12.2.0-0wallaby3_all.deb`. The same command also assembles the tiny `wallaby-popcorn-server_12.2.0-0wallaby3_all.deb` installer package; this is packaging, not a second application compilation. It does not build or replace the server backend. Initial deployment target: the inspected Ubuntu 26.04 server running Jellyfin 12.2. No build, runtime or deployment success is implied by source checks.

## Later installation and activation

Install both local DEBs together with APT so the overall server installer can resolve its matching web package. APT cannot download unpublished Wallaby dependencies automatically; a later APT repository could provide them. Installing the web DEB puts assets at `/usr/share/wallaby-popcorn/web`, separate from the APT-managed `/usr/share/jellyfin/web`. There are deliberately no maintainer scripts that activate or restart anything. Keep the existing jellyfin-web package available for rollback.

After verifying the built package and agreeing a deployment window, install it with APT and create an **additional**, separately named systemd drop-in, preserving the existing service configuration. On the inspected service the activation override would be:

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/jellyfin --webdir=/usr/share/wallaby-popcorn/web $JELLYFIN_FFMPEG_OPT $JELLYFIN_SERVICE_OPT $JELLYFIN_NOWEBAPP_OPT $JELLYFIN_ADDITIONAL_OPTS
```

Recheck the installed service command before applying this; do not blindly override a changed unit. Back up the current unit/drop-ins, reload systemd and restart Jellyfin during that later deployment. This changes only the web-directory argument. Do not modify SSH, listeners, addresses, firewall, accounts, key restrictions, proxy settings or IPv4/IPv6 configuration. Older clients must remain able to connect.

Rollback: remove only the new Wallaby web-directory drop-in, reload systemd and restart. The original `/etc/default/jellyfin` web setting and APT files stay intact. Clear stale web/service-worker caches when validating the new interface or rollback. Verify a phone, desktop and web TV separately before calling this stable.

## Branding and licence

Visible desktop/TV product strings use Wallaby Popcorn; explicit Jellyfin Server strings use Wallaby Popcorn Server. Protocol names, API fields, upstream links and legal attribution remain. Artwork is reused from the existing Wallaby Popcorn desktop assets. Jellyfin source remains GPL-2.0-or-later; retain LICENSE and upstream credits.

## Development correction after first live test

The first live web build exposed a container-layout collision that mocked DOM tests missed. The native ItemsContainer now owns the grid directly, its scoped selector outranks late native card styles, and the virtual offset wrapper no longer carries the shared itemsContainer class. No display:contents wrapper is needed. Grid, List and Standard share that structure. A no-build CSS fixture at tests/wallaby-layout/serve.py reproduces the original collapse and checks the corrected structure against native card/list CSS extracted from the prior build.

Escape navigation now accepts both browser key events (including legacy keyCode 27) and native desktop/TV Back commands dispatched through Jellyfin inputManager. Visible menus/dialogs and playback retain their handlers; invisible retained overlays do not block navigation. No desktop client source change is needed for this fix.

The next package revision is 12.2.0-0wallaby3; the Jellyfin source version stays 12.2.0. Stop before rebuilding until the user has rebooted and authorized the next build. Keep the restored original interface active on the server in the meantime.


## Playback visibility and Escape correction (revision 3)

The themed root wrapper is now unstyled on `/video`, and its artwork is not rendered there. Jellyfin mounts HTML video separately at the start of document.body; the opaque isolated browsing wrapper could cover that layer (and native embedded video). Browsing layouts remain themed. Escape and native Back on the video route return to the captured originating route, including its query. Leaving the player invokes Jellyfin's existing viewbeforehide stop/release/fullscreen cleanup. Open menus and dialogs retain their own Back handling; mobile behavior remains upstream.

Source verification: 26 focused tests passed, TypeScript passed, ESLint reported zero errors and the same three existing warnings. No production build or playback-on-server verification has been performed for this revision. Stable was not created or changed. Wait for reboot and explicit build authorization.
