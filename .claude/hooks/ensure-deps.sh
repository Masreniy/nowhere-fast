#!/usr/bin/env bash
# Ставит зависимости в начале сессии, чтобы `npm test` работал сразу.
#
# Нужен прежде всего веб-сессиям и облачным агентам: там репозиторий клонируется
# заново, node_modules отсутствуют, и первая же попытка прогнать тесты падает
# не из-за кода, а из-за отсутствия jsdom.
#
# Вызывается как SessionStart. Если зависимости на месте — выходит мгновенно.

set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -f "$root/package.json" ] || exit 0
[ -d "$root/node_modules" ] && exit 0

cd "$root" || exit 0

if npm install --no-audit --no-fund --silent >/dev/null 2>&1; then
    echo '{"systemMessage":"Зависимости установлены, npm test готов к запуску."}'
else
    echo '{"systemMessage":"Не удалось установить зависимости — npm test работать не будет. Запусти npm install вручную и посмотри вывод."}'
fi
exit 0
