export function captureBrowserPosition(element) {
  if (!element) return null;
  return { scrollTop: element.scrollTop, top: element.getBoundingClientRect().top };
}

export function restoreBrowserPosition(position, element, scrollPage = options => window.scrollBy(options)) {
  if (!position || !element) return;
  element.scrollTop = position.scrollTop;
  // On a stacked layout, newly visible channel controls above the directory
  // can move it down the page. Keep the same visible browser content in place.
  const delta = element.getBoundingClientRect().top - position.top;
  if (Math.abs(delta) > 1) scrollPage({ top: delta, left: 0, behavior: 'instant' });
}
