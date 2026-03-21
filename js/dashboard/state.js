// ==============================
// State
// ==============================

const State = {
  db: null,
  sections: [], // position 昇順
  itemsMap: {}, // sectionId → items[]
  presets: [], // position 昇順
  activePresetId: null,
  bindConfig: { varNames: [], uiType: "select" },
  tableSortState: {}, // sectionId → { colId, dir: 'asc' | 'desc' }
  tablePageState: {}, // sectionId → 現在のページ番号（0始まり）
  settings: {
    open: false,
    view: "sections", // 'sections' | 'edit-section'
    editingSectionId: null,
    editingPresetId: null,
    editingTablePresetId: null,
  },
  // アイテム管理モーダルの状態
  itemMgr: {
    sectionId: null,
    editingId: null,
    formTab: "add", // 'add' | 'bulk'
  },
};

// ==============================
// 共通バインド変数の解決
// ==============================

/** 選択中のプリセットのバインド変数を解決する（{変数名} → 値に置換） */
const resolveBindVars = (str) => {
  if (!str) return str || "";
  const preset = State.presets.find((p) => p.id === State.activePresetId);
  if (!preset) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => {
    // {INPUT} はコマンドビルダー専用なのでスキップ
    if (key === "INPUT") return m;
    return preset.values && preset.values[key] !== undefined
      ? preset.values[key]
      : m;
  });
};

/** セクション独自バインド変数を解決する（table/list/grid セクションに対応） */
const resolveSectionVars = (str, sectionId) => {
  if (!str) return str || "";
  const section = State.sections.find((s) => s.id === sectionId);
  if (!section) return str;
  let presets, activePrefix;
  if (section.type === "table") {
    presets = section.table_presets || [];
    activePrefix = TABLE_ACTIVE_PRESET_PREFIX;
  } else if (section.type === "list") {
    presets = section.list_presets || [];
    activePrefix = LIST_ACTIVE_PRESET_PREFIX;
  } else if (section.type === "grid") {
    presets = section.grid_presets || [];
    activePrefix = GRID_ACTIVE_PRESET_PREFIX;
  } else {
    return str;
  }
  if (presets.length === 0) return str;
  const activeId = loadJsonFromStorage(activePrefix + sectionId);
  const preset = activeId != null ? presets.find((p) => p.id === activeId) : null;
  if (!preset) return str;
  const vals = preset.values || {};
  if (Object.keys(vals).length === 0) return str;
  return str.replace(/\{([^}]+)\}/g, (m, key) => (key in vals ? vals[key] : m));
};
/** テーブルセクション独自バインド変数を解決する（後方互換 alias） */
const resolveTableVars = (str, sectionId) => resolveSectionVars(str, sectionId);

// ==============================
// テンプレート日付変数の解決
// ==============================

/**
 * テンプレート内の日付プレースホルダーを現在日時で解決する
 *
 * 書式:
 *   {TODAY}                    → 今日の日付 (YYYY/MM/DD)
 *   {TODAY:YYYY年MM月DD日(ddd)} → フォーマット指定（曜日含む）
 *   {NOW}                      → 現在日時 (YYYY/MM/DD HH:mm)
 *   {NOW:HH:mm}                → フォーマット指定
 *   {DATE:+1d}                 → 明日 (YYYY/MM/DD)
 *   {DATE:+1d:MM/DD(ddd)}      → 明日の日付＋曜日
 *   {DATE:-2h:HH:mm}           → 2時間前の時刻
 *   {DATE:+30m:HH:mm}          → 30分後の時刻
 *   単位: d=日 w=週 M=月 y=年 h=時間 m=分
 *
 * フォーマットトークン:
 *   YYYY MM DD HH mm ss
 *   ddd  → 曜日短縮形（日,月,火,水,木,金,土）
 *   dddd → 曜日長形（日曜日〜土曜日）
 */
const resolveDateVars = (str) => {
  if (!str) return str || "";

  const pad = (n) => String(n).padStart(2, "0");
  const DAY_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
  const DAY_LONG = [
    "日曜日",
    "月曜日",
    "火曜日",
    "水曜日",
    "木曜日",
    "金曜日",
    "土曜日",
  ];

  const formatDate = (d, fmt) => {
    // dddd（長形）を先に置換してから ddd（短縮形）を置換する
    return (fmt || "YYYY/MM/DD")
      .replace("dddd", DAY_LONG[d.getDay()])
      .replace("ddd", DAY_SHORT[d.getDay()])
      .replace("YYYY", d.getFullYear())
      .replace("MM", pad(d.getMonth() + 1))
      .replace("DD", pad(d.getDate()))
      .replace("HH", pad(d.getHours()))
      .replace("mm", pad(d.getMinutes()))
      .replace("ss", pad(d.getSeconds()));
  };

  const applyOffset = (date, offset) => {
    // 単位: d=日 w=週 M=月 y=年 h=時間 m=分
    const match = offset.match(/^([+-])(\d+)([dwMyhm])$/);
    if (!match) return date;
    const sign = match[1] === "+" ? 1 : -1;
    const n = parseInt(match[2], 10) * sign;
    const unit = match[3];
    const d = new Date(date);
    if (unit === "d") d.setDate(d.getDate() + n);
    else if (unit === "w") d.setDate(d.getDate() + n * 7);
    else if (unit === "M") d.setMonth(d.getMonth() + n);
    else if (unit === "y") d.setFullYear(d.getFullYear() + n);
    else if (unit === "h") d.setHours(d.getHours() + n);
    else if (unit === "m") d.setMinutes(d.getMinutes() + n);
    return d;
  };

  const now = new Date();
  return str.replace(
    /\{(TODAY|NOW|DATE)(?::([^:}]*))?(?::([^}]*))?\}/g,
    (m, type, arg1, arg2) => {
      if (type === "TODAY") {
        return formatDate(now, arg1 || "YYYY/MM/DD");
      } else if (type === "NOW") {
        return formatDate(now, arg1 || "YYYY/MM/DD HH:mm");
      } else if (type === "DATE") {
        const offset = arg1 || "+0d";
        const fmt = arg2 || "YYYY/MM/DD";
        return formatDate(applyOffset(now, offset), fmt);
      }
      return m;
    },
  );
};

