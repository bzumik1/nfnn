(() => {
  const MAX_COUNT = 999;

  const countOf = (data) => {
    try {
      const count = data?.json()?.count;
      return Number.isInteger(count) && count >= 0 && count <= MAX_COUNT ? count : null;
    } catch {
      return null;
    }
  };

  self.addEventListener('push', (event) => {
    const navigator = self.navigator;
    if (
      typeof navigator?.setAppBadge !== 'function' ||
      typeof navigator.clearAppBadge !== 'function'
    ) {
      return;
    }
    const count = countOf(event.data);
    if (count === null) {
      return;
    }
    const shown = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    event.waitUntil(Promise.resolve(shown).catch(() => undefined));
  });
})();
