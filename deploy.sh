#!/usr/bin/env bash
# Выкладка сайта на московский сервер.
#
# ЭТО ТЕПЕРЬ ЕДИНСТВЕННЫЙ СПОСОБ ОБНОВИТЬ САЙТ. Раньше хватало `git push` —
# сайт жил на GitHub Pages за Cloudflare. 19 августа 2026 выяснилось, что у
# домашних провайдеров в России Cloudflare режут целиком: сайт не открывался
# без VPN, то есть витрина и оплата были недоступны тем, для кого сделаны.
# Домен переключён на этот сервер (российский IP, его не фильтруют).
#
# Пушить в GitHub всё равно нужно — там история и запасной вариант, — но
# посетители видят то, что лежит здесь.
set -euo pipefail

SERVER="${1:-root@109.73.203.108}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Версия на картинках перед выкладкой. Nginx велит браузеру держать их
# неделю, поэтому без штампа пересъёмка скринов не доходила до вернувшегося
# посетителя семь дней: html он получал новый, картинки брал из памяти.
echo "==> Версии картинок"
python3 "$ROOT/stamp-assets.py"

echo "==> Файлы на $SERVER"
rsync -az --delete \
  --exclude '.git' --exclude '.github' \
  --exclude 'android/app/build' --exclude 'android/.gradle' \
  --exclude 'deploy.sh' \
  "$ROOT/" "$SERVER:/var/www/synapseapp/"

echo "==> Проверка"
for path in / /app/ /account/ /checkout/ /pricing/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://synapseapp.ru$path")
  printf '    %-12s %s\n' "$path" "$code"
  [ "$code" = "200" ] || { echo "    ↑ не 200, выкладка подозрительная"; exit 1; }
done
echo "==> Готово"
