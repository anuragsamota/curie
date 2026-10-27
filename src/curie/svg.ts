// Interactive diagrams put a lesson's SVG straight into the page so its elements can be changed by
// variables. Anything that could run code or load outside content is removed first.

const BLOCKED_ELEMENTS = new Set(["script", "foreignobject", "iframe", "embed", "object", "audio", "video", "handler", "listener", "set", "animate", "animatemotion", "animatetransform"]);

function safeLink(value: string) {
  const link = value.trim();
  return link.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);/i.test(link);
}

/** Returns sanitized SVG markup, or throws when the file isn't an SVG. */
export function sanitizeSvg(source: string): string {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || parsed.getElementsByTagName("parsererror").length) {
    throw new Error("The diagram file is not a valid SVG.");
  }
  const visit = (element: Element) => {
    for (const child of [...element.children]) {
      if (BLOCKED_ELEMENTS.has(child.localName.toLowerCase())) child.remove();
      else visit(child);
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      else if ((name === "href" || name === "xlink:href" || name === "src") && !safeLink(value)) element.removeAttribute(attribute.name);
      else if (/url\(\s*['"]?(?!#)/i.test(value) || /expression\(|javascript:/i.test(value)) element.removeAttribute(attribute.name);
    }
    if (element.localName === "style") {
      // Stylesheets may only reference things inside the SVG.
      element.textContent = (element.textContent ?? "").replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
    }
  };
  visit(root);
  root.removeAttribute("width");
  root.removeAttribute("height");
  return new XMLSerializer().serializeToString(root);
}

/** Attributes a binding may not set, because they could load content or run code. */
export function isBlockedProperty(property: string) {
  const name = property.toLowerCase();
  return name.startsWith("on") || name === "href" || name === "xlink:href" || name === "src" || name === "style";
}
