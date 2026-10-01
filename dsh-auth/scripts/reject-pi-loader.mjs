/** Regression-only loader: any accidental pi dependency aborts startup. */
export function resolve(specifier, context, nextResolve) {
  if (specifier.includes('pi-ai') || specifier.endsWith('/profiles.js') || specifier.endsWith('/pi-routes.js')) throw new Error(`Forbidden pi import: ${specifier}`)
  return nextResolve(specifier, context)
}
