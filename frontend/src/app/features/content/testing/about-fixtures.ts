import { AboutPhotoResponse } from '../about-api';

export const ABOUT_PHOTO_ID = '0199f3e0-0000-7000-8000-00000000b001';

export function aboutPhoto(overrides: Partial<AboutPhotoResponse> = {}): AboutPhotoResponse {
  return {
    id: ABOUT_PHOTO_ID,
    url: `/api/content/media/${ABOUT_PHOTO_ID}`,
    width: 1413,
    height: 1884,
    alt: 'Malý chlapec v náručí dvou dospělých',
    caption: 'Kde to všechno začalo',
    ...overrides,
  };
}
