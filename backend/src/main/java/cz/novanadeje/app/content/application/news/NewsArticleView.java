package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record NewsArticleView(NewsArticleId id, String slug, String title, Optional<String> tag, String perex, String body,
                              Optional<MediaId> coverImage, Optional<String> coverImageAlt, Optional<LocalDate> publishedOn, boolean live, Instant createdAt, Instant updatedAt) {

    public static NewsArticleView from(NewsArticle article, LocalDate today) {
        return new NewsArticleView(article.id(), article.slug().value(), article.content().title(), article.content().tag(),
                article.content().perex(), article.content().body(), article.content().coverImage(), article.content().coverImageAlt(), article.publishedOn(),
                article.isVisibleOn(today), article.createdAt(), article.updatedAt());
    }
}
