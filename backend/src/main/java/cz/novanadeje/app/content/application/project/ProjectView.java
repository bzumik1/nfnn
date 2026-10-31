package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.content.domain.project.ProjectId;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record ProjectView(ProjectId id, String slug, String title, int year, ProjectCategory category, Optional<String> tag, String perex, String body,
                          Optional<MediaId> coverImage, Optional<String> coverImageAlt, Optional<LocalDate> publishedOn, boolean live, Instant createdAt, Instant updatedAt) {

    public static ProjectView from(Project project, LocalDate today) {
        return new ProjectView(project.id(), project.slug().value(), project.content().title(), project.content().year(),
                project.content().category(), project.content().tag(), project.content().perex(), project.content().body(), project.content().coverImage(), project.content().coverImageAlt(),
                project.publishedOn(), project.isVisibleOn(today), project.createdAt(), project.updatedAt());
    }
}
