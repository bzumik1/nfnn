package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.Slug;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaNewsArticleRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.parse("2026-10-23");

    @Autowired
    private NewsArticleRepository news;
    @Autowired
    private MediaImageRepository media;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given an article with a cover image, when it is saved and read, then every field comes back")
    void should_round_trip_when_saved_given_a_cover_image() {
        MediaImage image = image();
        media.save(image);
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(NOW),
                new NewsContent(new Slug("dominik"), "Dominik", Optional.of("Projekt"), "Perex", "Text\n\nDruhý odstavec", Optional.of(image.id()),
                        Optional.of("Dominik na novém vozíku")), NOW);

        news.save(article);
        flushAndClear();

        assertThat(news.findById(article.id())).contains(article);
        assertThat(news.findBySlug(new Slug("dominik"))).contains(article);
        assertThat(news.isSlugTakenByAnother(new Slug("dominik"), article.id())).isFalse();
        assertThat(news.isSlugTakenByAnother(new Slug("dominik"), NewsArticleId.newId(NOW))).isTrue();
    }

    @Test
    @DisplayName("Given drafts and published articles, when the administration list is read, then drafts come first and the rest newest first")
    void should_list_drafts_first_when_all_are_read() {
        NewsArticle draft = save(article("koncept", NOW.plusSeconds(10)), Optional.empty());
        NewsArticle older = save(article("starsi", NOW), Optional.of(LocalDate.parse("2026-09-01")));
        NewsArticle newer = save(article("novejsi", NOW), Optional.of(LocalDate.parse("2026-10-20")));
        NewsArticle scheduled = save(article("planovana", NOW), Optional.of(LocalDate.parse("2026-11-05")));
        flushAndClear();

        assertThat(news.findAllDraftsFirst()).extracting(NewsArticle::slug)
                .containsExactly(draft.slug(), scheduled.slug(), newer.slug(), older.slug());
    }

    @Test
    @DisplayName("Given articles published on several days, when the visible page is read, then only those published by today come newest first in pages")
    void should_page_visible_newest_first_when_read_given_today() {
        save(article("koncept", NOW), Optional.empty());
        save(article("planovana", NOW), Optional.of(LocalDate.parse("2026-11-05")));
        save(article("dnes", NOW), Optional.of(TODAY));
        save(article("vcera", NOW), Optional.of(TODAY.minusDays(1)));
        save(article("loni", NOW), Optional.of(LocalDate.parse("2025-12-24")));
        flushAndClear();

        assertThat(news.countVisible(TODAY)).isEqualTo(3);
        assertThat(news.findVisibleNewestFirst(TODAY, 0, 2)).extracting(NewsArticle::slug).containsExactly(new Slug("dnes"), new Slug("vcera"));
        assertThat(news.findVisibleNewestFirst(TODAY, 2, 2)).extracting(NewsArticle::slug).containsExactly(new Slug("loni"));
        assertThat(news.findVisibleNewestFirst(TODAY.minusDays(1), 0, 10)).extracting(NewsArticle::slug).containsExactly(new Slug("vcera"), new Slug("loni"));
    }

    @Test
    @DisplayName("Given a saved article, when it is deleted, then it is gone")
    void should_delete_when_deleted_given_a_saved_article() {
        NewsArticle article = save(article("smazat", NOW), Optional.empty());
        flushAndClear();

        news.delete(article.id());
        flushAndClear();

        assertThat(news.findById(article.id())).isEmpty();
    }

    private NewsArticle save(NewsArticle article, Optional<LocalDate> publishedOn) {
        NewsArticle saved = publishedOn.map(day -> article.publish(day, NOW)).orElse(article);
        news.save(saved);
        return saved;
    }

    private static NewsArticle article(String slug, Instant at) {
        return NewsArticle.create(NewsArticleId.newId(at), new NewsContent(new Slug(slug), slug, Optional.empty(), "Perex", "Text", Optional.empty()), at);
    }

    private static MediaImage image() {
        return new MediaImage(MediaId.newId(NOW), 700, 500, List.of(new MediaVariant(480, 343, "webp".getBytes())), NOW);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
