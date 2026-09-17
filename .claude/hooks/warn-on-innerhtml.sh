#!/usr/bin/env bash
# Сторож против возврата XSS.
#
# Главное правило проекта: пользовательские данные никогда не идут в innerHTML,
# только в textContent через assets/js/dom.js. XSS в этом репозитории уже был
# и был закрыт; хук ловит попытку вернуть его обратно.
#
# Ищем именно ПРИСВАИВАНИЕ разметки, а не слово в комментарии: в dom.js слово
# innerHTML упоминается трижды в пояснениях, и хук, орущий на них, перестанут
# читать через день.
#
# Вызывается как PostToolUse на Write|Edit. Не блокирует — предупреждает.

set -uo pipefail

file="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path") or d.get("tool_response",{}).get("filePath") or "")' 2>/dev/null)"

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
    *node_modules*) exit 0 ;;
    # Собранный движок глобуса править руками нельзя (ADR-0008): он машинный,
    # и ругаться на него — значит приучать не читать сторожа.
    *assets/vendor/*) exit 0 ;;
    *.js|*.html) ;;
    *) exit 0 ;;
esac

hits="$(grep -nE '(innerHTML|outerHTML)[[:space:]]*(\+)?=|insertAdjacentHTML|document\.write' "$file" 2>/dev/null)"

[ -z "$hits" ] && exit 0

HOOK_FILE="$file" HOOK_HITS="$hits" python3 - <<'PY'
import json, os

hits = os.environ["HOOK_HITS"]
path = os.environ["HOOK_FILE"]
message = (
    "Сторож XSS: в " + path + " появилась сборка разметки строкой.\n" + hits + "\n"
    "Правило .claude/rules/security.md: данные выводятся только через "
    "assets/js/dom.js (textContent). Если понадобился новый вид разметки — "
    "нужен помощник в dom.js, а не исключение из правила на месте."
)
print(json.dumps({
    "systemMessage": message,
    "hookSpecificOutput": {
        "hookEventName": "PostToolUse",
        "additionalContext": message,
    },
}, ensure_ascii=False))
PY
exit 0
