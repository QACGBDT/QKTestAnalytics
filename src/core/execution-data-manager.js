import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const clone = value => structuredClone(value);
const routeParts = route => {
  const parts = String(route ?? '').split('.').filter(Boolean);
  if (!parts.length) throw new TypeError('route must contain at least one path segment');
  return parts;
};
const setPath = (object, route, value) => {
  const parts = routeParts(route);
  let cursor = object;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]] ??= {};
  cursor[parts.at(-1)] = value;
};
const getPath = (object, route) => routeParts(route).reduce((value, key) => value?.[key], object);
const merge = (left, right) => {
  if (Array.isArray(left) || Array.isArray(right)) return clone(right ?? left);
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const output = clone(left);
    for (const [key, value] of Object.entries(right)) {
      output[key] = key in output ? merge(output[key], value) : clone(value);
    }
    return output;
  }
  return right === undefined ? left : right;
};

export class ExecutionDataManager {
  constructor(options = {}) {
    this.filePath = options.filePath || 'qreport-results/media-bucket/reports/current.json';
    this.runId = options.runId || process.env.RUN_ID || null;
    this.now = options.now || (() => new Date());
    this.uuid = options.uuid || (() => crypto.randomUUID());
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

  getAllData() {
    this.loadData();
    return merge(this.baseTemplate, this.accumulatedData);
  }

  recordStart(meta = {}) {
    this.globalStartTime = new Date(this.now());
    this.saveData('execution_summary.global_start_time', this.globalStartTime.toISOString());
    this.saveData('execution_summary.project_name', meta.projectName || this.#projectName());
    if (meta.framework) this.saveData('execution_summary.framework', meta.framework);
  }

  recordEnd() {
    if (!this.globalStartTime) return;
    const end = new Date(this.now());
    this.saveData('execution_summary.global_end_time', end.toISOString());
    this.saveData('execution_summary.global_time_seconds', (end.getTime() - this.globalStartTime.getTime()) / 1000);
  }

  startModule(route) {
    const now = new Date(this.now());
    this.moduleTimers.set(route, now);
    this.saveData(`${route}.test_summary.start_time`, now.toISOString());
  }

  endModule(route) {
    const start = this.moduleTimers.get(route);
    if (!start) return;
    const end = new Date(this.now());
    this.saveData(`${route}.test_summary.end_time`, end.toISOString());
    this.saveData(`${route}.test_summary.duration_seconds`, (end.getTime() - start.getTime()) / 1000);
    this.moduleTimers.delete(route);
  }

  archiveCurrentReport() {
    if (!fs.existsSync(this.filePath)) return null;
    const archived = path.join(path.dirname(this.filePath), `rep_${this.uuid()}.json`);
    fs.renameSync(this.filePath, archived);
    return archived;
  }

  clearData() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, '{}\n');
    this.accumulatedData = {};
    this.baseTemplate = {};
    this.globalStartTime = null;
    this.moduleTimers.clear();
  }

  #projectName() {
    try {
      return JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).name || 'UNNAMED_PROJECT';
    } catch {
      return 'UNNAMED_PROJECT';
    }
  }
}
