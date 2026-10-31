package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.news.NewsSignerView;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record NewsArticleResponse(UUID id, String slug, String title, String tag, String perex, String body, CoverImageResponse coverImage,
                                  LocalDate publishedOn, boolean live, Instant createdAt, Instant updatedAt, Signer signer) {

    static NewsArticleResponse from(NewsArticleView view) {
        return new NewsArticleResponse(view.id().value(), view.slug(), view.title(), view.tag().orElse(null), view.perex(), view.body(),
                view.coverImage().map(image -> CoverImageResponse.of(image, view.coverImageAlt())).orElse(null), view.publishedOn().orElse(null), view.live(), view.createdAt(), view.updatedAt(),
                view.signer().map(Signer::from).orElse(null));
    }

    public record Signer(UUID id, String name, String role, PersonImageResponse portrait) {

        static Signer from(NewsSignerView view) {
            return new Signer(view.id().value(), view.name(), view.role().orElse(null), view.portrait().map(PersonImageResponse::from).orElse(null));
        }
    }
}
