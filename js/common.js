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
