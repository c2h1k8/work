const copyButtonArray = document.getElementsByClassName("copy");
Array.prototype.forEach.call(copyButtonArray, (element) => {
  element.addEventListener("click", () => {
    const data = getString(element.dataset.copy, element.dataset.params);
    navigator.clipboard.writeText(data);
  });
});
const openButtonArray = document.getElementsByClassName("open");
Array.prototype.forEach.call(openButtonArray, (element) => {
  element.addEventListener("click", () => {
    const url = getString(element.dataset.url, element.dataset.params);
    window.open(url, "_blank");
  });
});
const openSpreadSheetButtonArray =
  document.getElementsByClassName("open-spreadsheets");
Array.prototype.forEach.call(openSpreadSheetButtonArray, (element) => {
  element.addEventListener("click", () => {
    window.open(
      `https://docs.google.com/spreadsheets/d/${element.dataset.id}`,
      "_blank"
    );
  });
});

const getString = (origin, params) => {
  if (!params) return origin;
  const json = JSON.parse(params);
  Object.keys(json).forEach((key) => {
    origin = origin.replaceAll(key, json[key]);
  });
  return origin;
};

const createSelect = (storageKey, parentId, inputId) => {
  const parentDiv = document.getElementById(parentId);
  // 子要素削除
  while (parentDiv.firstChild) {
    parentDiv.removeChild(parentDiv.firstChild);
  }
  const storages = getStorages(storageKey);
  if (!storages) {
    return;
  }
  const div = document.createElement("div");
  div.classList.add("select");
  const select = document.createElement("select");
  select.name = "item";
  select.addEventListener("change", (e) => {
    const val = e.target.value;
    if (!val) return;
    document.getElementById(inputId).value = val;
  });
  // 空要素追加
  select.appendChild(document.createElement("option"));
  storages.forEach((elem) => {
    const option = document.createElement("option");
    option.value = elem;
    option.textContent = elem;
    select.appendChild(option);
  });
  div.appendChild(select);
  parentDiv.appendChild(div);
};
