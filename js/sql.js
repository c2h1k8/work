const ENV = {
  UT: {
    username: "xxxx",
    password: "xxxx",
    connect_identifier: "127.0.0.1:1521/xxxx",
    checked: true,
  },
  XXX: {
    username: "xxxx",
    password: "xxxx",
    connect_identifier: "127.0.0.1:1521/xxxx",
    checked: true,
  },
};
const USE = {
  YES: {
    name: "あり",
  },
  NO: {
    name: "なし",
    checked: true,
  },
};
const TYPE = {
  CHAR: {
    length: true,
    strings: true,
    checked: true,
  },
  NVARCHAR2: {
    length: true,
    strings: true,
  },
  NUMBER: {
    length: false,
    strings: false,
  },
};
const PARAMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
window.addEventListener("load", () => {
  // 環境要素設定
  const radioEnv = document.getElementById("env");
  Object.keys(ENV).forEach((key) => {
    radioEnv.appendChild(createRadioButton("env", key, ENV[key].checked));
  });
  // パラメータ要素設定
  const paramWrapper = document.getElementById("param-wrapper");
  PARAMS.forEach((no) => {
    paramWrapper.appendChild(createParamWrapper(no));
  });
  // イベント登録
  document.getElementById("conn").addEventListener("mouseup", (e) => {
    e.target.dataset.params = JSON.stringify(
      ENV[document.querySelector('input[name="env"]:checked').value]
    );
  });
  document.getElementById("param-copy").addEventListener("mouseup", (e) => {
    let copyText = "";
    PARAMS.forEach((no) => {
      // 使用チェック取得、使用しない場合はスキップ
      const use = document.querySelector(
        `input[name="use-${no}"]:checked`
      ).value;
      if (USE.NO.name === use) return;
      // データ型取得
      const type = document.querySelector(
        `input[name="type-${no}"]:checked`
      ).value;
      // データ桁数取得
      let length = "";
      if (TYPE[type].length) {
        length = `(${
          document.querySelector(`input[name="length-${no}"]:checked`).value
        })`;
      }
      // バインド値取得
      let value = "";
      if (TYPE[type].strings) {
        value = "''";
      }
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
    e.target.dataset.copy = copyText;
  });
});
const createRadioButton = (radioName, value, checked) => {
  const label = document.createElement("label");
  label.textContent = value;
  const input = document.createElement("input");
  input.type = "radio";
  input.name = radioName;
  input.value = value;
  input.checked = checked;
  const parentDiv = document.createElement("div");
  parentDiv.appendChild(input);
  parentDiv.appendChild(label);
  return parentDiv;
};
const createParamWrapper = (no) => {
  const span = document.createElement("span");
  span.textContent = no;
  const useId = `use-${no}`;
  const radioUse = document.createElement("group");
  radioUse.id = useId;
  radioUse.classList = "inline-radio";
  Object.keys(USE).forEach((key) => {
    radioUse.appendChild(
      createRadioButton(useId, USE[key].name, USE[key].checked)
    );
  });
  const typeId = `type-${no}`;
  const radioType = document.createElement("group");
  radioType.id = typeId;
  radioType.classList = "inline-radio";
  Object.keys(TYPE).forEach((key) => {
    radioType.appendChild(createRadioButton(typeId, key, TYPE[key].checked));
  });
  const lengthId = `length-${no}`;
  const radioLength = document.createElement("group");
  radioLength.id = lengthId;
  radioLength.classList = "inline-radio";
  for (let i = 1; i <= 30; i++) {
    radioLength.appendChild(createRadioButton(lengthId, i, i === 6));
  }
  const parentDiv = document.createElement("div");
  parentDiv.className = "parent-grid";
  parentDiv.appendChild(span);
  parentDiv.appendChild(radioUse);
  parentDiv.appendChild(radioType);
  parentDiv.appendChild(radioLength);
  return parentDiv;
};
