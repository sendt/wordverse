import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Word } from "../words";

const SR_IV = [6, 20, 60, 150, 400];

export class SREngine {
  private pool: Word[];
  mem: Record<string, { seen: number; correct: number; nextAt: number }> = {};
  private n = 0;

  constructor(w: Word[]) {
    this.pool = [...w].sort(() => Math.random() - 0.5);
  }

  next(): Word {
    this.n++;
    const due = this.pool.filter((w) => this.mem[w.en]?.nextAt <= this.n);
    if (due.length)
      return due.sort(
        (a, b) => this.mem[a.en].nextAt - this.mem[b.en].nextAt,
      )[0];
    const un = this.pool.filter((w) => !this.mem[w.en]);
    if (un.length) return un[0];
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }

  record(w: Word, ok: boolean) {
    const m = this.mem[w.en];
    const cc = (m?.correct ?? 0) + (ok ? 1 : 0);
    const idx = ok
      ? Math.min(cc, SR_IV.length - 1)
      : Math.max(0, (m?.seen ?? 0) > 1 ? 1 : 0);
    this.mem[w.en] = {
      seen: (m?.seen ?? 0) + 1,
      correct: cc,
      nextAt: this.n + SR_IV[idx],
    };
    this.save();
  }

  getUnique(n: number): Word[] {
    const res: Word[] = [],
      used = new Set<string>();
    const due = this.pool.filter(
      (w) => this.mem[w.en]?.nextAt <= this.n && !used.has(w.en),
    );
    for (const w of due) {
      if (res.length >= n) break;
      res.push(w);
      used.add(w.en);
    }
    const un = this.pool.filter((w) => !this.mem[w.en] && !used.has(w.en));
    for (const w of un) {
      if (res.length >= n) break;
      res.push(w);
      used.add(w.en);
    }
    for (const w of this.pool) {
      if (res.length >= n) break;
      if (!used.has(w.en)) {
        res.push(w);
        used.add(w.en);
      }
    }
    return res;
  }

  count() {
    return Object.keys(this.mem).length;
  }

  getPool() {
    return this.pool;
  }

  getMem() {
    return this.mem;
  }

  save() {
    try {
      const data = JSON.stringify({ mem: this.mem, n: this.n });
      (global as any).__wv_sr = data;
      AsyncStorage.setItem("wv_sr_data", data).catch(() => {});
    } catch (e) {}
  }

  async load() {
    try {
      let raw = (global as any).__wv_sr;
      if (!raw) {
        raw = await AsyncStorage.getItem("wv_sr_data");
        if (raw) (global as any).__wv_sr = raw;
      }
      if (raw) {
        const d = JSON.parse(raw);
        this.mem = d.mem ?? {};
        this.n = d.n ?? 0;
      }
    } catch (e) {}
  }

  async reset() {
    this.mem = {};
    this.n = 0;
    try {
      (global as any).__wv_sr = null;
      await AsyncStorage.removeItem("wv_sr_data");
    } catch (e) {}
  }
}
