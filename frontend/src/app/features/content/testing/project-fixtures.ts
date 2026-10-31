import { ProjectResponse, UploadedImageResponse } from '../projects-api';

export const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';

export function project(overrides: Partial<ProjectResponse> = {}): ProjectResponse {
  return {
    id: '0199f3e0-0000-7000-8000-00000000c001',
    slug: 'zahrada-pro-deti',
    title: 'Zahrada pro děti',
    year: 2024,
    category: 'CHILDREN',
    tag: 'Projekt',
    perex: 'Stavíme zahradu, kde si děti z domova budou hrát a pěstovat.',
    body: 'První odstavec textu.\n\nDruhý odstavec textu.',
    coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: null },
    publishedOn: '2026-10-20',
    live: true,
    createdAt: '2026-10-19T09:00:00Z',
    updatedAt: '2026-10-20T07:30:00Z',
    ...overrides,
  };
}

export function draftProject(overrides: Partial<ProjectResponse> = {}): ProjectResponse {
  return project({
    id: '0199f3e0-0000-7000-8000-00000000c002',
    slug: 'beneficni-koncert',
    title: 'Benefiční koncert',
    year: 2026,
    category: 'OTHER',
    tag: null,
    perex: 'Zveme vás na koncert.',
    body: 'Text o koncertu.',
    coverImage: null,
    publishedOn: null,
    live: false,
    createdAt: '2026-10-22T09:00:00Z',
    updatedAt: '2026-10-22T09:00:00Z',
    ...overrides,
  });
}

export function uploadedImage(
  overrides: Partial<UploadedImageResponse> = {},
): UploadedImageResponse {
  return {
    id: IMAGE_ID,
    url: `/api/content/media/${IMAGE_ID}`,
    width: 1600,
    height: 1000,
    ...overrides,
  };
}
