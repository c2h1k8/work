/**
 * 指定されたキーで値を `localStorage` に保存します。
 * オプションでバリデーションを行い、無効な場合は保存しません。
 *
 * @param {string} key - 保存するデータのキー
 * @param {string} value - 保存するデータの値
 * @param {Function|null} [validateFn=null] - バリデーション関数（オプション）。無効な場合、保存は行われません。
 */
const saveToStorage = (key, value, validateFn = null) => {
  if (validateFn && !validateFn(value)) return; // バリデーションチェック
  localStorage.setItem(key, value); // 値をlocalStorageに保存
};

/**
 * 複数のデータを `localStorage` に保存します。
 * 既存のデータがあれば削除し、最大サイズを超える場合は最古のデータを削除します。
 *
 * @param {string} key - 保存するデータのキー
 * @param {string} value - 保存するデータの値
 * @param {number} maxSize - 保存するデータの最大数
 * @param {Function|null} [validateFn=null] - バリデーション関数（オプション）。無効な場合、保存は行われません。
 */
const saveToStorageWithLimit = (key, value, maxSize, validateFn = null) => {
  if (validateFn && !validateFn(value)) return; // バリデーションチェック

  let storageValues = loadJsonFromStorage(key) || []; // 既存のストレージデータを取得（ない場合は空配列）

  // 重複データ削除 & 最大サイズを超過した場合は最古のデータ削除
  const index = storageValues.indexOf(value);
  if (index !== -1) {
    storageValues.splice(index, 1); // 重複データを削除
  } else if (storageValues.length >= maxSize) {
    storageValues.pop(); // 最大サイズを超えている場合は最古のデータを削除
  }
  storageValues.unshift(val); // 新しいデータを先頭に追加
  localStorage.setItem(key, JSON.stringify(storageValues)); // 更新したデータをlocalStorageに保存
};

/**
 * `localStorage` から指定されたキーに対応する値を取得します。
 *
 * @param {string} key - 取得するデータのキー
 * @returns {string|null} - 指定されたキーに対応する値。データが存在しない場合は `null` を返します。
 */
const loadFromStorage = (key) => localStorage.getItem(key);

/**
 * `localStorage` から指定されたキーに対応するデータを取得し、JSONオブジェクトとして返します。
 * データが存在しない場合は `null` を返します。
 *
 * @param {string} key - 取得するデータのキー
 * @returns {Object|null} - JSONパースしたデータ。データが存在しない場合は `null` を返します。
 */
const loadJsonFromStorage = (key) => {
  const storedData = localStorage.getItem(key);
  return storedData ? JSON.parse(storedData) : null;
};
