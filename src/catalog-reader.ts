/**
 * Stable export for a future host settings UI.
 * The UI should write catalog.yaml; this module only reads it.
 * Do not register model-facing tools from this file.
 */
export { loadCatalog, parseCatalogDocument } from './catalog/index.ts'
export type {
  CatalogLoadOptions,
  DataCatalog,
  DataSourceOrigin,
  DataSourceRecord,
  DataSourceType,
  DataSourceView,
} from './catalog/index.ts'
