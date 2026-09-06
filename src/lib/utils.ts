// src/lib/utils.ts — small, general-purpose helpers shared across the app.
// Not domain-specific enough to belong in any one lib/*.ts file (those are
// all feature-scoped — finance, payroll, procurement, etc). Add more here
// only when a helper is genuinely generic; keep feature logic in its own file.

// Standard conversion: 1 ft = 0.3048m exactly, 1 in = 0.0254m exactly.
// Users here build in feet/inches (standard Jamaican construction practice)
// but every Assembly formula internally assumes meters (confirmed audit —
// see AssemblyWizard.tsx's generateComponents(), 31 of 43 templates are
// meters-consistent). This is the single conversion point both BOQPage.tsx's
// "Add From Assembly" modal and AssemblyWizard.tsx's own preview inputs use,
// so the two never drift into computing the conversion differently.
export function feetInchesToMeters(feet: number, inches: number = 0): number {
  const safeFeet = Number.isFinite(feet) ? feet : 0;
  const safeInches = Number.isFinite(inches) ? inches : 0;
  return safeFeet * 0.3048 + safeInches * 0.0254;
}
