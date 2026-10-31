import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

function render(inputs: Record<string, unknown>): ComponentFixture<Avatar> {
  const fixture = TestBed.createComponent(Avatar);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<Avatar>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('Given a person with a portrait', () => {
  it('when the avatar renders, then it shows the portrait at its size, late if asked, and stays out of the screen reader', () => {
    const fixture = render({
      name: 'Eva Vzorová',
      src: '/images/eva-160.webp',
      srcset: '/images/eva-160.webp 160w, /images/eva-320.webp 320w',
      sizes: '160px',
      size: 160,
      loading: 'lazy',
    });
    const image = host(fixture).querySelector('img')!;

    expect(host(fixture).getAttribute('aria-hidden')).toBe('true');
    expect(image.getAttribute('src')).toBe('/images/eva-160.webp');
    expect(image.getAttribute('srcset')).toBe(
      '/images/eva-160.webp 160w, /images/eva-320.webp 320w',
    );
    expect(image.getAttribute('sizes')).toBe('160px');
    expect(image.getAttribute('width')).toBe('160');
    expect(image.getAttribute('height')).toBe('160');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
    expect(host(fixture).textContent?.trim()).toBe('');
  });

  it('when no loading is asked, then the portrait loads at once and names no srcset', () => {
    const image = host(render({ name: 'Eva Vzorová', src: '/a.webp', size: 48 })).querySelector(
      'img',
    )!;

    expect(image.hasAttribute('loading')).toBe(false);
    expect(image.hasAttribute('srcset')).toBe(false);
    expect(image.hasAttribute('sizes')).toBe(false);
  });
});

describe('Given a person without a portrait', () => {
  it('when the avatar renders, then it shows the initials of the first two words in capitals instead', () => {
    const fixture = render({ name: 'Zdeňka Znamenáčková', size: 48 });

    expect(host(fixture).querySelector('img')).toBeNull();
    expect(host(fixture).textContent?.trim()).toBe('ZZ');
    expect(host(fixture).getAttribute('aria-hidden')).toBe('true');
  });

  it('when the name has extra spaces, a lower-case or accented start or more words, then the initials still read right', () => {
    expect(host(render({ name: '  šárka   nová ', size: 48 })).textContent?.trim()).toBe('ŠN');
    expect(host(render({ name: 'Jan Amos Komenský', size: 48 })).textContent?.trim()).toBe('JA');
    expect(host(render({ name: 'Madonna', size: 48 })).textContent?.trim()).toBe('M');
  });
});
