import { AutofillError } from '../errors'
import {
  PLUGIN_API_VERSION,
  type AutofillAction,
  type AutofillPlugin,
  type FieldDetector,
  type FieldValueValidator,
  type FormActionPolicy,
  type GeneratorProvider,
  type MatchingStrategy,
  type PortalAdapter,
  type SemanticClassifier,
} from '../interfaces/plugins'

export type ExtensionPoint =
  | 'detector'
  | 'classifier'
  | 'matcher'
  | 'generator'
  | 'validator'
  | 'policy'
  | 'portalAdapter'
  | 'action'

interface ExtensionPointMap {
  detector: FieldDetector
  classifier: SemanticClassifier
  matcher: MatchingStrategy
  generator: GeneratorProvider
  validator: FieldValueValidator
  policy: FormActionPolicy
  portalAdapter: PortalAdapter
  action: AutofillAction
}

const REQUIRED_METHODS: { [K in ExtensionPoint]: readonly (keyof ExtensionPointMap[K])[] } = {
  detector: ['detect'],
  classifier: ['classify'],
  matcher: ['match'],
  generator: ['supports', 'generate'],
  validator: ['validate'],
  policy: ['evaluate'],
  portalAdapter: ['canHandle'],
  action: ['run'],
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/

export interface RegisterOptions {
  /** Replace an existing registration with the same id instead of throwing. */
  replace?: boolean
}

function compareEntries(
  a: { order?: number; id: string },
  b: { order?: number; id: string },
): number {
  const orderDelta = (a.order ?? 100) - (b.order ?? 100)
  return orderDelta !== 0 ? orderDelta : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Validated plugin registry. Registrations are checked for id format, API version and required
 * methods; duplicate ids conflict unless `replace` is set; listings are sorted by (order, id).
 * Plugins are code supplied by the host at build time. Saved values and imported configuration
 * can only reference registered ids, never introduce executable code.
 */
export class PluginRegistry {
  private readonly entries: { [K in ExtensionPoint]: Map<string, ExtensionPointMap[K]> } = {
    detector: new Map(),
    classifier: new Map(),
    matcher: new Map(),
    generator: new Map(),
    validator: new Map(),
    policy: new Map(),
    portalAdapter: new Map(),
    action: new Map(),
  }

  private readonly sortedCache = new Map<ExtensionPoint, readonly unknown[]>()

  register<K extends ExtensionPoint>(
    point: K,
    plugin: ExtensionPointMap[K],
    options: RegisterOptions = {},
  ): this {
    this.validate(point, plugin)
    const map = this.entries[point] as Map<string, ExtensionPointMap[K]>
    if (map.has(plugin.id) && !options.replace) {
      throw new AutofillError(
        'PLUGIN_CONFLICT',
        `A ${point} with id "${plugin.id}" is already registered.`,
      )
    }
    map.set(plugin.id, plugin)
    this.sortedCache.delete(point)
    return this
  }

  unregister(point: ExtensionPoint, id: string): boolean {
    const removed = this.entries[point].delete(id)
    if (removed) this.sortedCache.delete(point)
    return removed
  }

  list<K extends ExtensionPoint>(point: K): readonly ExtensionPointMap[K][] {
    const cached = this.sortedCache.get(point)
    if (cached) return cached as readonly ExtensionPointMap[K][]
    const sorted = [...(this.entries[point] as Map<string, ExtensionPointMap[K]>).values()].sort(
      compareEntries,
    )
    this.sortedCache.set(point, sorted)
    return sorted
  }

  get<K extends ExtensionPoint>(point: K, id: string): ExtensionPointMap[K] | undefined {
    return (this.entries[point] as Map<string, ExtensionPointMap[K]>).get(id)
  }

  has(point: ExtensionPoint, id: string): boolean {
    return this.entries[point].has(id)
  }

  registerDetector(plugin: FieldDetector, options?: RegisterOptions): this {
    return this.register('detector', plugin, options)
  }
  registerClassifier(plugin: SemanticClassifier, options?: RegisterOptions): this {
    return this.register('classifier', plugin, options)
  }
  registerMatcher(plugin: MatchingStrategy, options?: RegisterOptions): this {
    return this.register('matcher', plugin, options)
  }
  registerGenerator(plugin: GeneratorProvider, options?: RegisterOptions): this {
    return this.register('generator', plugin, options)
  }
  registerValidator(plugin: FieldValueValidator, options?: RegisterOptions): this {
    return this.register('validator', plugin, options)
  }
  registerPolicy(plugin: FormActionPolicy, options?: RegisterOptions): this {
    return this.register('policy', plugin, options)
  }
  registerPortalAdapter(plugin: PortalAdapter, options?: RegisterOptions): this {
    return this.register('portalAdapter', plugin, options)
  }
  registerAction(plugin: AutofillAction, options?: RegisterOptions): this {
    return this.register('action', plugin, options)
  }

  /** Registers every extension point of a plugin bundle; nothing is registered if any entry is invalid. */
  use(plugin: AutofillPlugin, options?: RegisterOptions): this {
    if (!ID_PATTERN.test(plugin.id))
      throw new AutofillError('PLUGIN_INVALID', `Invalid plugin id "${plugin.id}".`)
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new AutofillError(
        'PLUGIN_INVALID',
        `Plugin "${plugin.id}" targets API v${String(plugin.apiVersion)}; this engine supports v${PLUGIN_API_VERSION}.`,
      )
    }
    const batches: [ExtensionPoint, readonly { id: string }[] | undefined][] = [
      ['detector', plugin.detectors],
      ['classifier', plugin.classifiers],
      ['matcher', plugin.matchers],
      ['generator', plugin.generators],
      ['validator', plugin.validators],
      ['policy', plugin.policies],
      ['portalAdapter', plugin.portalAdapters],
      ['action', plugin.actions],
    ]
    for (const [point, items] of batches) {
      for (const item of items ?? []) {
        this.validate(point, item as never)
        if (this.entries[point].has(item.id) && !options?.replace) {
          throw new AutofillError(
            'PLUGIN_CONFLICT',
            `A ${point} with id "${item.id}" is already registered.`,
          )
        }
      }
    }
    for (const [point, items] of batches) {
      for (const item of items ?? []) this.register(point, item as never, { replace: true })
    }
    return this
  }

  /** Copies every registration into a new registry. */
  clone(): PluginRegistry {
    const copy = new PluginRegistry()
    for (const point of Object.keys(this.entries) as ExtensionPoint[]) {
      for (const plugin of this.entries[point].values()) copy.register(point, plugin as never)
    }
    return copy
  }

  private validate<K extends ExtensionPoint>(point: K, plugin: ExtensionPointMap[K]): void {
    if (!plugin || typeof plugin !== 'object')
      throw new AutofillError('PLUGIN_INVALID', `Invalid ${point} registration.`)
    if (typeof plugin.id !== 'string' || !ID_PATTERN.test(plugin.id)) {
      throw new AutofillError(
        'PLUGIN_INVALID',
        `Invalid ${point} id "${String(plugin.id)}". Use lowercase letters, digits, ".", "_" or "-".`,
      )
    }
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new AutofillError(
        'PLUGIN_INVALID',
        `${point} "${plugin.id}" targets API v${String(plugin.apiVersion)}; this engine supports v${PLUGIN_API_VERSION}.`,
      )
    }
    for (const method of REQUIRED_METHODS[point]) {
      if (typeof plugin[method] !== 'function') {
        throw new AutofillError(
          'PLUGIN_INVALID',
          `${point} "${plugin.id}" is missing ${String(method)}().`,
        )
      }
    }
    if (plugin.order !== undefined && !Number.isFinite(plugin.order)) {
      throw new AutofillError('PLUGIN_INVALID', `${point} "${plugin.id}" has a non-numeric order.`)
    }
  }
}

/** Runs plugin code with error isolation; a failing plugin is reported and skipped. */
export function invokePlugin<T>(
  pluginId: string,
  run: () => T,
  onError: (pluginId: string, error: unknown) => void,
): T | undefined {
  try {
    return run()
  } catch (error) {
    onError(pluginId, error)
    return undefined
  }
}
