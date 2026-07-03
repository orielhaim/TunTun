export function toIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

export function requireUuid(value: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`Invalid ${label}`);
  }
}
