import { FocalPoint } from '../../../shared/ui/focal-point/focal-point';
import { formatDonationDate } from '../../donations/donation-date';
import { NewsArticleResponse } from '../news-api';
import { ProjectResponse } from '../projects-api';

export type ContentKind = 'news' | 'project';

export interface ContentSigner {
  name: string;
  role: string | null;
  portraitId: string | null;
}

export interface ContentPage {
  title: string;
  tag: string | null;
  when: string;
  perex: string;
  body: string;
  imageId: string | null;
  imageAlt: string;
  imageFocalPoint: FocalPoint | null;
  slug: string;
  year: number | null;
  backPath: string;
  signer: ContentSigner | null;
}

export function newsPage(article: NewsArticleResponse): ContentPage {
  const date = article.publishedOn ? formatDonationDate(article.publishedOn) : '';
  return {
    title: article.title,
    tag: article.tag,
    when: date,
    perex: article.perex,
    body: article.body,
    imageId: article.coverImage?.id ?? null,
    imageAlt: article.coverImage?.alt ?? '',
    imageFocalPoint: article.coverImage?.focalPoint ?? null,
    slug: article.slug,
    year: null,
    backPath: '/aktuality',
    signer: article.signer
      ? {
          name: article.signer.name,
          role: article.signer.role,
          portraitId: article.signer.portrait?.id ?? null,
        }
      : null,
  };
}

export function projectPage(project: ProjectResponse): ContentPage {
  return {
    title: project.title,
    tag: project.tag,
    when: String(project.year),
    perex: project.perex,
    body: project.body,
    imageId: project.coverImage?.id ?? null,
    imageAlt: project.coverImage?.alt ?? '',
    imageFocalPoint: project.coverImage?.focalPoint ?? null,
    slug: project.slug,
    year: project.year,
    backPath: '/projekty',
    signer: null,
  };
}
