export interface DetailsDisclosure {
  readonly summary: string;
  readonly chevron: 'hidden from assistive technology' | 'exposed' | 'missing';
  readonly whileClosed: 'left to the native details' | 'hidden by the page';
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
  const leftToTheDetails = () =>
    body().length === 1 &&
    !body()[0].hidden &&
    !body()[0].hasAttribute('inert') &&
    !body()[0].hasAttribute('aria-hidden');

  await toggle(false);
  const whileClosed = leftToTheDetails() ? 'left to the native details' : 'hidden by the page';
  await toggle(true);
  const onceOpen = details.open && leftToTheDetails() ? 'shown' : 'hidden';
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
