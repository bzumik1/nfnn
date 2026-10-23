package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.Slug;

import java.util.Optional;

public record ProjectCommand(String title, int year, Optional<String> slug, Optional<String> tag, String perex, String body,
                             Optional<MediaId> coverImage) {

    public ProjectCommand {
        if (slug == null || tag == null || coverImage == null) {
            throw new IllegalArgumentException("A project command carries the optional slug, tag and cover image even when absent");
        }
    }

    ProjectContent toContent() {
        Slug chosen = slug.map(String::trim).filter(value -> !value.isEmpty()).map(Slug::new).orElseGet(() -> Slug.fromText(title));
        return new ProjectContent(chosen, title, year, tag, perex, body, coverImage);
    }
}
