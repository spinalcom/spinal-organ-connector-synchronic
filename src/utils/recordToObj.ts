export function recordToObject(
  record: { index: string; value: any }[]
): Record<string, any> {
  return record.reduce((acc, attr) => {
    acc[attr.index] = attr.value;
    return acc;
  }, {} as Record<string, any>);
}