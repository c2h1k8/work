// ==================================================
// Toast: 全ページ共通トースト通知
//
// 使い方:
//   Toast.show('メッセージ');
//   Toast.show('成功しました', 'success');
//   Toast.show('エラーが発生しました', 'error');
//
// 自己挿入型: HTML に要素を配置する必要はない。
// CSS は css/components/toast.css を読み込む。
// ==================================================

const Toast = (() => {
  let _el = null;
  let _timer = null;

  function _ensureEl() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.className = 'toast';
    _el.setAttribute('hidden', '');
    document.body.appendChild(_el);
    return _el;
  }

  function show(message, type = '') {
    const el = _ensureEl();
    el.textContent = message;
    el.className = 'toast' + (type ? ` toast--${type}` : '');
    el.removeAttribute('hidden');
    clearTimeout(_timer);
    _timer = setTimeout(() => el.setAttribute('hidden', ''), 3000);
  }

  return { show };
})();
