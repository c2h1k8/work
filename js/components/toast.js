// ==================================================
// Toast: 全ページ共通トースト通知
//
// 使い方:
//   Toast.show('メッセージ');
//   Toast.success('成功しました');
//   Toast.error('エラーが発生しました');
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
    el.classList.remove('toast--hiding');
    clearTimeout(_timer);
    // フェードアウトアニメーション（220ms）終了後に hidden を付与
    _timer = setTimeout(() => {
      el.classList.add('toast--hiding');
      setTimeout(() => el.setAttribute('hidden', ''), 220);
    }, 2780);
  }

  return {
    show,
    success: (msg) => show(msg, 'success'),
    error:   (msg) => show(msg, 'error'),
  };
})();
