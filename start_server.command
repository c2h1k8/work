#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=52700

# ── すでにポートが使用中なら再起動しない ──
if lsof -ti tcp:$PORT &>/dev/null; then
    open "http://localhost:$PORT"
    exit 0
fi

# ── サーバー起動関数 ──
start_and_open() {
    local CMD="$1"
    nohup $CMD > /dev/null 2>&1 &
    disown $!
    sleep 1
    open "http://localhost:$PORT"
    osascript -e "display notification \"http://localhost:$PORT\" with title \"work サーバー起動\" subtitle \"停止: stop_server.command\""
    exit 0
}

# ── Python3 を試みる ──
if command -v python3 &>/dev/null; then
    start_and_open "python3 -m http.server $PORT"
fi

# ── Python を試みる ──
if command -v python &>/dev/null; then
    start_and_open "python -m http.server $PORT"
fi

# ── Node.js を試みる ──
if command -v node &>/dev/null; then
    start_and_open "npx --yes serve -p $PORT ."
fi

# ── どちらも見つからない ──
osascript -e 'display alert "エラー" message "Python または Node.js が見つかりませんでした。\nhttps://www.python.org/downloads/ からインストールしてください。"'
exit 1
