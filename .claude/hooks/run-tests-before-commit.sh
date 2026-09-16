#!/usr/bin/env bash
# Шлюз: не даём сделать коммит, пока npm test не прошёл.
#
# Правило проекта (.claude/rules/testing.md) требует запускать тесты перед
# каждым коммитом. До этого хука правило держалось на памяти агента — то есть
# не держалось никак.
#
# Вызывается как PreToolUse на Bash, отфильтрованный по `Bash(git commit*)`.
# На вход получает JSON вызова инструмента, но ничего из него не читает:
# фильтр уже сделан настройкой.

set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -f "$root/package.json" ] || exit 0

cd "$root" || exit 0

# Без зависимостей тесты не запустятся. Ставим молча и только при нужде.
if [ ! -d node_modules ]; then
    npm install --no-audit --no-fund --silent >/dev/null 2>&1
fi

output="$(npm test 2>&1)"
status=$?

[ $status -eq 0 ] && exit 0

# Тесты упали — блокируем коммит и отдаём хвост лога, чтобы было видно, что именно.
TEST_OUTPUT="$output" python3 - <<'PY'
import json, os

tail = "\n".join(os.environ["TEST_OUTPUT"].splitlines()[-30:])
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "Коммит остановлен: npm test не прошёл.\n"
            "Правило .claude/rules/testing.md — тесты обязательны перед коммитом.\n\n"
            "Хвост вывода:\n" + tail
        ),
    }
}, ensure_ascii=False))
PY
exit 0
