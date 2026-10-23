package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;
import java.util.UUID;

public record NewsArticleId(UUID value) {

    public NewsArticleId {
        if (value == null) {
            throw new IllegalArgumentException("News article id is required");
        }
    }

    public static NewsArticleId newId(Instant at) {
        return new NewsArticleId(UuidV7.generate(at));
    }

    public static NewsArticleId of(String value) {
        return new NewsArticleId(UUID.fromString(value));
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
