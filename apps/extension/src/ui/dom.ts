/**
 * Build an element. Text always goes in as text nodes and attributes through
 * `setAttribute`, so nothing a reviewer or a page wrote is ever parsed as
 * HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === true) element.setAttribute(name, "");
    else if (typeof value === "string") element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

/** The element with this id, which the page's own HTML guarantees. */
export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`SitePing: #${id} is missing from the page`);
  return element as T;
}
