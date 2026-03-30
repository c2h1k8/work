'use strict';

// ==================================================
// SQL Toolkit — 状態管理・ヘルパー関数
// グローバル状態変数・トースト通知・バリデーション・パース
// ==================================================

// グローバル状態
let _db            = null;
let selectedEnvKey = "";
let _nextParamId   = 1;

// テーブル定義メモの状態
let _memoEditingId = null; // null = 追加, number = 編集対象ID
let _memoColCount  = 0;
let _memoIdxCount  = 0;
let _memoViewMode  = 'table'; // 'table' | 'column'

// 実行計画ガイドのタブ状態
let _tuneTab = "all";

// ==================================================
// トースト通知（Toast コンポーネント利用）
// ==================================================
const showToast = (msg, type) => Toast.show(msg, type);
const showSuccess = (msg) => Toast.success(msg);
const showError = (msg) => Toast.error(msg);

// ==================================================
// DB が空の場合にデフォルト環境を投入
// ==================================================
async function ensureDefaultEnvs(db) {
  const envs = await db.getAllEnvs();
  if (envs.length === 0) {
    for (const e of DEFAULT_ENVS) await db.addEnv({ ...e });
  }
}

// ==================================================
// connect_identifier のパース（"host:port/service" → オブジェクト）
// ==================================================
function parseConnIdentifier(ci) {
  const m = (ci ?? "").match(/^([^:/]+)(?::(\d+))?\/(.+)$/);
  if (!m) return { host: ci ?? "", port: "", service: "" };
  return { host: m[1], port: m[2] ?? "", service: m[3] };
}

// ==================================================
// 環境フォームバリデーション（追加・編集共通）
// ==================================================
function validateEnvInputs({ key, user, host, portRaw, service }) {
  if (!key)  return "環境名を入力してください";
  if (!user) return "ユーザー名を入力してください";
  if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(user))
    return "ユーザー名: 英字始まり、英数字・_・$・# のみ使用できます";
  if (!host) return "ホスト名またはIPアドレスを入力してください";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(host))
    return "ホスト名: 英数字・.・- のみ使用できます（IPv4アドレスも可）";
  if (portRaw !== "" && (!/^\d+$/.test(portRaw) || +portRaw < 1 || +portRaw > 65535))
    return "ポート: 1〜65535 の数値を入力してください";
  if (!service) return "サービス名を入力してください";
  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(service))
    return "サービス名: 英数字・.・_ のみ使用できます";
  return null;
}
