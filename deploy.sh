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
#
# ОСТОРОЖНО: живой сайт собирается из нескольких веток (сайт, веб-приложение
# app/, оплата из-за рубежа…), и ни одна копия репозитория не равна серверу
# целиком. 20 октября 2026 этот скрипт в прежнем виде (rsync --delete всего
# дерева) запустили из старого main: он стёр новую стилистику, английскую
# главную, кабинет партнёра и откатил веб-приложение на неделю назад.
# Поэтому теперь:
#   - сначала пробный прогон: видно, что заменится и что удалилось бы;
#   - по умолчанию ничего не удаляется (удаление — только с --prune);
#   - если на сервере лежит файл, которого нет в истории ЭТОЙ ветки (его
#     выложили из другой ветки), выкладка останавливается — заменить такой
#     файл можно только с --force, посмотрев, откуда он;
#   - перед записью — полная копия сайта на сервере в /root;
#   - без --yes скрипт спрашивает «выложить?», а не спросив — не пишет.
#
# Запуск:
#   ./deploy.sh --dry-run          только показать, что изменится
#   ./deploy.sh                    показать и спросить
#   ./deploy.sh --yes              без вопроса (если чужих файлов нет)
#   ./deploy.sh --prune            ещё и удалить с сервера то, чего нет здесь
#   ./deploy.sh --force            заменить и чужие файлы (сначала --dry-run!)
#   ./deploy.sh [флаги] user@host  другой сервер
set -euo pipefail

SERVER="root@109.73.203.108"
REMOTE_DIR="/var/www/synapseapp"
DRY_RUN=0; YES=0; PRUNE=0; FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --yes|-y)     YES=1 ;;
    --prune)      PRUNE=1 ;;
    --force)      FORCE=1 ;;
    -h|--help)    sed -n '2,36p' "$0"; exit 0 ;;
    -*)           echo "Неизвестный флаг: $arg (см. ./deploy.sh --help)"; exit 64 ;;
    *)            SERVER="$arg" ;;
  esac
done

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Посетителю отдаётся только сайт. Исходники приложения, конфиг nginx и
# служебные скрипты сайту не нужны: раньше synapseapp.ru/android/local.properties
# и /deploy/nginx-site.conf отвечали 200.
EXCLUDES=(
  --exclude '.git' --exclude '.github'
  --exclude '/android' --exclude '/deploy'
  --exclude 'deploy.sh' --exclude 'stamp-assets.py'
  --exclude '.DS_Store' --exclude '.claude' --exclude '.claude-*'
)

echo "==> Откуда"
BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "(без ветки)")"
echo "    папка:  $ROOT"
echo "    ветка:  $BRANCH, коммит $(git log -1 --format='%h %ad %s' --date=short)"
DIRTY="$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
[ "$DIRTY" = "0" ] || echo "    в папке $DIRTY незакоммиченных правок — выложатся и они"
if [ "$BRANCH" = "(без ветки)" ]; then
  echo "    ВНИМАНИЕ: папка не на ветке (detached HEAD) — так и был выложен старый сайт 20 октября."
fi

# Версия на картинках перед выкладкой. Nginx велит браузеру держать их
# неделю, поэтому без штампа пересъёмка скринов не доходила до вернувшегося
# посетителя семь дней: html он получал новый, картинки брал из памяти.
# В пробном прогоне файлы не трогаем.
if [ "$DRY_RUN" = "0" ]; then
  echo "==> Версии картинок"
  python3 "$ROOT/stamp-assets.py"
fi

# Пробный прогон с --delete: он ничего не пишет, зато показывает всё сразу —
# и что заменится, и что на сервере лишнее.
echo "==> Сверка с $SERVER:$REMOTE_DIR"
rsync -az -c -n -i --delete "${EXCLUDES[@]}" "$ROOT/" "$SERVER:$REMOTE_DIR/" > "$TMP/plan"

: > "$TMP/new"; : > "$TMP/replace"; : > "$TMP/delete"
while IFS= read -r line; do
  path="${line:10}"
  case "$line" in
    "*deleting "*) case "$path" in */) ;; *) echo "$path" >> "$TMP/delete" ;; esac ;;
    "<f+++++"*)    echo "$path" >> "$TMP/new" ;;
    "<f"*)         echo "$path" >> "$TMP/replace" ;;
  esac
done < "$TMP/plan"

# Чей файл на сервере. Наш — если его содержимое совпадает с какой-нибудь
# версией этого файла в истории текущей ветки: значит, его выкладывали отсюда
# же, просто раньше, и заменить его новой версией безопасно. Не совпадает ни
# с одной — файл выложен из другой ветки, и замена откатит чужую работу.
if [ "$PRUNE" = "1" ]; then
  cat "$TMP/replace" "$TMP/delete" > "$TMP/check"
else
  cp "$TMP/replace" "$TMP/check"
fi
: > "$TMP/foreign"
if [ -s "$TMP/check" ]; then
  ssh "$SERVER" "cd '$REMOTE_DIR' && while IFS= read -r p; do [ -f \"\$p\" ] && printf '%s %s\n' \"\$(sha256sum < \"\$p\" | cut -d' ' -f1)\" \"\$p\"; done" \
    < "$TMP/check" > "$TMP/live"
  while IFS= read -r entry; do
    live_hash="${entry%% *}"; path="${entry#* }"
    ours=0
    for commit in $(git log --format=%H HEAD -- "$path"); do
      hash="$(git show "$commit:$path" 2>/dev/null | shasum -a 256 | cut -d' ' -f1)" || continue
      if [ "$hash" = "$live_hash" ]; then ours=1; break; fi
    done
    [ "$ours" = "1" ] || echo "$path" >> "$TMP/foreign"
  done < "$TMP/live"
fi

show() {  # заголовок, файл со списком
  local count; count="$(wc -l < "$2" | tr -d ' ')"
  [ "$count" = "0" ] && return 0
  echo "    $1: $count"
  head -n 40 "$2" | sed 's/^/        /'
  [ "$count" -le 40 ] || echo "        … и ещё $((count - 40))"
}
echo "==> Что изменится"
show "новые файлы" "$TMP/new"
show "заменятся" "$TMP/replace"
if [ "$PRUNE" = "1" ]; then
  show "УДАЛЯТСЯ с сервера" "$TMP/delete"
else
  show "есть только на сервере (не трогаем; удалить — --prune)" "$TMP/delete"
fi
if [ ! -s "$TMP/new" ] && [ ! -s "$TMP/replace" ] && { [ "$PRUNE" = "0" ] || [ ! -s "$TMP/delete" ]; }; then
  echo "    на сервере уже всё как здесь — выкладывать нечего"
  exit 0
fi

if [ -s "$TMP/foreign" ]; then
  echo
  echo "==> СТОП: на сервере есть файлы не из истории ветки «$BRANCH»."
  echo "    Их выложили из другой ветки; выкладка отсюда откатит ту работу:"
  head -n 40 "$TMP/foreign" | sed 's/^/        /'
  echo "    Сначала влейте ту ветку сюда. Заменить всё равно — --force,"
  echo "    но только если точно знаете, откуда эти файлы."
  [ "$FORCE" = "1" ] || exit 2
  echo "    --force: заменяю, как просили."
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "==> Пробный прогон: на сервере ничего не менялось"
  exit 0
fi

if [ "$YES" = "0" ]; then
  if [ -t 0 ]; then
    printf '==> Выложить на %s? [y/N] ' "$SERVER"
    read -r answer
    case "$answer" in y|Y|д|Д|да|Да) ;; *) echo "    отменено"; exit 1 ;; esac
  else
    echo "==> Не спрашиваю без терминала: запустите с --yes, посмотрев список выше."
    exit 1
  fi
fi

# Полная копия перед записью: вернуть сайт — одна команда tar.
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/synapse-web-before-deploy-$STAMP.tgz"
echo "==> Копия сайта на сервере: $BACKUP"
ssh "$SERVER" "tar -czf '$BACKUP' -C '$(dirname "$REMOTE_DIR")' '$(basename "$REMOTE_DIR")'"

echo "==> Файлы на $SERVER"
if [ "$PRUNE" = "1" ]; then
  rsync -az -c --delete --delete-excluded "${EXCLUDES[@]}" "$ROOT/" "$SERVER:$REMOTE_DIR/"
else
  rsync -az -c "${EXCLUDES[@]}" "$ROOT/" "$SERVER:$REMOTE_DIR/"
fi

echo "==> Проверка"
for path in / /app/ /account/ /checkout/ /pricing/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://synapseapp.ru$path")
  printf '    %-12s %s\n' "$path" "$code"
  [ "$code" = "200" ] || { echo "    ↑ не 200, выкладка подозрительная. Вернуть: ssh $SERVER \"tar -xzf $BACKUP -C $(dirname "$REMOTE_DIR")\""; exit 1; }
done
echo "==> Готово. Если что-то не так, вернуть прежний сайт:"
echo "    ssh $SERVER \"tar -xzf $BACKUP -C $(dirname "$REMOTE_DIR")\""
