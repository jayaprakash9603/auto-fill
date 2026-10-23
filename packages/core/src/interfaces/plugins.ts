import type { AnswerRecord, FieldMapping } from '../domain/answers'
import type { FieldDescriptor, FieldOption, FieldType, FieldValue } from '../domain/field'
import type { FillOperationInput } from '../domain/page'
import type { FillResult, MatchResult, SyntheticGenerationResult } from '../domain/results'
import type { AutofillSettings, ConfidenceThresholds, SyntheticCategory } from '../domain/settings'

export const PLUGIN_API_VERSION = 1
export type PluginApiVersion = typeof PLUGIN_API_VERSION

interface PluginBase {
  /** Lowercase id, e.g. "acme.salary-matcher". Unique per extension point. */
  readonly id: string
  readonly apiVersion: PluginApiVersion
  /** Lower runs first; ties are broken by id so execution order is deterministic. */
  readonly order?: number
}

// ---------- Detection (runs where the DOM lives) ----------

export interface DetectedControl {
  kind: FieldType
  /** The control, the ARIA widget, or the group container for radio/checkbox groups. */
  element: Element
  /** Individual inputs of a radio or checkbox group. */
  members?: Element[]
  /** Label supplied by an adapter with portal-specific knowledge. */
  labelOverride?: string
  /** Set when the control was found but cannot be operated reliably. */
  unsupportedReason?: string
}

export interface DetectionContext {
  readonly document: Document
  /** True when an earlier detector already produced a control for this element. */
  isClaimed(element: Element): boolean
}

export interface FieldDetector extends PluginBase {
  detect(root: ParentNode, context: DetectionContext): DetectedControl[]
}

export interface ClassificationInput {
  type: FieldType
  label: string
  normalizedLabel: string
  name: string | null
  htmlId: string | null
  autocomplete: string | null
  placeholder: string | null
  section: string | null
  options: readonly FieldOption[]
}

export interface SemanticClassification {
  key: string
  confidence: number
  reason: string
}

export interface SemanticClassifier extends PluginBase {
  classify(input: ClassificationInput): SemanticClassification | null
}

// ---------- Matching (runs in the controller) ----------

export interface MatchContext {
  site: string
  activeProfileId: string | null
  mappings: readonly FieldMapping[]
  thresholds: ConfidenceThresholds
}

export interface StrategyCandidate {
  answerId: string
  /** 0..1 before ranking adjustments. */
  score: number
  explanation: string
}

export interface MatchingStrategy extends PluginBase {
  readonly order: number
  match(
    field: FieldDescriptor,
    answers: readonly AnswerRecord[],
    context: MatchContext,
  ): StrategyCandidate[]
}

// ---------- Synthetic data ----------

export interface GeneratorContext {
  /** Deterministic when a seed is configured. Returns [0, 1). */
  random(): number
  seed: string | null
  /** Monotonic counter per key, for sequential ids. */
  sequence(key: string): number
  now(): number
}

export interface GeneratorProvider extends PluginBase {
  readonly name: string
  readonly description: string
  readonly categories: readonly SyntheticCategory[]
  supports(field: FieldDescriptor, category: SyntheticCategory): boolean
  generate(field: FieldDescriptor, context: GeneratorContext): FieldValue | null
}

// ---------- Validation ----------

export interface ValidationVerdict {
  ok: boolean
  message: string | null
}

export interface FieldValueValidator extends PluginBase {
  /** Return null when the validator has no opinion about this field. */
  validate(field: FieldDescriptor, value: FieldValue): ValidationVerdict | null
}

// ---------- Policy ----------

/**
 * `fill`: may be filled in a single trusted action. `confirm`: may be filled after the user selects it.
 * `suggest`: shown only. `skip`: nothing to do. `block`: must never be changed.
 */
export type PolicyAction = 'fill' | 'confirm' | 'suggest' | 'skip' | 'block'

export const POLICY_RESTRICTIVENESS: Readonly<Record<PolicyAction, number>> = {
  fill: 0,
  confirm: 1,
  suggest: 2,
  skip: 3,
  block: 4,
}

export interface PolicyDecision {
  action: PolicyAction
  reason: string
}

export interface PolicyInput {
  field: FieldDescriptor
  match: MatchResult
  generated: SyntheticGenerationResult | null
  settings: AutofillSettings
  site: string
}

/** Policies can only make a decision stricter; the most restrictive decision wins. */
export interface FormActionPolicy extends PluginBase {
  evaluate(input: PolicyInput): PolicyDecision | null
}

export function mostRestrictive(a: PolicyDecision, b: PolicyDecision | null): PolicyDecision {
  if (!b) return a
  return POLICY_RESTRICTIVENESS[b.action] > POLICY_RESTRICTIVENESS[a.action] ? b : a
}

// ---------- Portal adapters ----------

export const PORTAL_CAPABILITIES = [
  'detect',
  'fill-text',
  'fill-select',
  'fill-radio',
  'fill-checkbox',
  'fill-combobox',
  'multi-step',
  'iframe-embed',
] as const
export type PortalCapability = (typeof PORTAL_CAPABILITIES)[number]

export interface PortalContext {
  url: string
  hostname: string
  title: string
  document: Document
}

export interface ControlTarget {
  field: FieldDescriptor
  element: Element
  members: readonly Element[]
}

export interface ControlOutcome {
  ok: boolean
  verified: boolean
  reason: string | null
}

export interface PortalAdapter extends PluginBase {
  readonly name: string
  readonly version: string
  /** Hostname suffixes such as "myworkdayjobs.com". Informational; `canHandle` decides. */
  readonly sitePatterns: readonly string[]
  readonly capabilities: readonly PortalCapability[]
  readonly limitations: readonly string[]
  /** Must check the current page structure, not only the hostname. */
  canHandle(context: PortalContext): boolean
  /** Run before the generic detectors. */
  readonly detectors?: readonly FieldDetector[]
  /** Run before the generic classifiers. */
  readonly classifiers?: readonly SemanticClassifier[]
  refineField?(
    field: FieldDescriptor,
    target: Omit<ControlTarget, 'field'>,
    context: PortalContext,
  ): FieldDescriptor
  /** Return null to defer to the generic control adapters. */
  fillField?(
    target: ControlTarget,
    value: FieldValue,
    context: PortalContext,
  ): Promise<ControlOutcome | null>
}

// ---------- Custom actions ----------

export interface AutofillActionContext {
  readonly fields: readonly FieldDescriptor[]
  readonly selectedFieldIds: readonly string[]
  fill(operations: FillOperationInput[]): Promise<FillResult[]>
}

export interface AutofillAction extends PluginBase {
  readonly label: string
  readonly description: string
  run(context: AutofillActionContext): Promise<void>
}

/** A bundle of extension points registered together. */
export interface AutofillPlugin {
  readonly id: string
  readonly apiVersion: PluginApiVersion
  detectors?: readonly FieldDetector[]
  classifiers?: readonly SemanticClassifier[]
  matchers?: readonly MatchingStrategy[]
  generators?: readonly GeneratorProvider[]
  validators?: readonly FieldValueValidator[]
  policies?: readonly FormActionPolicy[]
  portalAdapters?: readonly PortalAdapter[]
  actions?: readonly AutofillAction[]
}
