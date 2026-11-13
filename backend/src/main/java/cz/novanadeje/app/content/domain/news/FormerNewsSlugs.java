package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.Slug;

import java.time.Instant;
import java.util.Optional;

public interface FormerNewsSlugs {

    void rememberNews(Slug slug, NewsArticleId article, Instant replacedAt);

    void forgetNews(Slug slug);

    Optional<NewsArticleId> newsArticle(Slug slug);
}
