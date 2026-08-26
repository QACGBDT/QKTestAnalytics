export interface ExecutionDataManagerOptions {
  filePath?: string;
  runId?: string | null;
  now?: () => Date | string | number;
  uuid?: () => string;
}

export interface ExecutionStartMetadata {
  projectName?: string;
  framework?: string;
}

export declare class ExecutionDataManager {
  constructor(options?: ExecutionDataManagerOptions);
  filePath: string;
  runId: string | null;
  accumulatedData: Record<string, unknown>;
  baseTemplate: Record<string, unknown>;
  globalStartTime: Date | null;
  moduleTimers: Map<string, Date>;
  loadData(): Record<string, unknown>;
  saveData(route: string, value: unknown): void;
  getDataFromPath<T = unknown>(route: string): T | undefined;
  getAllData(): Record<string, unknown>;
  recordStart(meta?: ExecutionStartMetadata): void;
  recordEnd(): void;
  startModule(route: string): void;
  endModule(route: string): void;
  archiveCurrentReport(): string | null;
  clearData(): void;
}
