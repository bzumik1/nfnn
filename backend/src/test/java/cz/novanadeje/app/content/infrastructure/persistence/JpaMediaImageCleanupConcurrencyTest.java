package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import cz.novanadeje.app.support.DatabaseCleaner;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JpaMediaImageCleanupConcurrencyTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final Instant TEN_DAYS_AGO = NOW.minusSeconds(864_000);
    private static final Instant WEEK_AGO = NOW.minusSeconds(604_800);

    @Autowired
    private MediaImageRepository media;
    @Autowired
    private NewsArticleRepository news;
    @Autowired
    private ProjectRepository projects;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    private final ExecutorService callers = Executors.newFixedThreadPool(2);

    @BeforeEach
    void emptyDatabase() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void stopCallersAndEmptyDatabase() {
        callers.shutdownNow();
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given an old photo a news article being saved has just put on but not committed, and an old photo nothing uses, when the old unused photos are cleaned up meanwhile, then the cleanup skips the first without waiting, deletes the second, and the article is saved")
    void should_skip_the_contested_photo_when_cleaned_up_given_an_uncommitted_reference() throws Exception {
        MediaImage contested = image(TEN_DAYS_AGO);
        MediaImage unused = image(TEN_DAYS_AGO);
        inTransaction(() -> {
            media.save(contested);
            media.save(unused);
            return null;
        });
        NewsArticle article = NewsArticle.create(NewsArticleId.newId(NOW),
                new NewsContent(new Slug("koncert"), "Koncert", Optional.empty(), "Perex", "Text", Optional.of(contested.id())), NOW);

        Held<Integer> cleanup = whileHeldBy(() -> news.save(article), () -> media.deleteUnusedUploadedBefore(WEEK_AGO));

        assertThat(cleanup.finishedWhileHeld()).isTrue();
        assertThat(cleanup.result()).isEqualTo(1);
        assertThat(exists(contested.id())).isTrue();
        assertThat(exists(unused.id())).isFalse();
        assertThat(jdbc.sql("select cover_media_id from content_news").query(UUID.class).single()).isEqualTo(contested.id().value());
    }

    @Test
    @DisplayName("Given a photo a project being saved has just put on but not committed, when another administrator's save drops the same photo from a news article meanwhile, then that save keeps the photo without waiting and both saves succeed")
    void should_keep_the_contested_photo_when_deleted_if_unused_given_an_uncommitted_reference() throws Exception {
        MediaImage contested = image(NOW);
        inTransaction(() -> {
            media.save(contested);
            return null;
        });
        Project project = Project.create(ProjectId.newId(NOW),
                new ProjectContent(new Slug("dominik"), "Dominik", 2024, Optional.empty(), "Perex", "Text", Optional.of(contested.id())), NOW);

        Held<Boolean> dropped = whileHeldBy(() -> projects.save(project), () -> media.deleteIfUnused(contested.id()));

        assertThat(dropped.finishedWhileHeld()).isTrue();
        assertThat(dropped.result()).isFalse();
        assertThat(exists(contested.id())).isTrue();
        assertThat(jdbc.sql("select cover_media_id from content_project").query(UUID.class).single()).isEqualTo(contested.id().value());
    }

    private <T> Held<T> whileHeldBy(Runnable holder, Callable<T> contender) throws Exception {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> held = callers.submit(() -> inTransaction(() -> {
                holder.run();
                entityManager.flush();
                written.countDown();
                release.await(30, TimeUnit.SECONDS);
                return null;
            }));
            assertThat(written.await(30, TimeUnit.SECONDS)).isTrue();
            Future<T> contending = callers.submit(() -> inTransaction(contender));
            await().until(() -> contending.isDone() || waitingForLocks() >= 1);
            boolean finishedWhileHeld = contending.isDone();
            release.countDown();
            held.get(30, TimeUnit.SECONDS);
            return new Held<>(finishedWhileHeld, contending.get(30, TimeUnit.SECONDS));
        } finally {
            release.countDown();
        }
    }

    private <T> T inTransaction(Callable<T> work) {
        return new TransactionTemplate(transactionManager).execute(status -> {
            try {
                return work.call();
            } catch (RuntimeException failed) {
                throw failed;
            } catch (Exception failed) {
                throw new IllegalStateException(failed);
            }
        });
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private boolean exists(MediaId id) {
        return jdbc.sql("select count(*) from content_media where id = ?").param(id.value()).query(Long.class).single() == 1;
    }

    private static MediaImage image(Instant uploadedAt) {
        return new MediaImage(MediaId.newId(uploadedAt), 700, 500, List.of(new MediaVariant(480, 342, "RIFF-webp-480".getBytes())), uploadedAt);
    }

    private record Held<T>(boolean finishedWhileHeld, T result) {
    }
}
