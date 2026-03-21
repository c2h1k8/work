#!/bin/bash
PORT=52700

PIDS=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null
    osascript -e "display notification \"ポート $PORT のサーバーを停止しました。\" with title \"work サーバー停止\""
else
    osascript -e "display notification \"ポート $PORT で起動中のサーバーが見つかりません。\" with title \"work サーバー停止\""
fi
