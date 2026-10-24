package cz.novanadeje.app.content.domain;

import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.project.ProjectId;

import java.time.Instant;
import java.util.Optional;

public interface FormerSlugs {

    void rememberNews(Slug slug, NewsArticleId article, Instant replacedAt);

    void rememberProject(Slug slug, ProjectId project, Instant replacedAt);

    void forget(Slug slug);

    Optional<NewsArticleId> newsArticle(Slug slug);

    Optional<ProjectId> project(Slug slug);
}
