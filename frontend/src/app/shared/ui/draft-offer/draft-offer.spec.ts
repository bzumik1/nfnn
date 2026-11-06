import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DraftOffer } from './draft-offer';

@Component({
  imports: [DraftOffer],
  template: `<app-draft-offer
    savedAt="6. 11. 2026 10:00"
    [stale]="stale()"
    [photo]="photo()"
    [headingLevel]="3"
    (resumed)="choices.push('resume')"
    (discarded)="choices.push('discard')"
  />`,
})
class Host {
  readonly stale = signal(false);
  readonly photo = signal(false);
  readonly choices: string[] = [];
}

describe('Given a draft offered back on a form', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('when it shows, then a region named by its heading says when the text was written and offers both choices', () => {
    const heading = root.querySelector('[role="heading"]')!;
    const region = root.querySelector('section')!;

    expect(heading.textContent?.trim()).toBe('Máte tu rozepsaný text');
    expect(heading.getAttribute('aria-level')).toBe('3');
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(region.textContent).toContain('neuložené úpravy z 6. 11. 2026 10:00');
    expect(region.textContent).not.toContain('Uložená verze se od té doby změnila');
    expect(
      [...root.querySelectorAll('button')].map((button) => button.textContent?.trim()),
    ).toEqual(['Pokračovat v rozepsaném', 'Zahodit']);
  });

  it('when the draft is older than the saved version, then it says the save will ask first', async () => {
    fixture.componentInstance.stale.set(true);
    await fixture.whenStable();

    expect(root.textContent).toContain('Uložená verze se od té doby změnila');
    expect(root.textContent).toContain('před uložením se vás zeptáme');
  });

  it('when the form has photos, then it says photos are not kept', async () => {
    fixture.componentInstance.photo.set(true);
    await fixture.whenStable();

    expect(root.textContent).toContain('Rozepsaný text neuchovává fotky');
  });

  it('when a choice is pressed, then it is reported', () => {
    root.querySelector<HTMLButtonElement>('.draft-offer__resume')!.click();
    root.querySelector<HTMLButtonElement>('.draft-offer__discard')!.click();

    expect(fixture.componentInstance.choices).toEqual(['resume', 'discard']);
  });
});
