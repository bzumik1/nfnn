package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsArticleView;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record NewsArticleResponse(UUID id, String slug, String title, String tag, String perex, String body, CoverImageResponse coverImage,
                                  LocalDate publishedOn, boolean live, Instant createdAt, Instant updatedAt) {

    static NewsArticleResponse from(NewsArticleView view) {
        return new NewsArticleResponse(view.id().value(), view.slug(), view.title(), view.tag().orElse(null), view.perex(), view.body(),
                view.coverImage().map(image -> CoverImageResponse.of(image, view.coverImageAlt())).orElse(null), view.publishedOn().orElse(null), view.live(), view.createdAt(), view.updatedAt());
    }
}
