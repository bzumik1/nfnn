package cz.novanadeje.app.content.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonInclude;
import cz.novanadeje.app.content.application.Versioned;
import cz.novanadeje.app.content.application.news.NewsArticleView;
import cz.novanadeje.app.content.application.news.NewsSignerView;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record NewsArticleResponse(UUID id, String slug, String title, String tag, String perex, String body, CoverImageResponse coverImage,
                                  LocalDate publishedOn, boolean live, Instant createdAt, Instant updatedAt, Signer signer,
                                  Integer lookBackYear, @JsonInclude(JsonInclude.Include.NON_NULL) String version) {

    static NewsArticleResponse from(NewsArticleView view) {
        return of(view, null);
    }

    static NewsArticleResponse from(Versioned<NewsArticleView> versioned) {
        return of(versioned.view(), versioned.version());
    }

    private static NewsArticleResponse of(NewsArticleView view, String version) {
        return new NewsArticleResponse(view.id().value(), view.slug(), view.title(), view.tag().orElse(null), view.perex(), view.body(),
                view.coverImage().map(image -> CoverImageResponse.of(image, view.coverImageAlt(), view.coverFocalPoint())).orElse(null), view.publishedOn().orElse(null), view.live(), view.createdAt(), view.updatedAt(),
                view.signer().map(Signer::from).orElse(null), view.lookBackYear().orElse(null), version);
    }

    public record Signer(UUID id, String name, String role, PersonImageResponse portrait) {

        static Signer from(NewsSignerView view) {
            return new Signer(view.id().value(), view.name(), view.role().orElse(null), view.portrait().map(PersonImageResponse::from).orElse(null));
        }
    }
}
