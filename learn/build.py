#!/usr/bin/env python3
"""Nest Learn: builds index.html + one page per track from tracks/<slug>.json.

Each track JSON: slug, title, emoji, intro, sections[{title, points[]}], do[], ask[],
watch_out[], resources[{type, title, source, url, why, topic?}].
Run: python3 build.py
"""
import json
from html import escape as e
from pathlib import Path

ROOT = Path(__file__).parent
ORDER = ["cervix", "money", "body", "food", "water"]
TYPE_IC = {"article": "📄", "book": "📚", "video": "🎬", "place": "📍", "tool": "🧰", "podcast": "🎧"}
TYPE_NAME = {"article": "Read", "book": "Books", "video": "Watch", "place": "Go", "tool": "Tools", "podcast": "Listen"}
V = "20261115a"


def load():
    out = []
    for slug in ORDER:
        p = ROOT / "tracks" / f"{slug}.json"
        if p.exists():
            out.append(json.loads(p.read_text()))
    return out


def head(title, emoji):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#6C4CF5">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Nest Learn">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="robots" content="noindex, nofollow">
<title>{e(title)} · Nest Learn</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>{emoji}</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap">
<link rel="stylesheet" href="style.css?v={V}">
<link rel="stylesheet" href="learn.css?v={V}">
</head>
<body>
"""


def nav(tracks, current):
    tabs = [f'<a class="tab" href="index.html"{" aria-current=\"page\"" if current == "index" else ""}>Home</a>']
    for t in tracks:
        cur = ' aria-current="page"' if current == t["slug"] else ""
        tabs.append(f'<a class="tab" href="{t["slug"]}.html"{cur}>{e(t["title"])}</a>')
    icons = {"Home": "🏠", **{t["title"]: t["emoji"] for t in tracks}}
    return ('<nav class="nav"><div class="nav-in">\n  <a class="brandmark" href="index.html">📖 Nest Learn</a>\n  '
            + "\n  ".join(tabs) + "\n</div></nav>\n"
            + f"<script>window.NAV_ICON={json.dumps(icons, ensure_ascii=False)};</script>\n")


def foot():
    return f"""<footer class="lfoot">Nest Learn is for Sean &amp; Mishka. It helps you ask better questions, it doesn't replace a doctor, bank or advisor.
  <br>Sister app: <a href="../">🪺 The Nest</a></footer>
<script src="nav.js?v={V}"></script>
<script src="learn.js?v={V}"></script>
</body>
</html>
"""


def addbox(slug, title, tracks=None):
    """Send-a-find box: opens Telegram to Babybean with the link, so it gets broken down and added here."""
    chips = "".join(f'<button type="button" class="chip" aria-pressed="false" data-k="{k}">{TYPE_IC[k]} {n}</button>'
                    for k, n in [("book", "Book"), ("video", "Video"), ("article", "Article"), ("podcast", "Podcast"), ("place", "Place")])
    pick = ""
    if tracks:
        pick = ('<div class="qchips tpick" role="group" aria-label="Which track">'
                + "".join(f'<button type="button" class="chip" aria-pressed="false" data-t="{e(t["title"])}">{t["emoji"]} {e(t["title"])}</button>' for t in tracks)
                + '<button type="button" class="chip" aria-pressed="false" data-t="New topic">🆕 New topic</button></div>')
    return f"""<details class="addbox" data-track="{e(title)}"><summary><span class="pl">＋</span><span><b>Add a find</b>
<small>A book, video, article or place you came across. Babybean breaks it down and adds it here.</small></span></summary>
<div class="abd">{pick}<div class="qchips kpick" role="group" aria-label="What is it">{chips}</div>
<textarea placeholder="Paste the link, or the name of the book or video. Add a note if you want: why it caught your eye."></textarea>
<button type="button" class="sendbtn">Send to Babybean →</button>
<p class="how">Opens Telegram with your find ready to send. Babybean reads or watches it, writes the breakdown, and adds it to this page.</p></div></details>"""


def li(items):
    return "".join(f"<li>{e(x)}</li>" for x in items)


def track_page(t, tracks):
    slug = t["slug"]
    res = t.get("resources", [])
    types = [k for k in TYPE_IC if any(r.get("type") == k for r in res)]
    h = [head(t["title"], t["emoji"]), nav(tracks, slug), '<main class="wrap">']
    h.append(f'<p class="eyebrow"><span class="dot"></span>Nest Learn · track</p>')
    h.append(f'<h1>{t["emoji"]} {e(t["title"])}</h1>')
    h.append(f'<p class="sub">{e(t["intro"])}</p>')
    h.append(f'<div class="tprog" data-track="{slug}"><span class="lbl">Your progress</span>'
             f'<div class="bar"><span></span></div><small class="pc"></small></div>')
    h.append(addbox(slug, t["title"]))
    jumps = [("learn", "Understand"), ("do", "What we do"), ("ask", "Questions"), ("watch", "Watch out"), ("res", "Resources")]
    h.append('<nav class="jump" aria-label="Sections">' + "".join(f'<a href="#{a}">{b}</a>' for a, b in jumps) + "</nav>")

    # Understand: accordion sections, first open
    h.append('<section class="sec" id="learn"><h2>🧠 Understand it</h2><div class="accs">')
    for i, s in enumerate(t["sections"]):
        op = " open" if i == 0 else ""
        h.append(f'<details class="acc"{op}><summary><span class="n">{i+1}</span><span class="st"><b>{e(s["title"])}</b>'
                 f'<small>{len(s["points"])} key points</small></span></summary><div class="bd"><ul class="pts">{li(s["points"])}</ul></div></details>')
    h.append("</div></section>")

    h.append(f'<section class="sec" id="do"><h2>✅ What we actually do</h2><ul class="checks" data-track="{slug}">')
    for i, x in enumerate(t.get("do", [])):
        h.append(f'<li><label><input type="checkbox" data-ck="{slug}:do:{i}"><span>{e(x)}</span></label></li>')
    h.append("</ul></section>")

    if t.get("ask"):
        h.append(f'<section class="sec" id="ask"><h2>❓ Questions to ask</h2><p>Screenshot these or read them out.</p><ol class="asks">{li(t["ask"])}</ol></section>')
    if t.get("watch_out"):
        h.append(f'<section class="sec" id="watch"><h2>⚠️ Watch out for</h2><ul class="warns">{li(t["watch_out"])}</ul></section>')

    h.append(f'<section class="sec" id="res"><h2>📚 Resources</h2><p>Tap ✓ when you\'ve read, watched or been. It fills your progress bar.</p>')
    h.append('<div class="filt" role="group" aria-label="Filter"><button class="chip" aria-pressed="true" data-f="all">All</button>'
             + "".join(f'<button class="chip" aria-pressed="false" data-f="{k}">{TYPE_IC[k]} {TYPE_NAME[k]}</button>' for k in types) + "</div>")
    h.append('<div class="rlist">')
    for i, r in enumerate(res):
        ty = r.get("type", "article")
        key = f"{slug}:r:{r.get('url') or i}"
        mine = ' mine' if r.get("by") else ""
        tk = r.get("takeaways") or []
        brk = (f'<details class="brk"><summary>🧠 The breakdown · {len(tk)} key points</summary><ul>{li(tk)}</ul></details>' if tk else "")
        h.append(f'<article class="rc{mine}" data-type="{e(ty)}" data-rk="{e(key)}"><div class="rtop"><span class="ric">{TYPE_IC.get(ty, "📄")}</span>'
                 f'<div class="rtx"><b>{e(r["title"])}</b><small>{e(r.get("source", ""))}'
                 + (f' · found by {e(r["by"])}' if r.get("by") else "") + '</small></div></div>'
                 f'<p class="rwhy">{e(r.get("why", ""))}</p>{brk}<div class="racts">'
                 + (f'<a class="op" href="{e(r["url"])}" target="_blank" rel="noopener">Open ↗</a>' if r.get("url") else "")
                 + '<button type="button" class="done">✓ Done</button></div></article>')
    h.append("</div></section></main>")
    h.append(foot())
    return "\n".join(h)


def index_page(tracks):
    h = [head("Home", "📖"), nav(tracks, "index"), '<main class="wrap">']
    h.append('<p class="eyebrow"><span class="dot"></span>Sean &amp; Mishka</p>')
    h.append('<h1>Know how it <em>works</em>, then decide for yourselves.</h1>')
    h.append('<p class="sub">Every track asks the same four things: who pays, who decides, who profits, and what it means for us. '
             'The sources are real: regulators, doctors\' bodies, the data itself.</p>')
    h.append(addbox("", "", tracks))
    h.append('<div class="tgrid">')
    for t in tracks:
        n = len(t.get("resources", []))
        h.append(f'<a class="tcard" href="{t["slug"]}.html"><span class="tic">{t["emoji"]}</span><b>{e(t["title"])}</b>'
                 f'<small>{e(t["intro"].split(". ")[0].rstrip("."))}.</small>'
                 f'<div class="tprog mini" data-track="{t["slug"]}"><div class="bar"><span></span></div><small class="pc"></small></div>'
                 f'<span class="tmeta">{len(t["sections"])} topics · {n} resources</span></a>')
    h.append("</div>")
    h.append('<section class="sec"><h2>🗺️ Coming next</h2><p>AI, and insurance &amp; medical aid as a system. Tell Babybean which one you want first.</p></section>')
    h.append("</main>")
    totals = {t["slug"]: len(t.get("resources", [])) + len(t.get("do", [])) for t in tracks}
    h.append(f"<script>window.LEARN_TOTALS={json.dumps(totals)};</script>")
    h.append(foot())
    return "\n".join(h)


def main():
    tracks = load()
    (ROOT / "index.html").write_text(index_page(tracks))
    for t in tracks:
        (ROOT / f'{t["slug"]}.html').write_text(track_page(t, tracks))
    print("built", ["index"] + [t["slug"] for t in tracks])


if __name__ == "__main__":
    main()
