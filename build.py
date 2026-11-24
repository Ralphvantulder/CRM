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
icon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0073e6"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(12 12) scale(1.667)"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.8 3 2.6 3.5 5.2"/></g></svg>'''
(out/'icon.svg').write_text(icon)
(out/'manifest.webmanifest').write_text('{"name":"CRM","short_name":"CRM","start_url":"./#overzicht","scope":"./","display":"standalone","background_color":"#fafaf9","theme_color":"#ffffff","icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icon.svg","sizes":"any","type":"image/svg+xml"}]}\n')
print('ok', len(h))
