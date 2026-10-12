/** How a person wants to be addressed; selects the grammatical form of texts about them. */
export const ANREDEN = ['maennlich', 'weiblich', 'neutral'] as const;
export type Anrede = (typeof ANREDEN)[number];
