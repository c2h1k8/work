// 環境設定
const ENV = {
  UT: {
    username: "xxxx",
    password: "xxxx",
    connect_identifier: "127.0.0.1:1521/xxxx",
    isSelected: true,
  },
  XXX: {
    username: "xxxx",
    password: "xxxx",
    connect_identifier: "127.0.0.1:1521/xxxx",
    isSelected: false,
  },
};

// 使用設定
const USE = {
  YES: {
    label: "あり",
  },
  NO: {
    label: "なし",
    isSelected: true,
  },
};

// データ型設定
const TYPE = {
  CHAR: {
    label: "CHAR",
    useLength: true,
    isStrings: true,
    isSelected: true,
  },
  NVARCHAR2: {
    label: "NVARCHAR2",
    useLength: true,
    isStrings: true,
  },
  NUMBER: {
    label: "NUMBER",
    useLength: false,
    isStrings: false,
  },
};

// パラメータ設定
const PARAMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// ページが読み込まれた時に実行する処理
window.addEventListener("load", () => {
  // 環境設定のラジオボタン生成
  const radioEnv = document.getElementById("env");
  Object.keys(ENV).forEach((key) => {
    radioEnv.appendChild(createRadioButton("env", key, ENV[key].isSelected));
  });

  // パラメータ設定のラジオボタン生成
  const paramWrapper = document.getElementById("param-wrapper");
  PARAMS.forEach((no) => {
    paramWrapper.appendChild(createParamWrapper(no));
  });

  // 接続ボタンのイベント登録
  document.getElementById("conn").addEventListener("mouseup", (event) => {
    event.target.dataset.params = JSON.stringify(
      ENV[document.querySelector('input[name="env"]:checked').value]
    );
  });

  // パラメータコピーのイベント登録
  document.getElementById("param-copy").addEventListener("mouseup", (event) => {
    let copyText = "";

    // パラメータごとに処理
    PARAMS.forEach((no) => {
      const use = document.querySelector(
        `input[name="use-${no}"]:checked`
      ).value;

      // 使用しない場合はスキップ
      if (USE.NO.label === use) return;

      // データ型、桁数、バインド値の設定
      const type = document.querySelector(
        `input[name="type-${no}"]:checked`
      ).value;
      let length = "";
      if (TYPE[type].useLength) {
        length = `(${
          document.querySelector(`input[name="length-${no}"]:checked`).value
        })`;
      }
      let value = "";
      if (TYPE[type].isStrings) {
        value = "''";
      }

      // コピー用テキストを作成
      copyText += getString(
        "var BNO TYPE LENGTH\nexec :BNO := VALUE;\n",
        JSON.stringify({
          NO: no,
          TYPE: type,
          LENGTH: length,
          VALUE: value,
        })
      );
    });

    // クリップボード用のデータを設定
    event.target.dataset.copy = copyText;
  });
});

/**
 * ラジオボタンを生成します
 * @param {string} name - ラジオボタンの名前
 * @param {string} value - ラジオボタンの値
 * @param {boolean} isChecked - ラジオボタンが選択されているかどうか
 * @returns {HTMLElement} - 生成されたラジオボタンの要素
 */
const createRadioButton = (name, value, isChecked) => {
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = isChecked;

  const label = document.createElement("label");
  label.textContent = value;
  label.setAttribute("for", input.id);

  const parentDiv = document.createElement("div");
  parentDiv.append(input, label);
  return parentDiv;
};

/**
 * パラメータ用のラジオボタン群を生成します
 * @param {number} no - パラメータ番号
 * @returns {HTMLElement} - 生成されたパラメータ用ラジオボタン群の要素
 */
const createParamWrapper = (no) => {
  const paramContainer = document.createElement("div");
  paramContainer.classList.add("parent-grid");

  // パラメータ番号表示
  const paramLabel = document.createElement("span");
  paramLabel.textContent = no;
  paramContainer.appendChild(paramLabel);

  // 使用設定ラジオボタン群
  paramContainer.appendChild(
    createRadioGroup(`use-${no}`, USE, "inline-radio")
  );

  // データ型設定ラジオボタン群
  paramContainer.appendChild(
    createRadioGroup(`type-${no}`, TYPE, "inline-radio")
  );

  // データ桁数設定ラジオボタン群（1〜30まで）
  paramContainer.appendChild(createLengthRadioGroup(`length-${no}`, 1, 30, 6));

  return paramContainer;
};

/**
 * ラジオボタン群を生成する
 * @param {string} groupId - ラジオボタングループのID
 * @param {Object} options - ラジオボタンの選択肢
 * @param {string} groupClass - ラジオボタングループのCSSクラス
 * @returns {HTMLElement} - 生成されたラジオボタングループ
 */
const createRadioGroup = (groupId, options, groupClass) => {
  const group = document.createElement("group");
  group.id = groupId;
  group.classList.add(groupClass);

  Object.keys(options).forEach((key) => {
    const { label, isSelected } = options[key];
    group.appendChild(createRadioButton(groupId, label, isSelected));
  });

  return group;
};

/**
 * データ桁数設定用ラジオボタン群を生成する
 * @param {string} groupId - ラジオボタングループのID
 * @param {number} start - 桁数の開始値
 * @param {number} end - 桁数の終了値
 * @param {number} defaultLength - デフォルト選択する桁数
 * @returns {HTMLElement} - 生成されたデータ桁数設定ラジオボタングループ
 */
const createLengthRadioGroup = (groupId, start, end, defaultLength) => {
  const group = document.createElement("group");
  group.id = groupId;
  group.classList.add("inline-radio");

  for (let i = start; i <= end; i++) {
    group.appendChild(createRadioButton(groupId, i, i === defaultLength));
  }

  return group;
};
