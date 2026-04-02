// ==================================================
// Backup: エクスポート／インポート
// ==================================================
const Backup = {
  /** IndexedDB の全データを JSON ファイルとしてダウンロード */
  async export(db) {
    const data = await db.exportAll();
    const json = JSON.stringify(data, null, 2);
    const n = new Date(), p = x => String(x).padStart(2,'0');
    const fname = `kanban_backup_${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}.json`;
    const saved = await FileSaver.save(json, fname);
    if (!saved) return;
    // エクスポート日時を保存してインジケーターを消す
    localStorage.setItem('kanban_last_export_at', new Date().toISOString());
    State.isDirty = false;
    this.updateExportIndicator(false);
    Toast.success('バックアップをエクスポートしました');
  },

  /** JSON ファイルを選択して IndexedDB を上書き復元 */
  import(db) {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.json,application/json',
    });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.version || !Array.isArray(data.tasks)) throw new Error('フォーマットが不正です');
        if (!confirm('現在のデータを削除してバックアップを復元しますか？')) return;
        await db.importAll(data);

        // カラムキャッシュ再構築
        State.columns = sortByPosition(await db.getAllColumns());
        State.tasks = {};
        for (const col of State.columns) State.tasks[col.key] = [];

        // ラベルキャッシュ再構築 → ボード再描画 → D&D 再初期化
        State.labels = await db.getAllLabels();
        Renderer.renderBoardColumns(db);
        await Renderer.renderBoard(db);
        renderFilterLabels();
        for (const s of State.sortables) s.destroy();
        DragDrop.init(db);

        // インポート直後はクリーンな状態とみなす
        localStorage.setItem('kanban_last_export_at', new Date().toISOString());
        State.isDirty = false;
        this.updateExportIndicator(false);
        Toast.success('バックアップを復元しました');
      } catch (err) {
        Toast.error('復元失敗: ' + err.message);
      }
    };
    input.click();
  },

  /** エクスポートボタンに未保存変更インジケーターを表示／非表示 */
  updateExportIndicator(dirty) {
    const btn = document.querySelector('[data-action="export-backup"]');
    if (btn) btn.classList.toggle('has-changes', dirty);
  },
};
