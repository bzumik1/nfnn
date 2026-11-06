import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UNSEEN_PHOTO_CLASS, UnseenPhotos } from './unseen-photos';

describe('Given the photos of the site while some cannot be loaded', () => {
  let document: Document;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    document = TestBed.inject(DOCUMENT);
    TestBed.inject(UnseenPhotos);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function photo(src: string): HTMLImageElement {
    const image = document.createElement('img');
    image.setAttribute('src', src);
    image.alt = 'Děti na výletě';
    document.body.append(image);
    return image;
  }

  it('when a photo of the site fails to load, then it is marked unavailable and keeps its text', () => {
    const image = photo('/api/content/media/0190a7c2-0000-7000-8000-000000000001?w=640');

    image.dispatchEvent(new Event('error'));

    expect(image.classList.contains(UNSEEN_PHOTO_CLASS)).toBe(true);
    expect(image.alt).toBe('Děti na výletě');
  });

  it('when the photo loads later, then the mark is taken off', () => {
    const image = photo('/api/content/media/0190a7c2-0000-7000-8000-000000000001');
    image.dispatchEvent(new Event('error'));

    image.dispatchEvent(new Event('load'));

    expect(image.classList.contains(UNSEEN_PHOTO_CLASS)).toBe(false);
  });

  it('when a picture of the site that the first visit never loaded fails, then it is marked unavailable too', () => {
    const image = photo('/images/about-720.webp');

    image.dispatchEvent(new Event('error'));

    expect(image.classList.contains(UNSEEN_PHOTO_CLASS)).toBe(true);
  });

  it('when something that is no image fails to load, then nothing is marked', () => {
    const script = document.createElement('script');
    document.body.append(script);

    script.dispatchEvent(new Event('error'));

    expect(script.classList.contains(UNSEEN_PHOTO_CLASS)).toBe(false);
  });

  it('when the app is torn down, then a failing photo is no longer marked', () => {
    TestBed.resetTestingModule();
    const image = photo('/api/content/media/0190a7c2-0000-7000-8000-000000000001');

    image.dispatchEvent(new Event('error'));

    expect(image.classList.contains(UNSEEN_PHOTO_CLASS)).toBe(false);
  });
});
