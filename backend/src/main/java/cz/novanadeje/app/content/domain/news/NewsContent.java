package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.media.MediaId;

import java.util.Optional;

public record NewsContent(Slug slug, String title, Optional<String> tag, String perex, String body, Optional<MediaId> coverImage) {

    public static final int MAX_TITLE_LENGTH = 120;
    public static final int MAX_TAG_LENGTH = 40;
    public static final int MAX_PEREX_LENGTH = 300;
    public static final int MAX_BODY_LENGTH = 20_000;

    public NewsContent {
        if (slug == null || tag == null || coverImage == null) {
            throw new IllegalArgumentException("News content has a slug, a tag (even when absent) and a cover image (even when absent)");
        }
        title = requireText(title, "title", MAX_TITLE_LENGTH);
        perex = requireText(perex, "perex", MAX_PEREX_LENGTH);
        body = requireText(body, "body", MAX_BODY_LENGTH);
        tag = tag.map(String::trim).filter(value -> !value.isEmpty());
        if (tag.isPresent() && tag.get().length() > MAX_TAG_LENGTH) {
            throw new IllegalArgumentException("The tag of a news article is at most " + MAX_TAG_LENGTH + " characters");
        }
    }

    private static String requireText(String value, String name, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("A news article needs a " + name);
        }
        String trimmed = value.strip();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException("The " + name + " of a news article is at most " + maxLength + " characters");
        }
        return trimmed;
    }
}
