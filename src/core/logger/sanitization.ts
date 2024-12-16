export function safeJsonStringify(value: unknown, spaces?: number): string {
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "bigint") {
          return val.toString();
        }
        return val;
      },
      spaces
    );
  } catch (error) {
    return `${value}`;
  }
}
