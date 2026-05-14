// ==================================================
// OpsDB - 運用ツール用 IndexedDB（Dexie.js）
// ==================================================
// DB名: ops_db  version: 1
//
// ストア:
//   ports: id*, port, protocol, service, memo, position
//   certificates: id*, domain, expiry, memo, position（将来拡張）

import Dexie, { type Table } from 'dexie';

export type PortProtocol = 'TCP' | 'UDP' | 'both';

export interface OpsPort {
  id?: number;
  port: number;
  protocol: PortProtocol;
  service: string;
  memo: string;
  position: number;
}

export interface OpsCertificate {
  id?: number;
  domain: string;
  expiry: string;
  memo: string;
  position: number;
}

class OpsDatabase extends Dexie {
  ports!: Table<OpsPort, number>;
  certificates!: Table<OpsCertificate, number>;

  constructor() {
    super('ops_db');
    this.version(1).stores({
      ports: '++id',
      certificates: '++id',
    });
  }

  async getPorts(): Promise<OpsPort[]> {
    const all = await this.ports.toArray();
    return all.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  async addPort(port: Omit<OpsPort, 'id'>): Promise<number> {
    return this.ports.add(port as OpsPort);
  }

  async updatePort(port: OpsPort): Promise<void> {
    await this.ports.put(port);
  }

  async deletePort(id: number): Promise<void> {
    await this.ports.delete(id);
  }
}

export const opsDB = new OpsDatabase();
