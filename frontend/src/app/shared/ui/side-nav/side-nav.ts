import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

export interface SideNavItem {
  readonly path: string;
  readonly label: string;
  readonly exact?: boolean;
}

export interface SideNavGroup {
  readonly id: string;
  readonly label: string | null;
  readonly items: readonly SideNavItem[];
}

@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closeMenu($event)' },
})
export class SideNav {
  private readonly side = viewChild.required<ElementRef<HTMLElement>>('side');
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  readonly groups = input.required<readonly SideNavGroup[]>();
  readonly label = input.required<string>();
  readonly menuLabel = input.required<string>();
  readonly navId = input('side-nav');

  protected readonly menuOpen = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(event: Event): void {
    if (!this.menuOpen() || !this.side().nativeElement.contains(event.target as Node)) {
      return;
    }
    this.menuOpen.set(false);
    this.toggle().nativeElement.focus();
  }
}
