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
  eyebrow: string;
  perex: string;
  body: string;
  imageId: string | null;
  imageAlt: string;
  slug: string;
  backPath: string;
  signer: ContentSigner | null;
}

export function newsPage(article: NewsArticleResponse): ContentPage {
  const date = article.publishedOn ? formatDonationDate(article.publishedOn) : '';
  return {
    title: article.title,
    eyebrow: article.tag ? `${article.tag} · ${date}` : date,
    perex: article.perex,
    body: article.body,
    imageId: article.coverImage?.id ?? null,
    imageAlt: article.coverImage?.alt ?? '',
    slug: article.slug,
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
    eyebrow: project.tag ? `${project.tag} · ${project.year}` : String(project.year),
    perex: project.perex,
    body: project.body,
    imageId: project.coverImage?.id ?? null,
    imageAlt: project.coverImage?.alt ?? '',
    slug: project.slug,
    backPath: '/projekty',
    signer: null,
  };
}
