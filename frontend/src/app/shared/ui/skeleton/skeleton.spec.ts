import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Skeleton } from './skeleton';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

describe('Given a skeleton in place of content that is loading', () => {
  let fixture: ComponentFixture<Skeleton>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('rows', 4);
    await fixture.whenStable();
  });

  const host = () => fixture.nativeElement as HTMLElement;

  it('when it shows, then a screen reader hears nothing of it', () => {
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(withOrdinarySpaces(host().textContent)?.trim()).toBe('');
  });

  it('when it stands for a whole card, then it draws the card with a title and the rows asked for', () => {
    expect(host().querySelector('.ui-skeleton.ui-card')).not.toBeNull();
    expect(host().querySelectorAll('.ui-skeleton__line--title')).toHaveLength(1);
    expect(host().querySelectorAll('.ui-skeleton__line')).toHaveLength(5);
  });

  it('when it stands inside a card already shown, then it draws only the rows', async () => {
    fixture.componentRef.setInput('inset', true);
    await fixture.whenStable();

    expect(host().querySelector('.ui-card')).toBeNull();
    expect(host().querySelector('.ui-skeleton--inset')).not.toBeNull();
    expect(host().querySelectorAll('.ui-skeleton__line')).toHaveLength(4);
  });
});

describe('Given a skeleton for a card whose title is known before its data', () => {
  let fixture: ComponentFixture<Skeleton>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('rows', 3);
    fixture.componentRef.setInput('heading', 'Stav záloh');
    await fixture.whenStable();
  });

  const host = () => fixture.nativeElement as HTMLElement;

  it('when it shows, then the card shows its own title over the rows instead of a title bar', () => {
    expect(host().querySelector('.ui-card .ui-card__title')?.textContent?.trim()).toBe(
      'Stav záloh',
    );
    expect(host().querySelector('.ui-skeleton__line--title')).toBeNull();
    expect(host().querySelectorAll('.ui-skeleton--inset .ui-skeleton__line')).toHaveLength(3);
  });

  it('when it shows, then a screen reader finds its title among the headings and hears nothing of the rows', () => {
    expect(host().getAttribute('aria-hidden')).toBeNull();
    const heading = host().querySelector('h2');
    expect(heading?.textContent?.trim()).toBe('Stav záloh');
    expect(heading?.closest('[aria-hidden="true"]')).toBeNull();
    const rows = host().querySelector('.ui-skeleton--inset');
    expect(rows?.getAttribute('aria-hidden')).toBe('true');
    expect(withOrdinarySpaces(host().textContent)?.trim()).toBe('Stav záloh');
  });

  it('when its title carries a no-break space, then the title keeps it as the card title does', async () => {
    fixture.componentRef.setInput('heading', 'Klíč k\u00a0zálohám');
    await fixture.whenStable();

    expect(host().querySelector('h2')?.textContent).toBe('Klíč k\u00a0zálohám');
    expect(host().hasAttribute('title')).toBe(false);
  });
});
