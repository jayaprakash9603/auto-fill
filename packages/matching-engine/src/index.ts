export {
  catalogClassifier,
  classificationInput,
  classifyField,
  classifyFields,
  CONFIDENCE as CLASSIFICATION_CONFIDENCE,
  createCustomFieldClassifier,
  type ClassifyOptions,
} from './classify'
export { evaluateContext, siteMatches, type ContextEnvironment, type ContextFit } from './context'
export {
  CONTEXT_BONUS,
  confidenceLevel,
  matchField,
  matchFields,
  visibleAnswers,
  type MatchEngineOptions,
  type MatchInput,
} from './engine'
export {
  isPlaceholderOption,
  matchOption,
  OPTION_SCORES,
  parseRange,
  selectableOptions,
  singleNumber,
  type NumericRange,
  type OptionMatch,
  type OptionMatchMethod,
} from './options'
export {
  aliasStrategy,
  BUILTIN_STRATEGIES,
  contextStrategy,
  exactLabelStrategy,
  explicitMappingStrategy,
  fieldSignature,
  FUZZY_MIN_SIMILARITY,
  fuzzyStrategy,
  indexAnswers,
  semanticKeyStrategy,
  semanticScore,
  STRATEGY_CAPS,
  STRATEGY_SCORES,
  suggestionStrategy,
} from './strategies'
export { formatForType, toFieldValue, type Conversion } from './values'
