import type { ExecutionDataManager } from '../core/execution-data-manager.js';

export declare const REPORTER_EVENT_VERSION: '1.0';

export declare const ReporterEventType: Readonly<{
  RUN_START: 'run:start';
  RUN_END: 'run:end';
  FEATURE_START: 'feature:start';
  FEATURE_END: 'feature:end';
  SCENARIO_START: 'scenario:start';
  SCENARIO_END: 'scenario:end';
  STEP_START: 'step:start';
  STEP_END: 'step:end';
  EVIDENCE: 'evidence';
}>;

export type ReporterEventTypeValue = typeof ReporterEventType[keyof typeof ReporterEventType];

export interface ReporterEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  version: typeof REPORTER_EVENT_VERSION;
  sequence: number;
  type: ReporterEventTypeValue;
  source: string;
  timestamp: string;
  payload: TPayload;
}

export interface ReporterSink {
  handle(event: ReporterEvent): void | Promise<void>;
}

export type ReporterSinkLike = ReporterSink | ((event: ReporterEvent) => void | Promise<void>);

export interface ReporterRuntimeOptions {
  source?: string;
  clock?: () => Date | string | number;
  sinks?: ReporterSinkLike[];
}

export declare class ReporterRuntime {
  constructor(options?: ReporterRuntimeOptions);
  source: string;
  sequence: number;
  sinks: ReporterSink[];
  use(sink: ReporterSinkLike): this;
  emit<TPayload extends Record<string, unknown>>(type: ReporterEventTypeValue, payload?: TPayload): Promise<ReporterEvent<TPayload>>;
}

export interface ReporterAdapter<THooks extends object = Record<string, (...args: any[]) => unknown>> {
  readonly name: string;
  readonly hooks: Readonly<THooks>;
}

export declare function assertReporterAdapter<T extends ReporterAdapter<any>>(adapter: T): T;

export interface EvidenceArtifact {
  id?: string;
  kind: string;
  name?: string | null;
  mimeType?: string | null;
  path?: string | null;
  relativePath?: string | null;
  size?: number | null;
}

export interface SaveEvidenceOptions {
  content: unknown;
  kind?: string;
  name?: string;
  mimeType?: string;
  encoding?: 'base64' | 'utf8';
  extension?: string;
}

export interface EvidenceStore {
  save(options: SaveEvidenceOptions): EvidenceArtifact | Promise<EvidenceArtifact>;
}

export interface FileEvidenceStoreOptions {
  rootDir?: string;
  uuid?: () => string;
}

export declare class FileEvidenceStore implements EvidenceStore {
  constructor(options?: FileEvidenceStoreOptions);
  rootDir: string;
  save(options: SaveEvidenceOptions): EvidenceArtifact;
}

export declare class LegacyQReportSink implements ReporterSink {
  constructor(manager: ExecutionDataManager);
  manager: ExecutionDataManager;
  handle(event: ReporterEvent): Promise<void>;
}

export type WdioEvidenceCaptureMode = 'never' | 'on-failure' | 'always';

export interface WdioReportRedactionOptions {
  values?: string[];
  patterns?: RegExp[];
  replacement?: string;
  strict?: boolean;
}

export interface WdioCucumberAdapterOptions {
  runtime?: ReporterRuntime;
  manager?: ExecutionDataManager;
  filePath?: string;
  runId?: string;
  runIdFactory?: () => string;
  legacy?: boolean;
  evidenceStore?: EvidenceStore;
  evidenceRoot?: string;
  uuid?: () => string;
  capture?: WdioEvidenceCaptureMode;
  clock?: () => Date | string | number;
  now?: () => number;
  projectName?: string;
  onEvidenceError?: (error: unknown) => void;
  redaction?: WdioReportRedactionOptions;
}

export interface WdioCucumberHooks {
  before(capabilities?: Record<string, any>, specs?: string[], session?: any): Promise<void>;
  after(result?: number): Promise<void>;
  beforeFeature(uri?: string, feature?: Record<string, any>): Promise<void>;
  afterFeature(uri?: string, feature?: Record<string, any>): Promise<void>;
  beforeScenario(world?: Record<string, any>, context?: any): Promise<void>;
  afterScenario(world?: Record<string, any>, result?: Record<string, any>, context?: any): Promise<void>;
  beforeStep(step?: Record<string, any>, scenario?: Record<string, any>, context?: any): Promise<void>;
  afterStep(step?: Record<string, any>, scenario?: Record<string, any>, result?: Record<string, any>, context?: any): Promise<void>;
}

export declare class WdioCucumberAdapter implements ReporterAdapter<WdioCucumberHooks> {
  constructor(options: WdioCucumberAdapterOptions & { runtime: ReporterRuntime });
  readonly name: 'wdio-cucumber';
  readonly hooks: Readonly<WdioCucumberHooks>;
  runtime: ReporterRuntime;
  evidenceStore: EvidenceStore;
  capture: WdioEvidenceCaptureMode;
  manager: ExecutionDataManager | null;
  captureScreenshot(target?: { scenarioId?: string; stepId?: string }): Promise<EvidenceArtifact>;
  attachEvidence(content: unknown, options?: Omit<SaveEvidenceOptions, 'content'> & { scenarioId?: string; stepId?: string }): Promise<EvidenceArtifact>;
}

export declare function createWdioCucumberAdapter(options?: WdioCucumberAdapterOptions): WdioCucumberAdapter;
export declare function createWdioCucumberHooks(options?: WdioCucumberAdapterOptions): Readonly<WdioCucumberHooks>;
