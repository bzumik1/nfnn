/// <reference types="@angular/localize" />

export type AppTabId = 'about' | 'news' | 'projects' | 'donate';

export interface AppTab {
  readonly id: AppTabId;
  readonly path: string;
  readonly label: string;
}

export const APP_TABS: readonly AppTab[] = [
  { id: 'about', path: '/o-nas', label: $localize`:@@layout.tabs.about:O nás` },
  { id: 'news', path: '/aktuality', label: $localize`:@@layout.tabs.news:Aktuality` },
  { id: 'projects', path: '/projekty', label: $localize`:@@layout.tabs.projects:Pomáháme` },
  { id: 'donate', path: '/prispet', label: $localize`:@@layout.tabs.donate:Přispět` },
];

export function tabOf(url: string): AppTab | null {
  const path = pathOf(url);
  return APP_TABS.find((tab) => path === tab.path || path.startsWith(`${tab.path}/`)) ?? null;
}

export function pathOf(url: string): string {
  return url.split(/[?#;]/)[0];
}
