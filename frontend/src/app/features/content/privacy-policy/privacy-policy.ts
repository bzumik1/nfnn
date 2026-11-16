import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

const READING_BAND = '-15% 0px -60% 0px';

@Component({
  selector: 'app-privacy-policy',
  imports: [RouterLink],
  templateUrl: './privacy-policy.html',
  styleUrl: './privacy-policy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly currentSection = signal<string | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'function') {
        return;
      }
      const sections = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLElement>('.prose > section[id]'),
      ).map((section) => section.id);
      const inBand = new Set<string>();
      const observer = new IntersectionObserver(
        (entries) => this.follow(entries, sections, inBand),
        { rootMargin: READING_BAND },
      );
      for (const id of sections) {
        observer.observe(this.host.nativeElement.querySelector(`section#${id}`)!);
      }
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected locationOf(section: string): 'location' | null {
    return this.currentSection() === section ? 'location' : null;
  }

  private follow(
    entries: readonly IntersectionObserverEntry[],
    sections: readonly string[],
    inBand: Set<string>,
  ): void {
    let leftDownwards: string | undefined;
    for (const entry of entries) {
      const id = entry.target.id;
      if (entry.isIntersecting) {
        inBand.add(id);
      } else {
        inBand.delete(id);
        if (entry.rootBounds && entry.boundingClientRect.top >= entry.rootBounds.bottom) {
          leftDownwards = id;
        }
      }
    }
    const first = sections.find((id) => inBand.has(id));
    if (first) {
      this.currentSection.set(first);
    } else if (leftDownwards && leftDownwards === this.currentSection()) {
      this.currentSection.set(sections[sections.indexOf(leftDownwards) - 1] ?? null);
    }
  }
}
