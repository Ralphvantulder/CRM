import sys, pathlib
S = pathlib.Path(__file__).parent; src = S/'src'
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else S); out.mkdir(parents=True, exist_ok=True)
h = (src/'shell.html').read_text()
js = (src/'app.js').read_text()
js = js.replace("'%%SUPABASE_URL%%'", "'https://vieqteitlgmspjirgbzq.supabase.co'").replace("'%%SUPABASE_KEY%%'", "'sb_publishable_I8jtbvstxaiovaL0f5jXGw_usVp8rl3'")
parts = {'/*TEMPLATE_CSS*/': (src/'template.css').read_text(), '/*APP_CSS*/': (src/'app.css').read_text(),
         '/*TEMPLATE_TAIL_CSS*/': (src/'template-tail.css').read_text(), '<!--ICONS-->': (src/'icons.svg').read_text(),
         '/*SUPABASE_JS*/': (src/'supabase.js').read_text(), '/*APP_JS*/': js}
for k, v in parts.items():
    assert h.count(k) == 1, k
    assert '</script' not in v.lower() or k == '<!--ICONS-->', k
    h = h.replace(k, v)
assert '%%SUPABASE' not in js
(out/'index.html').write_text(h)
(out/'icon.svg').write_text((src/'logo.svg').read_text())  # logo: bron in src/logo.svg (ook als symbool i-logo in icons.svg)
(out/'manifest.webmanifest').write_text('{"name":"CRM","short_name":"CRM","start_url":"./#overzicht","scope":"./","display":"standalone","background_color":"#fafaf9","theme_color":"#ffffff","icons":[{"src":"icon-192.png?v=2","sizes":"192x192","type":"image/png"},{"src":"icon-512.png?v=2","sizes":"512x512","type":"image/png"},{"src":"icon.svg","sizes":"any","type":"image/svg+xml"}]}\n')
print('ok', len(h))
