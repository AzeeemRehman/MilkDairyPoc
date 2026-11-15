/** FormData → plain object of strings (checkboxes become booleans when listed). */
export function formObject(fd: FormData, booleans: string[] = []): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  for (const b of booleans) out[b] = fd.get(b) === "on" || fd.get(b) === "true";
  return out;
}

export function str(v: FormDataEntryValue | null | undefined): string {
  return typeof v === "string" ? v : "";
}
