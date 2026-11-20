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
