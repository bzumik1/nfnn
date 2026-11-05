import type { Check } from './layout-checks';

export interface KnownFinding {
  poses: string[];
  steps: string[];
  check: string;
  shows: string;
  reason: string;
}

export interface KnownBreak {
  poses: string[];
  steps: string[];
  reason: string;
}

const LARGE_TEXT_PHONE = 'iphone-17-pro-max-large-text';
const LARGE_TEXT_TABLET = 'ipad-pro-11-landscape-large-text';
const DONOR_PAGES = ['donor-overview', 'donor-donations', 'donor-receipts', 'donor-details'];
const ADMIN_PAGES = [
  'admin-home',
  'admin-payments',
  'admin-donors',
  'admin-donor-detail',
  'admin-settings',
  'admin-menu',
];
const BANK_DETAILS_SHOWN = ['home', 'home-donate', 'site-menu', 'sign-in', 'registration'];

export const KNOWN_FINDINGS: KnownFinding[] = [
  {
    poses: [LARGE_TEXT_PHONE],
    steps: [...DONOR_PAGES, 'donor-menu'],
    check: 'no controls stacked on each other',
    shows: 'a.topbar-home "Hlavní stránka"',
    reason: 'with large text the top bar link "Hlavní stránka" runs under "Odhlásit se"',
  },
  {
    poses: [LARGE_TEXT_PHONE],
    steps: ADMIN_PAGES,
    check: 'no controls stacked on each other',
    shows: 'a.topbar-switch "Můj přehled"',
    reason: 'with large text the top bar link "Můj přehled" runs under "Odhlásit se"',
  },
  {
    poses: [LARGE_TEXT_PHONE],
    steps: [...BANK_DETAILS_SHOWN, 'donor-overview', 'donor-menu'],
    check: 'no sideways scroll of the page',
    shows: 'span.bank-key',
    reason: 'with large text a row of the bank details is wider than the phone',
  },
  {
    poses: [LARGE_TEXT_PHONE],
    steps: ['donor-overview', 'donor-menu'],
    check: 'no control cut off by the screen edge',
    shows: 'Stáhnout potvrzení za rok',
    reason: 'with large text the yearly receipt button does not wrap and runs off the screen',
  },
  {
    poses: [LARGE_TEXT_PHONE],
    steps: ['donor-receipts'],
    check: 'no sideways scroll of the page',
    shows: 'th "STAV"',
    reason: 'with large text the table of gifts on the receipts page is wider than the phone',
  },
  {
    poses: [LARGE_TEXT_TABLET],
    steps: ['donor-donations', 'donor-receipts'],
    check: 'no sideways scroll of the page',
    shows: 'th "POTVRZENÍ"',
    reason: 'with large text the table of gifts is wider than the tablet',
  },
  {
    poses: [LARGE_TEXT_TABLET],
    steps: ['donor-donations'],
    check: 'no control cut off by the screen edge',
    shows: 'button.download-btn',
    reason: "with large text the table's download buttons run off the tablet",
  },
  {
    poses: [LARGE_TEXT_TABLET],
    steps: ['admin-home'],
    check: 'no sideways scroll of the page',
    shows: 'th.num "BEZ DÁRCE"',
    reason: 'with large text the table of months in the administration is wider than the tablet',
  },
  {
    poses: ['iphone-se'],
    steps: ['admin-donor-detail'],
    check: 'every target at least 24 px',
    shows: 'a "Údaje"',
    reason: "the links to the sections of a donor's card wrap into rows closer than 24 px",
  },
];

export const KNOWN_BREAKS: KnownBreak[] = [
  {
    poses: ['iphone-17-pro-landscape'],
    steps: ['sign-in', 'registration'],
    reason:
      'in landscape the site menu is taller than the phone and does not scroll to "Přihlásit se"',
  },
];

export const knownFindings = (pose: string, step: string): KnownFinding[] =>
  KNOWN_FINDINGS.filter((known) => known.poses.includes(pose) && known.steps.includes(step));

export const knownBreak = (pose: string, step: string): KnownBreak | undefined =>
  KNOWN_BREAKS.find((known) => known.poses.includes(pose) && known.steps.includes(step));

export const matches = (known: KnownFinding, check: Check): boolean =>
  !check.pass && check.name === known.check && check.detail.includes(known.shows);
