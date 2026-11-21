export function loadFailureRetry(host: ParentNode): HTMLButtonElement {
  const retry = host.querySelector<HTMLButtonElement>('app-load-failure button');
  if (retry === null) {
    throw new Error('No „Zkusit znovu“ of a shared load failure is shown');
  }
  return retry;
}

export function pressLoadFailureRetry(host: ParentNode): HTMLButtonElement {
  const retry = loadFailureRetry(host);
  retry.focus();
  retry.click();
  return retry;
}

export function loadFailureAlerts(host: ParentNode): string[] {
  return [...host.querySelectorAll('app-load-failure [role="alert"]')].map((alert) =>
    (alert.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

export function alertsHoldingAButton(host: ParentNode): number {
  return [...host.querySelectorAll('[role="alert"]')].filter(
    (alert) => alert.querySelector('button, a') !== null,
  ).length;
}
