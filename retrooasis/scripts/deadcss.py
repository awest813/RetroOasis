import re, io, glob, os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

used = set()
files = glob.glob('src/**/*.ts', recursive=True) + glob.glob('public/**/*.html', recursive=True) + ['index.html']
for f in files:
    if not os.path.exists(f):
        continue
    s = io.open(f, encoding='utf-8').read()
    for m in re.findall(r'class(?:Name)?="([^"]*)"', s):
        for c in re.split(r'[\s`]+', m):
            if c:
                used.add(c.strip())
    # escaped quotes inside nested template literals
    for m in re.findall(r'class=\\"([^\\]*)\\"', s):
        for c in re.split(r'\s+', m):
            if c:
                used.add(c.strip())
    for m in re.findall(r"classList\.(?:add|toggle|remove)\(([^)]*)\)", s):
        for c in re.findall(r"['\"]([^'\"]+)", m):
            for t in c.split(' '):
                if t:
                    used.add(t)
    # bare .ro-x tokens anywhere (data-attr selectors in JS, querySelector strings)
    for m in re.findall(r'\.((?:ro|xmb)-[a-zA-Z0-9_-]+)', s):
        used.add(m)

used |= {'is-active', 'ro-skeleton', 'ro-view'}

css = ''
for f in ['src/styles/base.css', 'src/styles/tokens.css', 'src/styles/xmb.css', 'src/styles/motion.css']:
    css += '\n/* %s */\n' % f + io.open(f, encoding='utf-8').read()

no_comments = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

selectors = []
depth = 0
cur = ''
for ch in no_comments:
    if ch == '{':
        if depth == 0:
            selectors.append(cur)
        depth += 1
        cur = ''
    elif ch == '}':
        depth -= 1
        cur = ''
    elif depth == 0:
        cur += ch

dead = {}
for sel in selectors:
    sel = re.sub(r':[a-zA-Z-]+(\([^)]*\))?', '', sel)
    sel = sel.strip()
    if not sel or sel.startswith('@'):
        continue
    for part in sel.split(','):
        part = part.strip()
        if not part:
            continue
        for m in re.findall(r'\.([a-zA-Z0-9_-]+)', part):
            if m not in used and m not in dead:
                dead[m] = part[:70]

print('=== CSS classes never referenced in TS/HTML ===')
for c in sorted(dead):
    print(c.ljust(34), '<-', dead[c])
print('total:', len(dead))
