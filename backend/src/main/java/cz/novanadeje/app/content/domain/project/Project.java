package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.content.domain.Slug;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record Project(ProjectId id, ProjectContent content, Optional<LocalDate> publishedOn, Instant createdAt, Instant updatedAt) {

    public Project {
        if (id == null || content == null || publishedOn == null || createdAt == null || updatedAt == null) {
            throw new IllegalArgumentException("A project has an id, content, a publication day (even when absent) and its times");
        }
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("A project cannot be updated before it was created");
        }
    }

    public static Project create(ProjectId id, ProjectContent content, Instant now) {
        return new Project(id, content, Optional.empty(), now, now);
    }

    public Project edit(ProjectContent newContent, Instant now) {
        return new Project(id, newContent, publishedOn, createdAt, now);
    }

    public Project publish(LocalDate on, Instant now) {
        if (on == null) {
            throw new IllegalArgumentException("Publishing needs a day");
        }
        return new Project(id, content, Optional.of(on), createdAt, now);
    }

    public Project unpublish(Instant now) {
        return new Project(id, content, Optional.empty(), createdAt, now);
    }

    public boolean isPublished() {
        return publishedOn.isPresent();
    }

    public boolean isVisibleOn(LocalDate today) {
        return publishedOn.filter(day -> !day.isAfter(today)).isPresent();
    }

    public Slug slug() {
        return content.slug();
    }
}
