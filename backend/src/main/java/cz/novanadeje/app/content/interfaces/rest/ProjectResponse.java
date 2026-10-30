package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectView;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ProjectResponse(UUID id, String slug, String title, int year, String category, String tag, String perex, String body,
                              CoverImageResponse coverImage, LocalDate publishedOn, boolean live, Instant createdAt, Instant updatedAt) {

    static ProjectResponse from(ProjectView view) {
        return new ProjectResponse(view.id().value(), view.slug(), view.title(), view.year(), view.category().name(), view.tag().orElse(null), view.perex(), view.body(),
                view.coverImage().map(image -> CoverImageResponse.of(image, view.coverImageAlt())).orElse(null), view.publishedOn().orElse(null), view.live(), view.createdAt(), view.updatedAt());
    }
}
