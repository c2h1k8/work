const saveStorage = (key, val, funcValidate = null) => {
  if (funcValidate && !funcValidate(val)) {
    return;
  }
  localStorage.setItem(key, val);
};

const saveStorages = (key, val, maxSize, funcValidate = null) => {
  if (funcValidate && !funcValidate(val)) {
    return;
  }
  let storageValues = getStorages(key);
  if (!storageValues) {
    // 空の場合は新規追加
    storageValues = [];
  } else if (storageValues.includes(val)) {
    // 存在する場合は対象を削除
    storageValues.splice(storageValues.indexOf(val), 1);
  } else if (storageValues.length >= maxSize) {
    // 最大サイズを超過する場合は最古のデータを削除
    storageValues.splice(maxSize - 1, 999);
  }
  // 先頭追加
  storageValues.unshift(val);
  localStorage.setItem(key, JSON.stringify(storageValues));
};

const getStorage = (key) => localStorage.getItem(key);

const getStorages = (key) => JSON.parse(localStorage.getItem(key));
