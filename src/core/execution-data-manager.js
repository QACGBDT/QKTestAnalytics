import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const clone = value => structuredClone(value);
const setPath = (obj, route, value) => {
  const parts = String(route).split('.').filter(Boolean);
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]] ??= {};
  cursor[parts.at(-1)] = value;
};
const getPath = (obj, route) => String(route).split('.').filter(Boolean).reduce((v, k) => v?.[k], obj);
const merge = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return clone(b ?? a);
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = clone(a);
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k], v) : clone(v);
    return out;
  }
  return b === undefined ? a : b;
};

export class ExecutionDataManager {
  constructor(options = {}) {
    this.filePath = options.filePath || 'qreport-results/media-bucket/reports/current.json';
    this.runId = options.runId || process.env.RUN_ID || null;
    this.accumulatedData = {};
    this.baseTemplate = {};
    this.globalStartTime = null;
    this.moduleTimers = new Map();
  }
  loadData() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '{}\n');
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    this.accumulatedData = raw ? JSON.parse(raw) : {};
    this.baseTemplate = clone(this.accumulatedData);
    return this.accumulatedData;
  }
  saveData(route, value) {
    this.loadData();
    setPath(this.accumulatedData, this.runId ? `${this.runId}.${route}` : route, value);
    fs.writeFileSync(this.filePath, `${JSON.stringify(merge(this.baseTemplate, this.accumulatedData), null, 2)}\n`);
  }
  getDataFromPath(route) {
    this.loadData();
    return getPath(this.accumulatedData, this.runId ? `${this.runId}.${route}` : route);
  }
  getAllData() { this.loadData(); return merge(this.baseTemplate, this.accumulatedData); }
  recordStart(meta = {}) {
    this.globalStartTime = new Date();
    this.saveData('execution_summary.global_start_time', this.globalStartTime.toISOString());
    this.saveData('execution_summary.project_name', meta.projectName || this.#projectName());
    if (meta.framework) this.saveData('execution_summary.framework', meta.framework);
  }
  recordEnd() {
    if (!this.globalStartTime) return;
    const end = new Date();
    this.saveData('execution_summary.global_end_time', end.toISOString());
    this.saveData('execution_summary.global_time_seconds', (end - this.globalStartTime) / 1000);
  }
  startModule(route) { const now = new Date(); this.moduleTimers.set(route, now); this.saveData(`${route}.test_summary.start_time`, now.toISOString()); }
  endModule(route) { const start = this.moduleTimers.get(route); if (!start) return; const end = new Date(); this.saveData(`${route}.test_summary.end_time`, end.toISOString()); this.saveData(`${route}.test_summary.duration_seconds`, (end - start) / 1000); this.moduleTimers.delete(route); }
  archiveCurrentReport() {
    if (!fs.existsSync(this.filePath)) return null;
    const archived = path.join(path.dirname(this.filePath), `rep_${crypto.randomUUID()}.json`);
    fs.renameSync(this.filePath, archived);
    return archived;
  }
  clearData() { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); fs.writeFileSync(this.filePath, '{}\n'); this.accumulatedData = {}; this.baseTemplate = {}; }
  #projectName() { try { return JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).name || 'UNNAMED_PROJECT'; } catch { return 'UNNAMED_PROJECT'; } }
}
