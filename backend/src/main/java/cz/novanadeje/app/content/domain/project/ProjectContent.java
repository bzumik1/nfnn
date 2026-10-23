package cz.novanadeje.app.content.domain.project;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record ProjectContent(Slug slug, String title, int year, Optional<String> tag, String perex, String body, Optional<MediaId> coverImage) {

    public static final int MAX_TITLE_LENGTH = 120;
    public static final int MAX_TAG_LENGTH = 40;
    public static final int MAX_PEREX_LENGTH = 300;
    public static final int MAX_BODY_LENGTH = 20_000;
    public static final int MIN_YEAR = 2005;
    public static final int MAX_YEAR = 2100;

    public ProjectContent {
        if (slug == null || tag == null || coverImage == null) {
            throw new IllegalArgumentException("Project content has a slug, a tag (even when absent) and a cover image (even when absent)");
        }
        title = requireText(title, "title", MAX_TITLE_LENGTH);
        if (year < MIN_YEAR || year > MAX_YEAR) {
            throw new IllegalArgumentException("The year of a project is between " + MIN_YEAR + " and " + MAX_YEAR);
        }
        perex = requireText(perex, "perex", MAX_PEREX_LENGTH);
        body = requireText(body, "body", MAX_BODY_LENGTH);
        tag = tag.map(String::trim).filter(value -> !value.isEmpty());
        if (tag.isPresent() && tag.get().length() > MAX_TAG_LENGTH) {
            throw new IllegalArgumentException("The tag of a project is at most " + MAX_TAG_LENGTH + " characters");
        }
    }

    private static String requireText(String value, String name, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("A project needs a " + name);
        }
        String trimmed = value.strip();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException("The " + name + " of a project is at most " + maxLength + " characters");
        }
        return trimmed;
    }
}
