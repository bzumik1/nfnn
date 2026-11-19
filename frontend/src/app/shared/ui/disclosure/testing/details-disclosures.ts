export interface DetailsDisclosure {
  readonly summary: string;
  readonly chevron: 'hidden from assistive technology' | 'exposed' | 'missing';
  readonly whileClosed: 'hidden and inert' | 'reachable';
  readonly onceOpen: 'shown' | 'hidden';
}

export async function readDetailsDisclosures(
  root: HTMLElement,
  settle: () => Promise<void>,
): Promise<DetailsDisclosure[]> {
  const read: DetailsDisclosure[] = [];
  for (const details of Array.from(root.querySelectorAll('details'))) {
    read.push(await readDetailsDisclosure(details, settle));
  }
  return read;
}

async function readDetailsDisclosure(
  details: HTMLDetailsElement,
  settle: () => Promise<void>,
): Promise<DetailsDisclosure> {
  const summary = details.querySelector(':scope > summary') as HTMLElement;
  const chevrons = Array.from(summary.querySelectorAll('svg'));
  const body = () =>
    Array.from(details.children).filter((child) => child !== summary) as HTMLElement[];
  const toggle = async (open: boolean) => {
    if (details.open !== open) {
      summary.click();
      await new Promise((resolve) => setTimeout(resolve));
      await settle();
    }
  };
  const hiddenAndInert = () =>
    body().length === 1 && body()[0].hidden && body()[0].hasAttribute('inert');

  await toggle(false);
  const whileClosed = hiddenAndInert() ? 'hidden and inert' : 'reachable';
  await toggle(true);
  const onceOpen =
    body().length === 1 && !body()[0].hidden && !body()[0].hasAttribute('inert')
      ? 'shown'
      : 'hidden';
  return {
    summary: (summary.textContent ?? '').replace(/\s+/g, ' ').trim(),
    chevron:
      chevrons.length === 0
        ? 'missing'
        : chevrons.every((chevron) => chevron.getAttribute('aria-hidden') === 'true')
          ? 'hidden from assistive technology'
          : 'exposed',
    whileClosed,
    onceOpen,
  };
}
