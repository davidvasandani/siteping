/** A feedback URL is untrusted. Only navigate within the host application. */
export function annotationDestination(url: string, id: string, param: string | undefined): string | null {
  if (param === undefined || !url.trim()) return null;
  try {
    const target = new URL(url, window.location.href);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.origin !== window.location.origin ||
      target.username ||
      target.password
    ) {
      return null;
    }
    target.searchParams.set(param, id);
    return target.href;
  } catch {
    return null;
  }
}
