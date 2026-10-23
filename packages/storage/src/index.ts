export { createMemoryStorage } from './adapters/memory'
export {
  createStorageAreaAdapter,
  type StorageAreaAdapterOptions,
  type StorageAreaLike,
} from './adapters/storage-area'
export {
  createIndexedDbStorage,
  type IndexedDbStorage,
  type IndexedDbStorageOptions,
} from './adapters/indexeddb'
export {
  createHostStorage,
  type HostStorageBackend,
  type HostStorageOptions,
} from './adapters/host'
export {
  createAutofillStore,
  type AnswerBulkPatch,
  type AutofillStore,
  type AutofillStoreOptions,
  type SaveAnswerResult,
  type StoreChange,
  type StoreError,
  type StoreSnapshot,
  type StoreStatus,
} from './store/store'
export type {
  AnswerDraft,
  AnswerPatch,
  CustomFieldDraft,
  CustomFieldPatch,
  ProfileDraft,
  ProfilePatch,
} from './store/drafts'
export { normalizeSite } from './store/drafts'
export {
  COLLECTION_KEYS,
  META_KEY,
  type AutofillData,
  type CollectionKey,
  type DataMeta,
} from './store/keys'
export type { DataIssue } from './store/load'
export {
  DATA_MIGRATIONS,
  latestVersion,
  migrateData,
  type DataMigration,
  type MigrationContext,
  type MigrationOutcome,
} from './store/migrations'
export {
  answerForKey,
  answerKeyOf,
  answersForProfile,
  collectTags,
  findDuplicateAnswers,
  findDuplicateOf,
  isContextEmpty,
  queryAnswers,
  resolveActiveProfile,
  type AnswerQuery,
  type AnswerScope,
  type AnswerSort,
  type DuplicateReport,
} from './store/queries'
export {
  buildExport,
  parseImport,
  planImport,
  serializeExport,
  type ExportOptions,
  type ImportOptions,
  type ImportReport,
  type ImportStrategy,
  type ParsedImport,
} from './store/transfer'
