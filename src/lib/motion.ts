// Shared timing tiers from https://www.fluidfunctionalism.com/docs/motion.
export const spring = {
  fast: { type: 'spring', duration: 0.08, bounce: 0, exit: { duration: 0.06 } },
  moderate: { type: 'spring', duration: 0.16, bounce: 0, exit: { duration: 0.12 } },
  slow: { type: 'spring', duration: 0.24, bounce: 0.12, exit: { duration: 0.16 } },
} as const
