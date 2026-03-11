export function testUuid(prefix: string, suffix: number | string): string {
  const normalizedPrefix = prefix.padStart(8, "0").slice(-8);
  const normalizedSuffix = String(suffix).padStart(12, "0").slice(-12);

  return `${normalizedPrefix}-0000-4000-8000-${normalizedSuffix}`;
}

export function testEmail(scope: string, localPart: string): string {
  return `${localPart}.${scope}@branchforge.test`;
}
