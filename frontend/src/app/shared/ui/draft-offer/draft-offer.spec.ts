import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DraftOffer } from './draft-offer';

@Component({
  imports: [DraftOffer],
  template: `<app-draft-offer
    savedAt="6. 11. 2026 10:00"
    [stale]="stale()"
    [photo]="photo()"
    [secrets]="secrets()"
    [headingLevel]="3"
    (resumed)="choices.push('resume')"
    (discarded)="choices.push('discard')"
  />`,
})
class Host {
  readonly stale = signal(false);
  readonly photo = signal(false);
  readonly secrets = signal(false);
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

  it('when it shows, then a region named by its heading says when the edits were made and offers both choices', () => {
    const heading = root.querySelector('h3')!;
    const region = root.querySelector('section')!;

    expect(heading.textContent?.trim()).toBe('Máte tu rozepsané úpravy');
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

    expect(root.textContent).toContain('Rozepsané úpravy neuchovávají fotky');
  });

  it('when the form has passwords or tokens, then it says they are not kept', async () => {
    fixture.componentInstance.secrets.set(true);
    await fixture.whenStable();

    expect(root.textContent).toContain('Hesla a tokeny se z bezpečnostních důvodů neuchovávají');
  });

  it('when a choice is pressed, then it is reported', () => {
    root.querySelector<HTMLButtonElement>('.draft-offer__resume')!.click();
    root.querySelector<HTMLButtonElement>('.draft-offer__discard')!.click();

    expect(fixture.componentInstance.choices).toEqual(['resume', 'discard']);
  });
});

@Component({
  imports: [DraftOffer],
  template: `<button type="button" class="outside">Jinde</button>
    <form [inert]="shown()"><input name="title" /></form>
    @if (shown()) {
      <app-draft-offer savedAt="6. 11. 2026 10:00" />
    }`,
})
class FormHost {
  readonly shown = signal(false);
}

describe('Given a form that a draft offer may lock while the visitor is in it', () => {
  let fixture: ComponentFixture<FormHost>;
  let root: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(FormHost);
    root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    await fixture.whenStable();
  });

  afterEach(() => root.remove());

  it('when the offer shows while the focus is in the form, then the focus moves to the offer heading', async () => {
    root.querySelector('input')!.focus();

    fixture.componentInstance.shown.set(true);
    await fixture.whenStable();

    expect(document.activeElement?.textContent?.trim()).toBe('Máte tu rozepsané úpravy');
  });

  it('when the offer shows while the focus is elsewhere on the page, then the focus stays there', async () => {
    root.querySelector<HTMLButtonElement>('.outside')!.focus();

    fixture.componentInstance.shown.set(true);
    await fixture.whenStable();

    expect(document.activeElement?.textContent?.trim()).toBe('Jinde');
  });
});
