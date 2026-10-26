"""Serve a CSS regression fixture without compiling or starting the app/server.

Uses the native DOM hierarchy, source Wallaby CSS and existing compiled Jellyfin
card/list CSS. A prior dist tree is required only for upstream style fixtures.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
# Extract existing native card/list rules only; no Sass/webpack compilation.
import re
native = []
for css in (ROOT / 'dist').glob('main.jellyfin.*.css'):
    for rule in re.findall(r'[^{}]*\{[^{}]*\}', css.read_text()):
        selector = rule.partition('{')[0]
        if 'wallaby' not in selector and re.search(r'\.(itemsContainer|vertical-list|card|portraitCard|listItem)', selector):
            native.append(rule)
UPSTREAM = '\n'.join(native)
assert UPSTREAM, 'Existing native Jellyfin card styles are required; do not rebuild for this fixture.'
OLD_STYLE = subprocess.check_output(['git', 'show', '530f739:src/wallaby/wallaby.scss'], cwd=ROOT, text=True)

HTML = '''<!doctype html><html class="layout-desktop" dir="ltr"><meta charset="utf-8">
<title>Wallaby library CSS regression fixture</title>
<link rel="stylesheet" href="/wallaby.css">
<!-- Native card CSS deliberately loads last to reproduce the production collision. -->
<link rel="stylesheet" href="/upstream.css">
<style>
body { margin:0; background:#160d22; color:#fff4df; font:18px system-ui; }
.wallaby-screen { min-height:100vh; --wallaby-appbar-height:64px; }
nav { position:fixed; top:0; right:30px; height:64px; display:flex; align-items:center; gap:12px; }
nav button { padding:9px 18px; background:#f6c66a; border:0; border-radius:6px; color:#261636; }
.wallaby-backdrop { background:radial-gradient(ellipse at 80% 30%,#513368,#160d22 70%); }
.cardPadder-portrait { padding-bottom:150%; background:linear-gradient(150deg,#2b6070,#80466e); }
.cardText { color:#fff4df; }
.listItem { height:82px; }
.listItemImage { width:60px; height:80px; background:linear-gradient(150deg,#2b6070,#80466e); }
.wallaby-title-row { box-sizing:border-box; }
</style>
<div class="wallaby-screen"><div class="wallaby-backdrop"></div><nav>
<span>Movies</span><button data-view="grid">Grid</button><button data-view="list">List</button><button data-view="standard">Standard</button>
</nav><div class="wallaby-library-workspace"><div class="wallaby-library-scroll" role="grid" tabindex="0"><div class="wallaby-library-range"><div class="wallaby-library-window"><div class="itemsContainer wallaby-library-cells"></div></div></div></div><aside class="wallaby-detail-panel"><h1>Sample film 01</h1><p class="wallaby-meta">1987 · PG · 106 min · ★ 6.8</p><p>Browser layout regression fixture using fictional titles. The stylesheet and native item-container structure come from the application source.</p><section class="wallaby-technical"><div class="wallaby-badges"><div>▱ <strong>720p · H.264</strong></div><div>♫ <strong>AAC · Stereo</strong></div></div><p>Subtitles: <span class="wallaby-language">En</span></p><p>Original language: English</p></section><a class="wallaby-open-details" href="#details">Open details &amp; playback</a></aside></div></div>
<script type="module">
const old = new URLSearchParams(location.search).has('before');

const workspace=document.querySelector('.wallaby-library-workspace');
const viewport=document.querySelector('.wallaby-library-scroll');
const range=document.querySelector('.wallaby-library-range');
let layer=document.querySelector('.wallaby-library-window');
let cells=layer.firstElementChild;
if(old) { layer.className='itemsContainer wallaby-library-cells'; cells.className='itemsContainer wallaby-native-items'; }
let mode=new URLSearchParams(location.search).get('view') || 'standard';
function render() {
 workspace.classList.toggle('standard',mode==='standard');
 document.querySelector('aside').hidden=mode!=='standard';
 const columns=mode==='grid'?Math.min(12,Math.max(1,Math.floor(viewport.clientWidth/190))):1;
 const height=mode==='standard'?64:(mode==='list'?104:Math.round(viewport.clientWidth/columns*1.5+75));
 range.style.height=Math.ceil(1171/columns)*height+'px';
 const start=Math.max(0,Math.floor(viewport.scrollTop/height)-3)*columns;
 const end=Math.min(1171,(Math.ceil((viewport.scrollTop+viewport.clientHeight)/height)+3)*columns);
 layer.style.top=Math.floor(start/columns)*height+'px';
 if(old) layer.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;
 else layer.style.setProperty('--wallaby-library-columns',columns);
 cells.innerHTML=Array.from({length:Math.max(0,end-start)},(_,offset)=> {
  const index=start+offset;
  const title='Sample film '+String(index+1).padStart(2,'0');
  let content=`<a class="wallaby-title-row" href="#details"><strong>${title}</strong><span>${1987+index%30}</span></a>`;
  if(mode==='grid') content=`<div class="card portraitCard"><div class="cardBox"><div class="cardScalable"><div class="cardPadder-portrait"></div></div><div class="cardText">${title}</div></div></div>`;
  if(mode==='list') content=`<div class="listItem"><div class="listItemImage"></div><div class="listItemBody"><div class="listItemBodyText">${title}</div></div><div class="listItemMediaInfo">1h 46m</div></div>`;
  return `<div class="wallaby-library-cell" data-wallaby-index="${index}" style="height:${height}px">${content}</div>`;
 }).join('');
 document.body.dataset.mode=mode;
 document.body.dataset.columns=columns;
}
document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.view;viewport.scrollTop=0;render();}));
viewport.addEventListener('scroll',render);
window.addEventListener('resize',render);
render();
</script></html>'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        resources = {
            '/': ('text/html', HTML),
            '/wallaby.css': ('text/css', (ROOT/'src/wallaby/wallaby.scss').read_text()),
            '/upstream.css': ('text/css', UPSTREAM),
            '/before.css': ('text/css', OLD_STYLE),
        }
        resource = resources.get(self.path.split('?')[0])
        if not resource:
            self.send_error(404)
            return
        mime, value = resource
        if self.path.startswith('/?') and 'before=1' in self.path:
            value = value.replace('href="/wallaby.css"', 'href="/before.css"')
        body = value.encode()
        self.send_response(200)
        self.send_header('Content-Type', mime+'; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv)>1 else 8766), Handler)
    print(f'CSS regression fixture: http://127.0.0.1:{server.server_port}', flush=True)
    server.serve_forever()
