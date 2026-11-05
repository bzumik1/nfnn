package cz.novanadeje.app.content.domain.news;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record NewsArticle(NewsArticleId id, NewsContent content, Optional<LocalDate> publishedOn, Optional<Integer> lookBackYear, Instant createdAt,
                          Instant updatedAt) {

    public static final int MIN_LOOK_BACK_YEAR = ProjectContent.MIN_YEAR;
    public static final int MAX_LOOK_BACK_YEAR = ProjectContent.MAX_YEAR;

    public NewsArticle {
        if (id == null || content == null || publishedOn == null || lookBackYear == null || createdAt == null || updatedAt == null) {
            throw new IllegalArgumentException("A news article has an id, content, a publication day and a year it looks back on (each even when absent) and its times");
        }
        if (lookBackYear.filter(year -> year < MIN_LOOK_BACK_YEAR || year > MAX_LOOK_BACK_YEAR).isPresent()) {
            throw new IllegalArgumentException("A news article looks back on a year between " + MIN_LOOK_BACK_YEAR + " and " + MAX_LOOK_BACK_YEAR);
        }
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("A news article cannot be updated before it was created");
        }
    }

    public static NewsArticle create(NewsArticleId id, NewsContent content, Instant now) {
        return create(id, content, Optional.empty(), now);
    }

    public static NewsArticle create(NewsArticleId id, NewsContent content, Optional<Integer> lookBackYear, Instant now) {
        return new NewsArticle(id, content, Optional.empty(), lookBackYear, now, now);
    }

    public NewsArticle edit(NewsContent newContent, Instant now) {
        return new NewsArticle(id, newContent, publishedOn, lookBackYear, createdAt, now);
    }

    public NewsArticle publish(LocalDate on, Instant now) {
        if (on == null) {
            throw new IllegalArgumentException("Publishing needs a day");
        }
        return new NewsArticle(id, content, Optional.of(on), lookBackYear, createdAt, now);
    }

    public NewsArticle unpublish(Instant now) {
        return new NewsArticle(id, content, Optional.empty(), lookBackYear, createdAt, now);
    }

    public NewsArticle lookBackOn(Optional<Integer> year, Instant now) {
        return new NewsArticle(id, content, publishedOn, year, createdAt, now);
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
