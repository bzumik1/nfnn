package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;

import java.util.Optional;

public record ProjectCommand(String title, int year, ProjectCategory category, Optional<String> slug, Optional<String> tag, String perex, String body,
                             Optional<MediaId> coverImage, Optional<String> coverImageAlt) {

    public ProjectCommand {
        if (category == null || slug == null || tag == null || coverImage == null || coverImageAlt == null) {
            throw new IllegalArgumentException("A project command carries its category and the optional slug, tag, cover image and its description even when absent");
        }
    }

    ProjectContent toContent() {
        Slug chosen = slug.map(String::trim).filter(value -> !value.isEmpty()).map(Slug::new).orElseGet(() -> Slug.fromText(title));
        return new ProjectContent(chosen, title, year, category, tag, perex, body, coverImage, coverImageAlt);
    }
}
