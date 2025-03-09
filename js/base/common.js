document.addEventListener("DOMContentLoaded", () => {
  /**
   * 指定したクラス名の要素にクリックイベントリスナーを追加します。
   * @param {string} className - クリックイベントを追加するクラス名
   * @param {Function} callback - クリック時に実行する処理
   */
  const addClickListenerToClass = (className, callback) => {
    [...document.getElementsByClassName(className)].forEach((element) => {
      element.addEventListener("click", callback(element));
    });
  };

  // "copy" クラスのボタンにクリップボードコピーの処理を追加
  addClickListenerToClass("copy", (element) => () => {
    navigator.clipboard.writeText(
      getString(element.dataset.copy, element.dataset.params)
    );
  });

  // "open" クラスのボタンにURLを新しいタブで開く処理を追加
  addClickListenerToClass("open", (element) => () => {
    window.open(
      getString(element.dataset.url, element.dataset.params),
      "_blank"
    );
  });

  // "open-spreadsheets" クラスのボタンにGoogleスプレッドシートを開く処理を追加
  addClickListenerToClass("open-spreadsheets", (element) => () => {
    const spreadsheetId = getString(element.dataset.id, element.dataset.params);
    const sheetGid = element.dataset.gid || "";
    window.open(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}#${sheetGid}`,
      "_blank"
    );
  });
});

/**
 * 文字列内のプレースホルダーを指定されたパラメータで置き換えます。
 * @param {string} origin - 置き換え元の文字列
 * @param {string} params - 置き換え対象のパラメータ（JSON文字列）
 * @returns {string} - 置き換え後の文字列
 */
const getString = (origin, params) => {
  if (!params) return origin;
  const jsonParams = JSON.parse(params);
  return Object.keys(jsonParams).reduce(
    (str, key) => str.replaceAll(key, jsonParams[key]),
    origin
  );
};

/**
 * ストレージのデータに基づいてセレクトボックスを作成し、指定された親要素に追加します。
 * @param {string} storageKey - 使用するストレージのキー
 * @param {string} parentId - セレクトボックスを追加する親要素のID
 * @param {string} inputId - セレクトボックスの選択値を設定する対象のID
 */
const createSelectBox = (storageKey, parentId, inputId) => {
  const parentDiv = document.getElementById(parentId);
  parentDiv.innerHTML = ""; // 親要素をリセット

  const storedValues = loadJsonFromStorage(storageKey);
  if (!storedValues) return;

  const selectElement = document.createElement("select");
  selectElement.name = "item";
  selectElement.addEventListener("change", (e) => {
    const selectedValue = e.target.value;
    if (selectedValue) document.getElementById(inputId).value = selectedValue;
  });

  // 空のオプションを追加
  selectElement.appendChild(document.createElement("option"));
  storedValues.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });

  const divElement = document.createElement("div");
  divElement.classList.add("select");
  divElement.appendChild(selectElement);
  parentDiv.appendChild(divElement);
};

/**
 * IPアドレスが正しい形式かどうかを検証します。
 * @param {string} ipAddress - 検証するIPアドレス
 * @returns {boolean} - 正しいIPアドレス形式なら`true`、それ以外は`false`
 */
const isValidIpAddress = (ipAddress) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(ipAddress);

/**
 * JSONオブジェクトをディープコピーします。
 * @param {Object} json - コピーするJSONオブジェクト
 * @returns {Object} - コピーされた新しいJSONオブジェクト
 */
const deepCopyJson = (json) => JSON.parse(JSON.stringify(json));
