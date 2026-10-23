package cz.novanadeje.app.content.domain.news;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record NewsArticle(NewsArticleId id, NewsContent content, Optional<LocalDate> publishedOn, Instant createdAt, Instant updatedAt) {

    public NewsArticle {
        if (id == null || content == null || publishedOn == null || createdAt == null || updatedAt == null) {
            throw new IllegalArgumentException("A news article has an id, content, a publication day (even when absent) and its times");
        }
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("A news article cannot be updated before it was created");
        }
    }

    public static NewsArticle create(NewsArticleId id, NewsContent content, Instant now) {
        return new NewsArticle(id, content, Optional.empty(), now, now);
    }

    public NewsArticle edit(NewsContent newContent, Instant now) {
        return new NewsArticle(id, newContent, publishedOn, createdAt, now);
    }

    public NewsArticle publish(LocalDate on, Instant now) {
        if (on == null) {
            throw new IllegalArgumentException("Publishing needs a day");
        }
        return new NewsArticle(id, content, Optional.of(on), createdAt, now);
    }

    public NewsArticle unpublish(Instant now) {
        return new NewsArticle(id, content, Optional.empty(), createdAt, now);
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
