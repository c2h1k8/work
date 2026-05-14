// ==================================================
// TimerDB - 定型作業タイマー IndexedDB（Dexie.js）
// ==================================================
// DB名: timer_db  version: 1
//
// ストア:
//   sessions: id*, task_name, tag, notes, duration_sec, started_at, ended_at
//   presets:  id*, name, work_sec, break_sec, position

import Dexie, { type Table } from 'dexie';

export interface TimerSession {
  id?: number;
  task_name: string;
  tag: string;
  notes: string;
  duration_sec: number;
  started_at: string;
  ended_at: string;
}

export interface TimerPreset {
  id?: number;
  name: string;
  work_sec: number;
  break_sec: number;
  position: number;
}

export interface TimerExportData {
  type: 'timer_export';
  version: 1;
  sessions: TimerSession[];
  presets: TimerPreset[];
}

class TimerDatabase extends Dexie {
  sessions!: Table<TimerSession, number>;
  presets!: Table<TimerPreset, number>;

  constructor() {
    super('timer_db');
    this.version(1).stores({
      sessions: '++id, started_at, tag',
      presets: '++id',
    });
  }

  // ----- セッション -----

  async addSession(session: Omit<TimerSession, 'id'>): Promise<TimerSession> {
    const id = await this.sessions.add(session as TimerSession);
    return { ...session, id };
  }

  async deleteSession(id: number): Promise<void> {
    await this.sessions.delete(id);
  }

  async getAllSessions(): Promise<TimerSession[]> {
    return this.sessions.toArray();
  }

  async getSessionsByDate(dateStr: string): Promise<TimerSession[]> {
    const all = await this.getAllSessions();
    return all.filter((s) => s.started_at.slice(0, 10) === dateStr);
  }

  async getSessionsInRange(fromStr: string, toStr: string): Promise<TimerSession[]> {
    const all = await this.getAllSessions();
    return all.filter(
      (s) => s.started_at.slice(0, 10) >= fromStr && s.started_at.slice(0, 10) <= toStr,
    );
  }

  // ----- プリセット -----

  async addPreset(preset: Omit<TimerPreset, 'id'>): Promise<TimerPreset> {
    const id = await this.presets.add(preset as TimerPreset);
    return { ...preset, id };
  }

  async updatePreset(preset: TimerPreset): Promise<TimerPreset> {
    await this.presets.put(preset);
    return preset;
  }

  async deletePreset(id: number): Promise<void> {
    await this.presets.delete(id);
  }

  async getPresets(): Promise<TimerPreset[]> {
    const all = await this.presets.toArray();
    return all.sort((a, b) => a.position - b.position);
  }

  // ----- エクスポート/インポート -----

  async exportAll(): Promise<TimerExportData> {
    const [sessions, presets] = await Promise.all([
      this.getAllSessions(),
      this.getPresets(),
    ]);
    return { type: 'timer_export', version: 1, sessions, presets };
  }

  async importAll(data: TimerExportData, replace = false): Promise<{ sessions: number; presets: number }> {
    if (data.type !== 'timer_export') throw new Error('フォーマットが不正です');
    const sessions = data.sessions ?? [];
    const presets = data.presets ?? [];

    await this.transaction('rw', this.sessions, this.presets, async () => {
      if (replace) {
        await this.sessions.clear();
        await this.presets.clear();
      }
      await this.sessions.bulkAdd(
        sessions.map(({ id: _id, ...rest }) => rest as TimerSession),
      );
      await this.presets.bulkAdd(
        presets.map(({ id: _id, ...rest }) => rest as TimerPreset),
      );
    });

    return { sessions: sessions.length, presets: presets.length };
  }
}

export const timerDB = new TimerDatabase();
