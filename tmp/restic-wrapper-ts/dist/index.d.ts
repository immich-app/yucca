import * as z from "zod";
import EventEmitter from "node:events";
import { ChildProcess } from "node:child_process";

//#region src/utils/args.d.ts
interface Events<T> {
  event: (event: T) => void;
  process: (process: ChildProcess) => void;
}
declare const baseArgs: z.ZodObject<{
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
type Extend<T> = T extends Date ? T | string | number : T;
type DynamicBuilder<T, C> = C & { [K in keyof T]-?: T[K] extends any[] ? (...args: Extend<T[K][any]>[]) => DynamicBuilder<T, C> : T[K] extends boolean ? (arg?: boolean) => DynamicBuilder<T, C> : undefined extends T[K] ? (arg?: Extend<T[K]>) => DynamicBuilder<T, C> : (arg: Extend<T[K]>) => DynamicBuilder<T, C> };
declare abstract class ArgumentBuilder<T, Output> extends EventEmitter {
  #private;
  constructor(args?: z.ZodObject);
  get hasPassword(): boolean;
  password(password: string): this;
  passwordCommand(command: string): this;
  passwordFile(path: string): this;
  get hasRepository(): boolean;
  repository(repository: string): this;
  repositoryFile(path: string): this;
  abstract command(): string;
  abstract parse(data: T): T;
  setFilter(data: string): boolean;
  validate(): void;
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json' | 'none';
  toArgs(): string[];
  toEnv(): Record<string, string>;
  run(): Promise<Output>;
  on<K extends keyof Events<T>>(event: K, listener: Events<T>[K]): this;
  emit<K extends keyof Events<T>>(event: K, ...args: Parameters<Events<T>[K]>): boolean;
  once<K extends keyof Events<T>>(event: K, listener: Events<T>[K]): this;
  off<K extends keyof Events<T>>(event: K, listener: Events<T>[K]): this;
}
declare abstract class RepositoryArgumentBuilder<T, Output> extends ArgumentBuilder<T, Output> {
  validate(): void;
}
//#endregion
//#region src/commands/backup.d.ts
declare const backupArgs: z.ZodObject<{
  dryRun: z.ZodCoercedBoolean<unknown>;
  exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeCaches: z.ZodCoercedBoolean<unknown>;
  excludeFile: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeIfPresent: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeLargerThan: z.ZodOptional<z.ZodString>;
  filesFrom: z.ZodDefault<z.ZodArray<z.ZodString>>;
  filesFromRaw: z.ZodDefault<z.ZodArray<z.ZodString>>;
  filesFromVerbatim: z.ZodDefault<z.ZodArray<z.ZodString>>;
  force: z.ZodCoercedBoolean<unknown>;
  host: z.ZodOptional<z.ZodString>;
  iexclude: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  iexcludeFile: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  ignoreCtime: z.ZodCoercedBoolean<unknown>;
  ignoreInode: z.ZodCoercedBoolean<unknown>;
  noScan: z.ZodCoercedBoolean<unknown>;
  oneFileSystem: z.ZodCoercedBoolean<unknown>;
  parent: z.ZodOptional<z.ZodString>;
  readConcurrency: z.ZodOptional<z.ZodNumber>;
  skipIfUnchanged: z.ZodCoercedBoolean<unknown>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  time: z.ZodOptional<z.ZodDate>;
  withAtime: z.ZodCoercedBoolean<unknown>;
  groupBy: z.ZodOptional<z.ZodString>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class BackupArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof backupMessage>, z.infer<typeof backupSummaryMessage>> {
  #private;
  constructor();
  /**
   * Add one or more files to backup
   */
  addFile(...files: string[]): this;
  command(): string;
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  toArgs(): string[];
  parse(data: z.infer<typeof backupMessage>): z.infer<typeof backupMessage>;
  validate(): void;
}
/**
 * Create a new snapshot saving given files and arguments
 *
 * ```typescript
 * await backup()
 *   .repository(..)
 *   .password(..)
 *   .addFile('my.json')
 *   .addFile('path/to/folder')
 * ```
 */
declare function backup(): DynamicBuilder<z.infer<typeof backupArgs>, BackupArgumentBuilder>;
declare const backupSummaryMessage: z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  dry_run: z.ZodCoercedBoolean<unknown>;
  files_new: z.ZodNumber;
  files_changed: z.ZodNumber;
  files_unmodified: z.ZodNumber;
  dirs_new: z.ZodNumber;
  dirs_changed: z.ZodNumber;
  dirs_unmodified: z.ZodNumber;
  data_blobs: z.ZodNumber;
  tree_blobs: z.ZodNumber;
  data_added: z.ZodNumber;
  data_added_packed: z.ZodNumber;
  total_files_processed: z.ZodNumber;
  total_bytes_processed: z.ZodNumber;
  backup_start: z.ZodCoercedDate<unknown>;
  backup_end: z.ZodCoercedDate<unknown>;
  total_duration: z.ZodNumber;
  snapshot_id: z.ZodString;
}, z.core.$strip>;
declare const backupMessage: z.ZodUnion<readonly [z.ZodObject<{
  message_type: z.ZodLiteral<"status">;
  seconds_elapsed: z.ZodOptional<z.ZodNumber>;
  seconds_remaining: z.ZodOptional<z.ZodNumber>;
  percent_done: z.ZodNumber;
  total_files: z.ZodNumber;
  total_bytes: z.ZodNumber;
  files_done: z.ZodOptional<z.ZodNumber>;
  bytes_done: z.ZodOptional<z.ZodNumber>;
  error_count: z.ZodOptional<z.ZodNumber>;
  current_files: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"verbose_status">;
  action: z.ZodEnum<{
    new: "new";
    unchanged: "unchanged";
    modified: "modified";
    scan_finished: "scan_finished";
  }>;
  item: z.ZodString;
  duration: z.ZodNumber;
  data_size: z.ZodNumber;
  data_size_in_repo: z.ZodNumber;
  metadata_size: z.ZodNumber;
  metadata_size_in_repo: z.ZodNumber;
  total_files: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  dry_run: z.ZodCoercedBoolean<unknown>;
  files_new: z.ZodNumber;
  files_changed: z.ZodNumber;
  files_unmodified: z.ZodNumber;
  dirs_new: z.ZodNumber;
  dirs_changed: z.ZodNumber;
  dirs_unmodified: z.ZodNumber;
  data_blobs: z.ZodNumber;
  tree_blobs: z.ZodNumber;
  data_added: z.ZodNumber;
  data_added_packed: z.ZodNumber;
  total_files_processed: z.ZodNumber;
  total_bytes_processed: z.ZodNumber;
  backup_start: z.ZodCoercedDate<unknown>;
  backup_end: z.ZodCoercedDate<unknown>;
  total_duration: z.ZodNumber;
  snapshot_id: z.ZodString;
}, z.core.$strip>]>;
//#endregion
//#region src/commands/cat.d.ts
declare class CatArgumentBuilder extends RepositoryArgumentBuilder<any, any> {
  #private;
  /**
   * The object to read from.
   */
  target(target: 'masterkey' | 'config'): this;
  target(target: 'pack' | 'blob' | 'snapshot' | 'index' | 'key' | 'lock', id: string): this;
  target(target: 'tree', path: string): this;
  command(): string;
  validate(): void;
  format(): 'jsonlines' | 'json';
  toArgs(): string[];
  parse(data: any): any;
}
/**
 * Fetch data about various objects in repository.
 *
 * ```typescript
 * const result = await cat()
 *   .repository(join(dir, 'repository'))
 *   .password('password')
 *   .target('masterkey')
 *   .run();
 * ```
 */
declare function cat(): DynamicBuilder<z.infer<typeof baseArgs>, CatArgumentBuilder>;
//#endregion
//#region src/commands/check.d.ts
declare const checkArgs: z.ZodObject<{
  readData: z.ZodCoercedBoolean<unknown>;
  readDataSubset: z.ZodOptional<z.ZodString>;
  withCache: z.ZodCoercedBoolean<unknown>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class CheckArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof checkMessage>, z.infer<typeof checkMessage>[]> {
  constructor();
  command(): string;
  parse(data: z.infer<typeof checkMessage>): z.infer<typeof checkMessage>;
}
/**
 * Test repository for errors and report any errors it finds.
 *
 * ```typescript
 * const result = await check()
 *   .repository(..)
 *   .password(..)
 *   .run();
 * ```
 */
declare function check(): DynamicBuilder<z.infer<typeof checkArgs>, CheckArgumentBuilder>;
declare const checkMessage: z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  num_errors: z.ZodNumber;
  broken_packs: z.ZodNullable<z.ZodArray<z.ZodString>>;
  suggest_repair_index: z.ZodCoercedBoolean<unknown>;
  suggest_prune: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
//#endregion
//#region src/commands/diff.d.ts
declare const diffArgs: z.ZodObject<{
  metadata: z.ZodCoercedBoolean<unknown>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class DiffArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof diffMessage>, z.infer<typeof diffMessage>[]> {
  #private;
  constructor();
  compare(snapshotA: string, snapshotB: string): this;
  command(): string;
  toArgs(): string[];
  parse(data: z.infer<typeof diffMessage>): z.infer<typeof diffMessage>;
  validate(): void;
}
/**
 * Test repository for errors and report any errors it finds.
 *
 * ```typescript
 * const diff = await diff()
 *   .repository(..)
 *   .password(..)
 *   .compare("a", "b");
 * ```
 */
declare function diff(): DynamicBuilder<z.infer<typeof diffArgs>, DiffArgumentBuilder>;
declare const diffMessage: z.ZodUnion<readonly [z.ZodObject<{
  message_type: z.ZodLiteral<"change">;
  path: z.ZodString;
  modifier: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"statistics">;
  source_snapshot: z.ZodString;
  target_snapshot: z.ZodString;
  changes_files: z.ZodOptional<z.ZodNumber>;
  added: z.ZodObject<{
    files: z.ZodNumber;
    dirs: z.ZodNumber;
    others: z.ZodNumber;
    data_blobs: z.ZodNumber;
    tree_blobs: z.ZodNumber;
    bytes: z.ZodNumber;
  }, z.core.$strip>;
  removed: z.ZodObject<{
    files: z.ZodNumber;
    dirs: z.ZodNumber;
    others: z.ZodNumber;
    data_blobs: z.ZodNumber;
    tree_blobs: z.ZodNumber;
    bytes: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>]>;
//#endregion
//#region src/commands/find.d.ts
declare const findArgs: z.ZodObject<{
  ignoreCase: z.ZodCoercedBoolean<unknown>;
  newest: z.ZodOptional<z.ZodString>;
  oldest: z.ZodOptional<z.ZodString>;
  reverse: z.ZodCoercedBoolean<unknown>;
  showPackId: z.ZodCoercedBoolean<unknown>;
  snapshot: z.ZodDefault<z.ZodArray<z.ZodString>>;
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class FindArgumentBuilder<T> extends RepositoryArgumentBuilder<T, T> {
  #private;
  constructor();
  blob(): DynamicBuilder<z.infer<typeof findArgs>, FindArgumentBuilder<z.infer<typeof blobResults>>>;
  tree(): DynamicBuilder<z.infer<typeof findArgs>, FindArgumentBuilder<z.infer<typeof treeResults>>>;
  object(): DynamicBuilder<z.infer<typeof findArgs>, FindArgumentBuilder<z.infer<typeof objectResults>>>;
  match(match: string): this;
  command(): string;
  toArgs(): string[];
  format(): 'jsonlines' | 'json';
  parse(data: T): T;
  validate(): void;
}
/**
 * Find matches for given search terms
 *
 * ```typescript
 * const results = await find()
 *   .repository(..)
 *   .password(..)
 *   .match('*.json')
 *   .match('*.yml')
 *   .run();
 * ```
 */
declare function find(): DynamicBuilder<z.infer<typeof findArgs>, FindArgumentBuilder<z.infer<typeof objectResults>>>;
declare const objectResults: z.ZodArray<z.ZodObject<{
  hits: z.ZodNumber;
  snapshot: z.ZodString;
  matches: z.ZodArray<z.ZodObject<{
    path: z.ZodString;
    permissions: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    atime: z.ZodCoercedDate<unknown>;
    mtime: z.ZodCoercedDate<unknown>;
    ctime: z.ZodCoercedDate<unknown>;
    user: z.ZodString;
    group: z.ZodString;
    inode: z.ZodNumber;
    mode: z.ZodNumber;
    device_id: z.ZodNumber;
    links: z.ZodNumber;
    link_target: z.ZodOptional<z.ZodString>;
    uid: z.ZodNumber;
    gid: z.ZodNumber;
    size: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>>;
declare const blobResults: z.ZodArray<z.ZodObject<{
  object_type: z.ZodLiteral<"blob">;
  id: z.ZodString;
  path: z.ZodString;
  parent_tree: z.ZodString;
  snapshot: z.ZodString;
  time: z.ZodString;
}, z.core.$strip>>;
declare const treeResults: z.ZodArray<z.ZodObject<{
  object_type: z.ZodLiteral<"tree">;
  id: z.ZodString;
  path: z.ZodString;
  parent_tree: z.ZodString;
  snapshot: z.ZodString;
  time: z.ZodString;
}, z.core.$strip>>;
//#endregion
//#region src/commands/forget.d.ts
declare const baseForgetArgs: z.ZodObject<{
  dryRun: z.ZodCoercedBoolean<unknown>;
  prune: z.ZodCoercedBoolean<unknown>;
  maxUnused: z.ZodOptional<z.ZodString>;
  maxRepackSize: z.ZodOptional<z.ZodString>;
  repackCacheableOnly: z.ZodCoercedBoolean<unknown>;
  repackSmall: z.ZodCoercedBoolean<unknown>;
  repackUncompressed: z.ZodCoercedBoolean<unknown>;
  repackSmallerThan: z.ZodOptional<z.ZodString>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare const allForgetArgs: z.ZodObject<{
  keepLast: z.ZodOptional<z.ZodNumber>;
  keepHourly: z.ZodOptional<z.ZodString>;
  keepDaily: z.ZodOptional<z.ZodString>;
  keepWeekly: z.ZodOptional<z.ZodString>;
  keepMonthly: z.ZodOptional<z.ZodString>;
  keepYearly: z.ZodOptional<z.ZodString>;
  keepWithin: z.ZodOptional<z.ZodString>;
  keepWithinHourly: z.ZodOptional<z.ZodString>;
  keepWithinDaily: z.ZodOptional<z.ZodString>;
  keepWithinWeekly: z.ZodOptional<z.ZodString>;
  keepWithinMonthly: z.ZodOptional<z.ZodString>;
  keepWithinYearly: z.ZodOptional<z.ZodString>;
  keepTag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  unsafeAllowRemoveAll: z.ZodCoercedBoolean<unknown>;
  groupBy: z.ZodOptional<z.ZodString>;
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  dryRun: z.ZodCoercedBoolean<unknown>;
  prune: z.ZodCoercedBoolean<unknown>;
  maxUnused: z.ZodOptional<z.ZodString>;
  maxRepackSize: z.ZodOptional<z.ZodString>;
  repackCacheableOnly: z.ZodCoercedBoolean<unknown>;
  repackSmall: z.ZodCoercedBoolean<unknown>;
  repackUncompressed: z.ZodCoercedBoolean<unknown>;
  repackSmallerThan: z.ZodOptional<z.ZodString>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class ForgetArgumentBuilder<T> extends RepositoryArgumentBuilder<T, T> {
  #private;
  constructor();
  snapshot(...snapshots: string[]): DynamicBuilder<z.infer<typeof baseForgetArgs>, ForgetArgumentBuilder<void>>;
  command(): string;
  toArgs(): string[];
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json' | 'none';
  parse(data: T): T;
}
/**
 * Remove snapshots according to given policy.
 *
 * ```typescript
 * const results = await forget()
 *   .repository(..)
 *   .password(..)
 *   .keepLast(5)
 *   .run();
 * ```
 */
declare function forget(): DynamicBuilder<z.infer<typeof allForgetArgs>, ForgetArgumentBuilder<z.infer<typeof forgetMessage>>>;
declare const forgetMessage: z.ZodArray<z.ZodObject<{
  tags: z.ZodNullable<z.ZodArray<z.ZodString>>;
  host: z.ZodString;
  paths: z.ZodArray<z.ZodString>;
  keep: z.ZodArray<z.ZodObject<{
    time: z.ZodCoercedDate<unknown>;
    parent: z.ZodOptional<z.ZodString>;
    tree: z.ZodString;
    paths: z.ZodArray<z.ZodString>;
    hostname: z.ZodString;
    username: z.ZodString;
    uid: z.ZodNumber;
    gid: z.ZodNumber;
    excludes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    program_version: z.ZodString;
    summary: z.ZodObject<{
      backup_start: z.ZodCoercedDate<unknown>;
      backup_end: z.ZodCoercedDate<unknown>;
      files_new: z.ZodNumber;
      files_changed: z.ZodNumber;
      files_unmodified: z.ZodNumber;
      dirs_new: z.ZodNumber;
      dirs_changed: z.ZodNumber;
      dirs_unmodified: z.ZodNumber;
      data_blobs: z.ZodNumber;
      tree_blobs: z.ZodNumber;
      data_added: z.ZodNumber;
      data_added_packed: z.ZodNumber;
      total_files_processed: z.ZodNumber;
      total_bytes_processed: z.ZodNumber;
    }, z.core.$strip>;
    id: z.ZodString;
    short_id: z.ZodString;
  }, z.core.$strip>>;
  remove: z.ZodArray<z.ZodObject<{
    time: z.ZodCoercedDate<unknown>;
    parent: z.ZodOptional<z.ZodString>;
    tree: z.ZodString;
    paths: z.ZodArray<z.ZodString>;
    hostname: z.ZodString;
    username: z.ZodString;
    uid: z.ZodNumber;
    gid: z.ZodNumber;
    excludes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    program_version: z.ZodString;
    summary: z.ZodObject<{
      backup_start: z.ZodCoercedDate<unknown>;
      backup_end: z.ZodCoercedDate<unknown>;
      files_new: z.ZodNumber;
      files_changed: z.ZodNumber;
      files_unmodified: z.ZodNumber;
      dirs_new: z.ZodNumber;
      dirs_changed: z.ZodNumber;
      dirs_unmodified: z.ZodNumber;
      data_blobs: z.ZodNumber;
      tree_blobs: z.ZodNumber;
      data_added: z.ZodNumber;
      data_added_packed: z.ZodNumber;
      total_files_processed: z.ZodNumber;
      total_bytes_processed: z.ZodNumber;
    }, z.core.$strip>;
    id: z.ZodString;
    short_id: z.ZodString;
  }, z.core.$strip>>;
  reasons: z.ZodArray<z.ZodObject<{
    snapshot: z.ZodObject<{
      time: z.ZodCoercedDate<unknown>;
      parent: z.ZodOptional<z.ZodString>;
      tree: z.ZodString;
      paths: z.ZodArray<z.ZodString>;
      hostname: z.ZodString;
      username: z.ZodString;
      uid: z.ZodNumber;
      gid: z.ZodNumber;
      excludes: z.ZodOptional<z.ZodArray<z.ZodString>>;
      tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
      program_version: z.ZodString;
      summary: z.ZodObject<{
        backup_start: z.ZodCoercedDate<unknown>;
        backup_end: z.ZodCoercedDate<unknown>;
        files_new: z.ZodNumber;
        files_changed: z.ZodNumber;
        files_unmodified: z.ZodNumber;
        dirs_new: z.ZodNumber;
        dirs_changed: z.ZodNumber;
        dirs_unmodified: z.ZodNumber;
        data_blobs: z.ZodNumber;
        tree_blobs: z.ZodNumber;
        data_added: z.ZodNumber;
        data_added_packed: z.ZodNumber;
        total_files_processed: z.ZodNumber;
        total_bytes_processed: z.ZodNumber;
      }, z.core.$strip>;
      id: z.ZodString;
      short_id: z.ZodString;
    }, z.core.$strip>;
    matches: z.ZodArray<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>>;
//#endregion
//#region src/commands/init.d.ts
declare const initArgs: z.ZodObject<{
  copyChunkerParams: z.ZodCoercedBoolean<unknown>;
  fromInsecureNoPassword: z.ZodCoercedBoolean<unknown>;
  fromPasswordCommand: z.ZodOptional<z.ZodString>;
  fromPasswordFile: z.ZodOptional<z.ZodString>;
  fromRepo: z.ZodOptional<z.ZodString>;
  fromRepositoryFile: z.ZodOptional<z.ZodString>;
  repositoryVersion: z.ZodOptional<z.ZodEnum<{
    latest: "latest";
    stable: "stable";
  }>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class InitArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof initMessage>, z.infer<typeof initMessage>> {
  constructor();
  command(): string;
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  parse(data: z.infer<typeof initMessage>): z.infer<typeof initMessage>;
}
/**
 * Initialise a new repository
 *
 * ```typescript
 * await init()
 *   .repository(..)
 *   .password(..)
 * ```
 */
declare function init(): DynamicBuilder<z.infer<typeof initArgs>, InitArgumentBuilder>;
declare const initMessage: z.ZodObject<{
  message_type: z.ZodLiteral<"initialized">;
  id: z.ZodString;
  repository: z.ZodString;
}, z.core.$strip>;
//#endregion
//#region src/commands/keyList.d.ts
declare class KeyListArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof keyListMessage>, z.infer<typeof keyListMessage>> {
  command(): string;
  toArgs(): string[];
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  parse(data: z.infer<typeof keyListMessage>): z.infer<typeof keyListMessage>;
}
/**
 * List all keys (passwords) associated with the repository
 *
 * ```typescript
 * const keys = await keyList()
 *   .repository(..)
 *   .password(..);
 * ```
 */
declare function keyList(): DynamicBuilder<z.infer<typeof baseArgs>, KeyListArgumentBuilder>;
declare const keyListMessage: z.ZodArray<z.ZodObject<{
  current: z.ZodBoolean;
  id: z.ZodString;
  userName: z.ZodString;
  hostName: z.ZodString;
  created: z.ZodCoercedDate<unknown>;
}, z.core.$strip>>;
//#endregion
//#region src/commands/ls.d.ts
declare const lsArgs: z.ZodObject<{
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  recursive: z.ZodCoercedBoolean<unknown>;
  reverse: z.ZodCoercedBoolean<unknown>;
  sort: z.ZodOptional<z.ZodEnum<{
    time: "time";
    name: "name";
    atime: "atime";
    mtime: "mtime";
    ctime: "ctime";
    size: "size";
    extension: "extension";
  }>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class LsArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof lsMessage>, z.infer<typeof lsMessage>[]> {
  #private;
  constructor();
  /**
   * Select directory/directories to filter by
   */
  directory(...path: string[]): this;
  /**
   * Select snapshot to list
   */
  snapshot(snapshotId: string): this;
  /**
   * Use latest snapshot
   */
  latest(): this;
  command(): string;
  toArgs(): string[];
  parse(data: z.infer<typeof lsMessage>): z.infer<typeof lsMessage>;
  validate(): void;
}
/**
 * List files in a snapshot.
 *
 * ```typescript
 * await ls()
 *   .repository(..)
 *   .password(..)
 *   .snapshot(..)
 *   .run();
 * ```
 */
declare function ls(): DynamicBuilder<z.infer<typeof lsArgs>, LsArgumentBuilder>;
declare const lsMessage: z.ZodUnion<readonly [z.ZodObject<{
  time: z.ZodCoercedDate<unknown>;
  parent: z.ZodOptional<z.ZodString>;
  tree: z.ZodString;
  paths: z.ZodArray<z.ZodString>;
  hostname: z.ZodString;
  username: z.ZodString;
  uid: z.ZodNumber;
  gid: z.ZodNumber;
  excludes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  program_version: z.ZodString;
  summary: z.ZodObject<{
    backup_start: z.ZodCoercedDate<unknown>;
    backup_end: z.ZodCoercedDate<unknown>;
    files_new: z.ZodNumber;
    files_changed: z.ZodNumber;
    files_unmodified: z.ZodNumber;
    dirs_new: z.ZodNumber;
    dirs_changed: z.ZodNumber;
    dirs_unmodified: z.ZodNumber;
    data_blobs: z.ZodNumber;
    tree_blobs: z.ZodNumber;
    data_added: z.ZodNumber;
    data_added_packed: z.ZodNumber;
    total_files_processed: z.ZodNumber;
    total_bytes_processed: z.ZodNumber;
  }, z.core.$strip>;
  id: z.ZodString;
  short_id: z.ZodString;
  message_type: z.ZodLiteral<"snapshot">;
  struct_type: z.ZodLiteral<"snapshot">;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"node">;
  struct_type: z.ZodLiteral<"node">;
  name: z.ZodString;
  type: z.ZodString;
  path: z.ZodString;
  uid: z.ZodNumber;
  gid: z.ZodNumber;
  size: z.ZodOptional<z.ZodNumber>;
  mode: z.ZodNumber;
  permissions: z.ZodString;
  atime: z.ZodCoercedDate<unknown>;
  mtime: z.ZodCoercedDate<unknown>;
  ctime: z.ZodCoercedDate<unknown>;
  inode: z.ZodNumber;
}, z.core.$strip>]>;
//#endregion
//#region src/commands/restore.d.ts
declare const restoreArgs: z.ZodObject<{
  delete: z.ZodCoercedBoolean<unknown>;
  dryRun: z.ZodCoercedBoolean<unknown>;
  exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeFile: z.ZodDefault<z.ZodArray<z.ZodString>>;
  excludeXattr: z.ZodDefault<z.ZodArray<z.ZodString>>;
  iexcludePattern: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  iexcludeFile: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  iincludePattern: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  iincludeFile: z.ZodDefault<z.ZodArray<z.ZodCoercedString<unknown>>>;
  include: z.ZodDefault<z.ZodArray<z.ZodString>>;
  includeFile: z.ZodDefault<z.ZodArray<z.ZodString>>;
  includeXattr: z.ZodDefault<z.ZodArray<z.ZodString>>;
  overwrite: z.ZodOptional<z.ZodEnum<{
    never: "never";
    always: "always";
    "if-changed": "if-changed";
    "if-newer": "if-newer";
  }>>;
  sparse: z.ZodCoercedBoolean<unknown>;
  target: z.ZodArray<z.ZodString>;
  verify: z.ZodCoercedBoolean<unknown>;
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class RestoreArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof restoreMessage>, z.infer<typeof restoreSummaryMessage>> {
  #private;
  constructor();
  snapshot(snapshot: string): this;
  command(): string;
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  toArgs(): string[];
  parse(data: z.infer<typeof restoreMessage>): z.infer<typeof restoreMessage>;
  validate(): void;
}
/**
 * Create a new snapshot saving given files and arguments
 *
 * ```typescript
 * await restore()
 *   .repository(..)
 *   .password(..)
 *   .snapshot(..)
 *   .target(..);
 * ```
 */
declare function restore(): DynamicBuilder<z.infer<typeof restoreArgs>, RestoreArgumentBuilder>;
declare const restoreSummaryMessage: z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  seconds_elapsed: z.ZodOptional<z.ZodNumber>;
  total_files: z.ZodOptional<z.ZodNumber>;
  files_restored: z.ZodOptional<z.ZodNumber>;
  files_skipped: z.ZodOptional<z.ZodNumber>;
  files_deleted: z.ZodOptional<z.ZodNumber>;
  total_bytes: z.ZodOptional<z.ZodNumber>;
  bytes_restored: z.ZodOptional<z.ZodNumber>;
  bytes_skipped: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
declare const restoreMessage: z.ZodUnion<readonly [z.ZodObject<{
  message_type: z.ZodLiteral<"status">;
  seconds_elapsed: z.ZodOptional<z.ZodNumber>;
  percent_done: z.ZodNumber;
  total_files: z.ZodOptional<z.ZodNumber>;
  files_restored: z.ZodOptional<z.ZodNumber>;
  files_skipped: z.ZodOptional<z.ZodNumber>;
  files_deleted: z.ZodOptional<z.ZodNumber>;
  total_bytes: z.ZodOptional<z.ZodNumber>;
  bytes_restored: z.ZodOptional<z.ZodNumber>;
  bytes_skipped: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"verbose_status">;
  action: z.ZodEnum<{
    unchanged: "unchanged";
    restored: "restored";
    updated: "updated";
    deleted: "deleted";
  }>;
  item: z.ZodString;
  size: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  seconds_elapsed: z.ZodOptional<z.ZodNumber>;
  total_files: z.ZodOptional<z.ZodNumber>;
  files_restored: z.ZodOptional<z.ZodNumber>;
  files_skipped: z.ZodOptional<z.ZodNumber>;
  files_deleted: z.ZodOptional<z.ZodNumber>;
  total_bytes: z.ZodOptional<z.ZodNumber>;
  bytes_restored: z.ZodOptional<z.ZodNumber>;
  bytes_skipped: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>]>;
//#endregion
//#region src/commands/snapshots.d.ts
declare const snapshotsArgs: z.ZodObject<{
  latest: z.ZodOptional<z.ZodNumber>;
  groupBy: z.ZodOptional<z.ZodString>;
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class SnapshotsArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof snapshotsMessage>, z.infer<typeof snapshotsMessage>> {
  constructor();
  command(): string;
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  parse(data: z.infer<typeof snapshotsMessage>): z.infer<typeof snapshotsMessage>;
}
/**
 * List all snapshots
 *
 * ```typescript
 * const snapshots = await snapshots()
 *   .repository(..)
 *   .password(..)
 *   .run();
 * ```
 */
declare function snapshots(): DynamicBuilder<z.infer<typeof snapshotsArgs>, SnapshotsArgumentBuilder>;
declare const snapshotsMessage: z.ZodArray<z.ZodObject<{
  time: z.ZodCoercedDate<unknown>;
  parent: z.ZodOptional<z.ZodString>;
  tree: z.ZodString;
  paths: z.ZodArray<z.ZodString>;
  hostname: z.ZodString;
  username: z.ZodString;
  uid: z.ZodNumber;
  gid: z.ZodNumber;
  excludes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  program_version: z.ZodString;
  summary: z.ZodObject<{
    backup_start: z.ZodCoercedDate<unknown>;
    backup_end: z.ZodCoercedDate<unknown>;
    files_new: z.ZodNumber;
    files_changed: z.ZodNumber;
    files_unmodified: z.ZodNumber;
    dirs_new: z.ZodNumber;
    dirs_changed: z.ZodNumber;
    dirs_unmodified: z.ZodNumber;
    data_blobs: z.ZodNumber;
    tree_blobs: z.ZodNumber;
    data_added: z.ZodNumber;
    data_added_packed: z.ZodNumber;
    total_files_processed: z.ZodNumber;
    total_bytes_processed: z.ZodNumber;
  }, z.core.$strip>;
  id: z.ZodString;
  short_id: z.ZodString;
}, z.core.$strip>>;
//#endregion
//#region src/commands/stats.d.ts
declare const statsArgs: z.ZodObject<{
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class StatsArgumentBuilder<T> extends RepositoryArgumentBuilder<T, T> {
  #private;
  constructor();
  /**
   * Select snapshot(s) to generate stats for
   */
  snapshot(...snapshots: string[]): this;
  /**
   * Set counting mode to restore size
   */
  modeRestoreSize(): StatsArgumentBuilder<z.infer<typeof restoreSizeMessage>>;
  /**
   * Set counting mode to files by content
   */
  modeFilesByContents(): StatsArgumentBuilder<z.infer<typeof filesByContentsMessage>>;
  /**
   * Set counting mode to blobs per file
   */
  modeBlobsPerFile(): StatsArgumentBuilder<z.infer<typeof blobsPerFileMessage>>;
  /**
   * Set counting mode to raw data
   */
  modeRawData(): StatsArgumentBuilder<z.infer<typeof rawDataMessage>>;
  command(): string;
  toArgs(): string[];
  format(): 'jsonlines' | 'jsonlines-no-log' | 'json';
  parse(data: T): T;
}
/**
 * Walk one or more snapshots in a repository to accumulate statistics
 *
 * ```typescript
 * const stats = await stats()
 *   .repository(..)
 *   .password(..)
 *   .snapshot(..);
 * ```
 */
declare function stats(): DynamicBuilder<z.infer<typeof statsArgs>, StatsArgumentBuilder<z.infer<typeof restoreSizeMessage>>>;
declare const restoreSizeMessage: z.ZodObject<{
  snapshots_count: z.ZodNumber;
  total_file_count: z.ZodOptional<z.ZodNumber>;
  total_size: z.ZodNumber;
}, z.core.$strip>;
declare const filesByContentsMessage: z.ZodObject<{
  snapshots_count: z.ZodNumber;
  total_file_count: z.ZodOptional<z.ZodNumber>;
  total_size: z.ZodNumber;
}, z.core.$strip>;
declare const blobsPerFileMessage: z.ZodObject<{
  snapshots_count: z.ZodNumber;
  total_blob_count: z.ZodOptional<z.ZodNumber>;
  total_file_count: z.ZodOptional<z.ZodNumber>;
  total_size: z.ZodNumber;
}, z.core.$strip>;
declare const rawDataMessage: z.ZodObject<{
  compression_progress: z.ZodOptional<z.ZodNumber>;
  compression_ratio: z.ZodOptional<z.ZodNumber>;
  compression_space_saving: z.ZodOptional<z.ZodNumber>;
  snapshots_count: z.ZodNumber;
  total_blob_count: z.ZodOptional<z.ZodNumber>;
  total_size: z.ZodNumber;
  total_uncompressed_size: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
//#endregion
//#region src/commands/tag.d.ts
declare const tagArgs: z.ZodObject<{
  add: z.ZodDefault<z.ZodArray<z.ZodString>>;
  remove: z.ZodDefault<z.ZodArray<z.ZodString>>;
  set: z.ZodDefault<z.ZodArray<z.ZodString>>;
  host: z.ZodDefault<z.ZodArray<z.ZodString>>;
  path: z.ZodDefault<z.ZodArray<z.ZodString>>;
  tag: z.ZodDefault<z.ZodArray<z.ZodString>>;
  cacert: z.ZodOptional<z.ZodString>;
  cacheDir: z.ZodOptional<z.ZodString>;
  cleanupCache: z.ZodCoercedBoolean<unknown>;
  compression: z.ZodOptional<z.ZodEnum<{
    auto: "auto";
    off: "off";
    max: "max";
  }>>;
  httpUserAgent: z.ZodOptional<z.ZodString>;
  insecureNoPassword: z.ZodCoercedBoolean<unknown>;
  insecureTls: z.ZodCoercedBoolean<unknown>;
  keyHint: z.ZodOptional<z.ZodString>;
  limitDownload: z.ZodOptional<z.ZodNumber>;
  limitUpload: z.ZodOptional<z.ZodNumber>;
  noCache: z.ZodCoercedBoolean<unknown>;
  noExtraVerify: z.ZodCoercedBoolean<unknown>;
  noLock: z.ZodCoercedBoolean<unknown>;
  option: z.ZodOptional<z.ZodString>;
  packSize: z.ZodOptional<z.ZodNumber>;
  retryLock: z.ZodOptional<z.ZodString>;
  stuckRequestTimeout: z.ZodOptional<z.ZodString>;
  tlsClientCert: z.ZodOptional<z.ZodString>;
  verbose: z.ZodCoercedBoolean<unknown>;
}, z.core.$strip>;
declare class TagArgumentBuilder extends RepositoryArgumentBuilder<z.infer<typeof tagMessage>, z.infer<typeof tagMessage>[]> {
  #private;
  constructor();
  snapshot(...snapshots: string[]): this;
  command(): string;
  setFilter(line: string): boolean;
  toArgs(): string[];
  parse(data: z.infer<typeof tagMessage>): z.infer<typeof tagMessage>;
}
/**
 * Modify tags on existing snapshots
 *
 * ```typescript
 * await tag()
 *   .repository(..)
 *   .password(..)
 *   .set('my', 'tag')
 *   .snapshot(..)
 *   .run();
 * ```
 */
declare function tag(): DynamicBuilder<z.infer<typeof tagArgs>, TagArgumentBuilder>;
declare const tagMessage: z.ZodUnion<readonly [z.ZodObject<{
  message_type: z.ZodLiteral<"changed">;
  old_snapshot_id: z.ZodString;
  new_snapshot_id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"summary">;
  changed_snapshots: z.ZodNumber;
}, z.core.$strip>]>;
//#endregion
//#region src/commands/version.d.ts
/**
 * Get version information about restic
 *
 * ```typescript
 * const restic = await version();
 * ```
 */
declare function version(): Promise<z.infer<typeof versionMessage>>;
declare const versionMessage: z.ZodObject<{
  message_type: z.ZodLiteral<"version">;
  version: z.ZodString;
  go_version: z.ZodString;
  go_os: z.ZodString;
  go_arch: z.ZodString;
}, z.core.$strip>;
//#endregion
//#region src/errors.d.ts
declare class MissingFilesError extends Error {
  constructor();
}
declare class MissingRepositoryError extends Error {
  constructor();
}
declare class MissingPasswordError extends Error {
  constructor();
}
declare class MissingSnapshotError extends Error {
  constructor();
}
declare class MissingTargetError extends Error {
  constructor();
}
declare class MissingMatchError extends Error {
  constructor();
}
declare class MissingCompareError extends Error {
  constructor();
}
declare const errorMessage: z.ZodUnion<readonly [z.ZodObject<{
  message_type: z.ZodLiteral<"exit_error">;
  code: z.ZodNumber;
  message: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"error">;
  message: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodObject<{
    message: z.ZodString;
  }, z.core.$strip>>;
  during: z.ZodOptional<z.ZodString>;
  item: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  message_type: z.ZodLiteral<"raw">;
  message: z.ZodString;
}, z.core.$strip>]>;
declare class TryParseError extends Error {
  error: z.infer<typeof errorMessage>[] | string;
  constructor(message: string);
}
declare class ResticUnknownError extends Error {}
declare class ResticGoRuntimeError extends Error {}
declare class ResticCommandFailedError extends TryParseError {}
declare class ResticBackupCommandCouldNotReadSourceDataError extends TryParseError {}
declare class ResticRepositoryDoesNotExistError extends TryParseError {}
declare class ResticFailedToLockRepositoryError extends TryParseError {}
declare class ResticWrongPasswordError extends TryParseError {}
declare class ResticInterruptedError extends TryParseError {}
//#endregion
export { MissingCompareError, MissingFilesError, MissingMatchError, MissingPasswordError, MissingRepositoryError, MissingSnapshotError, MissingTargetError, ResticBackupCommandCouldNotReadSourceDataError, ResticCommandFailedError, ResticFailedToLockRepositoryError, ResticGoRuntimeError, ResticInterruptedError, ResticRepositoryDoesNotExistError, ResticUnknownError, ResticWrongPasswordError, backup, cat, check, diff, find, forget, init, keyList, ls, restore, snapshots, stats, tag, version };
//# sourceMappingURL=index.d.ts.map