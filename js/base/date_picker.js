// ==================================================
// DatePicker: カスタムカレンダー日付選択部品
//
// 使い方:
//   1. このスクリプトをページに読み込む
//   2. 以下のHTML構造をページに配置する:
//
//      <div id="date-picker" class="datepicker" hidden>
//        <div class="datepicker__backdrop" data-dp-action="cancel"></div>
//        <div class="datepicker__dialog">
//          <div class="datepicker__quickbtns">
//            <button data-dp-action="today">今日</button>
//            <button data-dp-action="tomorrow">明日</button>
//            <button data-dp-action="month-end">月末</button>
//            <button data-dp-action="clear" class="datepicker__btn--danger">クリア</button>
//          </div>
//          <div class="datepicker__nav">
//            <button data-dp-action="prev-year" aria-label="前の年">«</button>
//            <button data-dp-action="prev-month" aria-label="前の月">‹</button>
//            <span id="dp-month-label"></span>
//            <button data-dp-action="next-month" aria-label="次の月">›</button>
//            <button data-dp-action="next-year" aria-label="次の年">»</button>
//          </div>
//          <div id="dp-grid" class="datepicker__grid"></div>
//          <div class="datepicker__footer">
//            <button data-dp-action="confirm" class="btn btn--sm btn--primary">決定</button>
//          </div>
//        </div>
//      </div>
//
//   3. イベントリスナーをページ側で登録する:
//
//      document.getElementById('date-picker').addEventListener('click', (e) => {
//        const btn = e.target.closest('[data-dp-action]');
//        if (btn) DatePicker.handleAction(btn.dataset.dpAction, btn);
//      });
//
//   4. DatePicker.open(dateStr, onSelect, onClear) を呼び出す:
//
//      DatePicker.open(
//        '2025-03-15',              // 初期選択日（YYYY-MM-DD）。空文字で未選択
//        (dateStr) => { ... },      // 決定時コールバック（YYYY-MM-DD を受け取る）
//        ()        => { ... },      // クリア時コールバック
//      );
//
//   CSSは css/base/date_picker.css を読み込む。
// ==================================================

const DatePicker = {
  _year:        0,
  _month:       0,      // 0-based
  _selected:    null,
  _onSelect:    null,
  _onClear:     null,
  _holidays:    null,   // 現在表示年の祝日 Set（'MM-DD' 形式）
  _cachedYear:  NaN,    // _holidays をキャッシュした年
  _wheelBound:  false,  // wheel イベント登録済みフラグ
  _onKeyDown:   null,   // keydown ハンドラ参照（open/close で着脱）

  // --------------------------------------------------
  // 公開 API
  // --------------------------------------------------

  /** 日付ピッカーを開く */
  open(dateStr, onSelect, onClear) {
    // スクロールで月を変えるリスナーを初回のみ登録
    if (!this._wheelBound) {
      document.getElementById('date-picker').addEventListener('wheel', (e) => {
        e.preventDefault();
        this.handleAction(e.deltaY < 0 ? 'prev-month' : 'next-month', null);
      }, { passive: false });
      this._wheelBound = true;
    }

    const today = new Date();
    if (dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      this._year  = d.getFullYear();
      this._month = d.getMonth();
      this._selected = new Date(dateStr + 'T00:00:00');
    } else {
      this._year  = today.getFullYear();
      this._month = today.getMonth();
      this._selected = null;
    }
    this._onSelect = onSelect;
    this._onClear  = onClear;
    this._refreshHolidays();
    this._render();
    document.getElementById('date-picker').removeAttribute('hidden');

    // カーソルキーで月・年を移動（開いている間のみ有効）
    this._onKeyDown = (e) => {
      const map = {
        ArrowLeft:  'prev-month',
        ArrowRight: 'next-month',
        ArrowUp:    'prev-year',
        ArrowDown:  'next-year',
      };
      if (map[e.key]) {
        e.preventDefault();
        this.handleAction(map[e.key], null);
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  },

  /** ピッカーを閉じる */
  close() {
    document.getElementById('date-picker').setAttribute('hidden', '');
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  },

  /** アクション処理 */
  handleAction(action, btn) {
    switch (action) {
      case 'prev-year':
        this._year--;
        this._refreshHolidays();
        this._render();
        break;
      case 'next-year':
        this._year++;
        this._refreshHolidays();
        this._render();
        break;
      case 'prev-month':
        this._month--;
        if (this._month < 0) { this._month = 11; this._year--; this._refreshHolidays(); }
        this._render();
        break;
      case 'next-month':
        this._month++;
        if (this._month > 11) { this._month = 0; this._year++; this._refreshHolidays(); }
        this._render();
        break;
      case 'pick-date':
        this._selected = new Date(btn.dataset.date + 'T00:00:00');
        this._render();
        break;
      case 'today': {
        const t = new Date();
        this._selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        this._year  = t.getFullYear();
        this._month = t.getMonth();
        this._refreshHolidays();
        this._render();
        break;
      }
      case 'tomorrow': {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        this._selected = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        this._year  = t.getFullYear();
        this._month = t.getMonth();
        this._refreshHolidays();
        this._render();
        break;
      }
      case 'month-end': {
        const t = new Date();
        const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0);
        this._selected = lastDay;
        this._year  = lastDay.getFullYear();
        this._month = lastDay.getMonth();
        this._refreshHolidays();
        this._render();
        break;
      }
      case 'confirm':
        if (this._selected) {
          const y = this._selected.getFullYear();
          const m = String(this._selected.getMonth() + 1).padStart(2, '0');
          const d = String(this._selected.getDate()).padStart(2, '0');
          this._onSelect?.(`${y}-${m}-${d}`);
        }
        this.close();
        break;
      case 'clear':
        this._onClear?.();
        this.close();
        break;
      case 'cancel':
        this.close();
        break;
    }
  },

  // --------------------------------------------------
  // 内部メソッド
  // --------------------------------------------------

  /** 年が変わったときだけ祝日を再計算 */
  _refreshHolidays() {
    if (this._cachedYear !== this._year) {
      this._holidays   = this._computeHolidays(this._year);
      this._cachedYear = this._year;
    }
  },

  /** カレンダーグリッドを描画 */
  _render() {
    // 月ラベル更新
    document.getElementById('dp-month-label').textContent =
      `${this._year}年 ${this._month + 1}月`;

    const grid = document.getElementById('dp-grid');
    grid.innerHTML = '';

    // 曜日ヘッダー（日〜土）
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    for (const d of weekdays) {
      const hd = document.createElement('div');
      hd.className = 'dp-weekday';
      hd.textContent = d;
      grid.appendChild(hd);
    }

    // 今日（比較用）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 当月情報
    const firstDay = new Date(this._year, this._month, 1);
    const lastDay  = new Date(this._year, this._month + 1, 0);
    const startDow = firstDay.getDay(); // 0=日

    // 前月の空セル
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'dp-day dp-day--other';
      grid.appendChild(blank);
    }

    // 当月の日付ボタン
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(this._year, this._month, day);
      date.setHours(0, 0, 0, 0);
      const dow   = date.getDay(); // 0=日, 6=土
      const mmdd  = `${String(this._month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isHoliday = this._holidays.has(mmdd);

      const btn = document.createElement('button');
      btn.className = 'dp-day';
      btn.textContent = day;

      const dateStr = [
        this._year,
        String(this._month + 1).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-');
      btn.dataset.dpAction = 'pick-date';
      btn.dataset.date     = dateStr;

      // 土日祝のクラス付与
      if (dow === 0 || isHoliday) btn.classList.add('dp-day--sunday');
      else if (dow === 6)          btn.classList.add('dp-day--saturday');

      // 選択中・今日
      if (this._selected) {
        const sel = new Date(this._selected);
        sel.setHours(0, 0, 0, 0);
        if (date.getTime() === sel.getTime()) btn.classList.add('dp-day--selected');
      }
      if (date.getTime() === today.getTime()) btn.classList.add('dp-day--today');

      grid.appendChild(btn);
    }
  },

  // --------------------------------------------------
  // 日本の祝日計算（1980〜2099年対応）
  // --------------------------------------------------

  /**
   * 指定年の日本の祝日を 'MM-DD' の Set で返す。
   * 振替休日・国民の休日も含む。
   */
  _computeHolidays(year) {
    const h = new Set();

    const pad = n => String(n).padStart(2, '0');
    const key = (m, d) => `${pad(m)}-${pad(d)}`;
    const addKey = (m, d) => h.add(key(m, d));
    const hasKey = (m, d) => h.has(key(m, d));

    // 第 n 月曜日（曜日番号: 0=日, 1=月, ...）のを返す
    const nthWeekday = (mon, n, dow = 1) => {
      const firstDow = new Date(year, mon - 1, 1).getDay();
      const day = 1 + ((dow - firstDow + 7) % 7) + (n - 1) * 7;
      return day;
    };

    // ---- 固定祝日 ----
    addKey(1, 1);   // 元日
    addKey(2, 11);  // 建国記念の日
    if (year >= 2020) addKey(2, 23); // 天皇誕生日
    addKey(4, 29);  // 昭和の日
    addKey(5, 3);   // 憲法記念日
    addKey(5, 4);   // みどりの日
    addKey(5, 5);   // こどもの日
    if (year >= 2016) addKey(8, 11); // 山の日
    addKey(11, 3);  // 文化の日
    addKey(11, 23); // 勤労感謝の日

    // ---- ハッピーマンデー ----
    addKey(1,  nthWeekday(1,  2)); // 成人の日（1月第2月曜）
    addKey(7,  nthWeekday(7,  3)); // 海の日（7月第3月曜）
    addKey(9,  nthWeekday(9,  3)); // 敬老の日（9月第3月曜）
    addKey(10, nthWeekday(10, 2)); // スポーツの日（10月第2月曜）

    // ---- 春分の日・秋分の日（近似式 1980〜2099年） ----
    const i = year - 1980;
    const vernal   = Math.floor(20.8431 + 0.242194 * i - Math.floor(i / 4));
    const autumnal = Math.floor(23.2488 + 0.242194 * i - Math.floor(i / 4));
    addKey(3, vernal);
    addKey(9, autumnal);

    // ---- 国民の休日（敬老の日と秋分の日に挟まれた平日） ----
    const agingDay = nthWeekday(9, 3);
    if (autumnal - agingDay === 2) {
      const midDay = agingDay + 1;
      if (new Date(year, 8, midDay).getDay() !== 0) {
        addKey(9, midDay);
      }
    }

    // ---- 振替休日（日曜が祝日 → 翌非祝日平日が振替） ----
    // スナップショットから計算（振替で追加した日は振替の対象外）
    const origHolidays = new Set(h);
    const toAdd = [];
    for (const mmdd of origHolidays) {
      const [m, d] = mmdd.split('-').map(Number);
      if (new Date(year, m - 1, d).getDay() !== 0) continue; // 日曜祝日のみ
      const sub = new Date(year, m - 1, d);
      sub.setDate(sub.getDate() + 1);
      // 追加候補・既存祝日・既に振替追加済みをスキップ
      while (origHolidays.has(key(sub.getMonth() + 1, sub.getDate()))
          || toAdd.includes(key(sub.getMonth() + 1, sub.getDate()))) {
        sub.setDate(sub.getDate() + 1);
      }
      toAdd.push(key(sub.getMonth() + 1, sub.getDate()));
    }
    for (const k of toAdd) h.add(k);

    return h;
  },
};
