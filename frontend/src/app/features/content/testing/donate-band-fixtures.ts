import { DonateBandPhotoResponse } from '../donate-band-api';

export const DONATE_BAND_PHOTO_ID = '0199f3e0-0000-7000-8000-00000000b101';

export function donateBandPhoto(
  overrides: Partial<DonateBandPhotoResponse> = {},
): DonateBandPhotoResponse {
  return {
    id: DONATE_BAND_PHOTO_ID,
    url: `/api/content/media/${DONATE_BAND_PHOTO_ID}`,
    width: 1600,
    height: 1067,
    alt: 'Usměvavá dívka na zahradě',
    focalPoint: { x: 62, y: 28 },
    ...overrides,
  };
}
