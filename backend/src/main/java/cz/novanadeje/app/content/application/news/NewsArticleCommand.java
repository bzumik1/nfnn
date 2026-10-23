package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.Slug;

import java.util.Optional;

public record NewsArticleCommand(String title, Optional<String> slug, Optional<String> tag, String perex, String body, Optional<MediaId> coverImage,
                                 Optional<String> coverImageAlt) {

    public NewsArticleCommand {
        if (slug == null || tag == null || coverImage == null || coverImageAlt == null) {
            throw new IllegalArgumentException("A news command carries the optional slug, tag, cover image and its description even when absent");
        }
    }

    NewsContent toContent() {
        Slug chosen = slug.map(String::trim).filter(value -> !value.isEmpty()).map(Slug::new).orElseGet(() -> Slug.fromText(title));
        return new NewsContent(chosen, title, tag, perex, body, coverImage, coverImageAlt);
    }
}
