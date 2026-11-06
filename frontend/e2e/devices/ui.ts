import type { Page } from '@playwright/test';
import { expect, type RouteTarget } from '../fixtures';

export type Routes = RouteTarget;

export interface Target {
  css: string;
  text?: string;
}

export interface Ui {
  routes: Routes;
  rememberSession(): Promise<void>;
  goto(path: string): Promise<void>;
  isVisible(target: Target): Promise<boolean>;
  waitVisible(target: Target): Promise<void>;
  click(target: Target): Promise<void>;
  fill(target: Target, text: string): Promise<void>;
  waitAttribute(target: Target, name: string, value: string): Promise<void>;
  scrollToTop(target: Target): Promise<void>;
}

export const SESSION_FLAG = 'nfnn.donor-session';

export function playwrightUi(page: Page): Ui {
  const shown = ({ css, text }: Target) => {
    const all = page.locator(css);
    return (text ? all.filter({ hasText: text }) : all).filter({ visible: true }).first();
  };
  return {
    routes: page,
    rememberSession: async () => {
      await page.addInitScript((flag) => localStorage.setItem(flag, '1'), SESSION_FLAG);
    },
    goto: async (path) => {
      await page.goto(path);
    },
    isVisible: (target) => shown(target).isVisible(),
    waitVisible: (target) => expect(shown(target)).toBeVisible(),
    click: (target) => shown(target).click(),
    fill: (target, text) => shown(target).fill(text),
    waitAttribute: (target, name, value) => expect(shown(target)).toHaveAttribute(name, value),
    scrollToTop: (target) =>
      shown(target).evaluate((element) => element.scrollIntoView({ behavior: 'instant' })),
  };
}
