export const BOOLEAN_CONFIG_KEYS = ["debugLog", "permissionReviewLog", "yoloMode"] as const;
export const MODAL_BOOLEAN_CONFIG_KEYS = BOOLEAN_CONFIG_KEYS;
export const NUMBER_CONFIG_KEYS = ["toolInputPreviewMaxLength", "toolTextSummaryMaxLength"] as const;
export const STRING_ARRAY_CONFIG_KEYS = ["piInfrastructureReadPaths"] as const;

export type BooleanConfigKey = (typeof BOOLEAN_CONFIG_KEYS)[number];
export type NumberConfigKey = (typeof NUMBER_CONFIG_KEYS)[number];
export type StringArrayConfigKey = (typeof STRING_ARRAY_CONFIG_KEYS)[number];
