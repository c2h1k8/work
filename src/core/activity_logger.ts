// ==================================================
// ActivityLogger - アクティビティログ記録ユーティリティ
// ==================================================
// 各ページの主要操作を activity_db に非同期で記録する。
// ページ単位の記録オン/オフ設定は app_db に保存。

import {
  activityDB,
  type ActivityPage,
  type ActivityAction,
  type ActivityTargetType,
  type ActivityQueryOptions,
} from '../db/activity_db';
import { appDB } from '../db/app_db';

interface ActivityLogConfig {
  disabledPages?: string[];
}

let _disabledPages: Set<string> | null = null;

/** 設定を app_db から読み込みキャッシュする */
async function _loadConfig(): Promise<void> {
  try {
    const config = await appDB.get<ActivityLogConfig>('activity_log_config');
    _disabledPages = new Set(config?.disabledPages ?? []);
  } catch {
    _disabledPages = new Set();
  }
}

/**
 * 設定を保存する（設定画面から呼ばれる）
 * @param disabledPages 無効化するページ識別子の配列
 */
async function saveConfig(disabledPages: string[]): Promise<void> {
  _disabledPages = new Set(disabledPages);
  try {
    await appDB.set('activity_log_config', { disabledPages });
  } catch (e) {
    console.warn('[ActivityLogger] 設定保存失敗:', e);
  }
}

/**
 * アクティビティを記録する（Fire-and-forget）
 * @param page       ページ識別子
 * @param action     操作種別
 * @param targetType 対象種別
 * @param targetId   対象ID
 * @param summary    表示用サマリー（例: 'タスク「XXX」を追加'）
 */
function log(
  page: ActivityPage,
  action: ActivityAction,
  targetType: ActivityTargetType,
  targetId: string | number,
  summary: string,
): void {
  if (_disabledPages?.has(page)) return;

  const record = {
    page,
    action,
    target_type: targetType,
    target_id: String(targetId),
    summary,
    created_at: new Date().toISOString(),
  };

  activityDB.add(record).catch((e) =>
    console.warn('[ActivityLogger] 記録失敗:', e),
  );
}

/** ログをフィルタリングして取得する */
function query(opts?: ActivityQueryOptions) {
  return activityDB.query(opts);
}

/**
 * 古いログを削除する（90日以上前）
 * @param days 保持日数
 */
function cleanup(days = 90): void {
  activityDB.cleanup(days).catch((e) =>
    console.warn('[ActivityLogger] クリーンアップ失敗:', e),
  );
}

export const ActivityLogger = Object.freeze({
  saveConfig,
  log,
  query,
  cleanup,
});

// 初期化: 設定をキャッシュ（非同期）
void _loadConfig();
