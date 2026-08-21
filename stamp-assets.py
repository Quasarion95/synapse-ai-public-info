#!/usr/bin/env python3
"""Штамп версии на картинках: <img src="screens/a.png?v=3f2a1c">.

Зачем. Nginx велит браузеру держать картинки неделю (max-age=604800) — это
правильно, они тяжёлые и меняются редко. Но из-за этого ЛЮБАЯ пересъёмка
скринов не доходила до вернувшегося посетителя семь дней: html он получал
новый, а картинки брал из своей памяти по тому же адресу.

Штамп — короткий хэш самого файла. Поменялся файл — поменялся адрес —
браузер идёт за новым. Не поменялся — адрес прежний, и кэш работает как
задумано. Запускается из deploy.sh перед выкладкой, руками звать не нужно.
"""
from __future__ import annotations
import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
EXT = ("png", "jpg", "jpeg", "svg", "webp", "ico")
# Картинки, которые ищем в разметке: относительные пути, без внешних адресов.
PATTERN = re.compile(
    r'((?:src|href)=")([^":]+?\.(?:' + "|".join(EXT) + r'))(?:\?v=[0-9a-f]+)?(")'
)

def short_hash(path: pathlib.Path) -> str | None:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()[:8]
    except OSError:
        return None

def stamp(html_path: pathlib.Path) -> int:
    text = html_path.read_text(encoding="utf-8")
    changed = 0

    def repl(m):
        nonlocal changed
        head, url, tail = m.group(1), m.group(2), m.group(3)
        target = (html_path.parent / url).resolve()
        digest = short_hash(target)
        if digest is None:
            return m.group(0)          # файла нет — не трогаем
        new = f'{head}{url}?v={digest}{tail}'
        if new != m.group(0):
            changed += 1
        return new

    updated = PATTERN.sub(repl, text)
    if updated != text:
        html_path.write_text(updated, encoding="utf-8")
    return changed

total = 0
for page in sorted(ROOT.rglob("*.html")):
    if "android/app/build" in str(page) or "/.git/" in str(page):
        continue
    n = stamp(page)
    if n:
        print(f"  {page.relative_to(ROOT)}: {n}")
        total += n
print(f"проштамповано ссылок: {total}")
