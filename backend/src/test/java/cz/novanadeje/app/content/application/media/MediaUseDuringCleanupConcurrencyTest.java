package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.content.application.about.AboutCommand;
import cz.novanadeje.app.content.application.about.AboutService;
import cz.novanadeje.app.content.application.donateband.DonateBandCommand;
import cz.novanadeje.app.content.application.donateband.DonateBandService;
import cz.novanadeje.app.content.application.news.NewsAdminService;
import cz.novanadeje.app.content.application.news.NewsArticleCommand;
import cz.novanadeje.app.content.application.people.PeopleAdminService;
import cz.novanadeje.app.content.application.people.PersonCommand;
import cz.novanadeje.app.content.application.project.ProjectAdminService;
import cz.novanadeje.app.content.application.project.ProjectCommand;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.project.ProjectCategory;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@IntegrationTest
class MediaUseDuringCleanupConcurrencyTest {

    private static final UUID ADMIN = UUID.fromString("01900000-0000-7000-8000-000000000001");

    @Autowired
    private MediaImageRepository media;
    @Autowired
    private NewsAdminService news;
    @Autowired
    private ProjectAdminService projects;
    @Autowired
    private AboutService about;
    @Autowired
    private DonateBandService donateBand;
    @Autowired
    private PeopleAdminService people;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private Clock clock;

    private final ExecutorService callers = Executors.newFixedThreadPool(2);

    enum Writer {
        NEWS_COVER, PROJECT_COVER, ABOUT_PHOTO, DONATE_BAND_PHOTO, PERSON_PORTRAIT, WEB_SIGNATURE
    }

    @BeforeEach
    void emptyDatabase() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @AfterEach
    void stopCallersAndEmptyDatabase() {
        callers.shutdownNow();
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Writer.class)
    @DisplayName("Given a photo the cleanup has locked and deleted but not committed yet, when an administrator's save puts it on an item meanwhile, then the save waits and is refused as photo not found instead of failing on the foreign key")
    void should_refuse_as_not_found_when_saved_during_cleanup_given_the_cleanup_deletes_the_photo(Writer writer) throws Exception {
        MediaImage photo = new MediaImage(MediaId.newId(clock.instant()), 700, 500,
                List.of(new MediaVariant(480, 342, "RIFF-webp-480".getBytes())), clock.instant());
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> media.save(photo));
        PersonId person = writer == Writer.WEB_SIGNATURE ? people.add(ADMIN, person(Optional.empty())).id() : null;
        CountDownLatch deleted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        Future<Boolean> cleanup = callers.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
            boolean gone = media.deleteIfUnused(photo.id());
            deleted.countDown();
            awaitQuietly(release);
            return gone;
        }));
        try {
            assertThat(deleted.await(30, TimeUnit.SECONDS)).isTrue();
            Future<?> save = callers.submit(() -> save(writer, photo.id(), person));
            await().until(() -> save.isDone() || waitingForLocks() >= 1);
            release.countDown();

            assertThat(cleanup.get(30, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> save.get(30, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(MediaNotFound.class);
        } finally {
            release.countDown();
        }
    }

    private void save(Writer writer, MediaId photo, PersonId person) {
        switch (writer) {
            case NEWS_COVER -> news.create(ADMIN, new NewsArticleCommand("Koncert", Optional.empty(), Optional.empty(), "Perex", "Text",
                    Optional.of(photo), Optional.empty(), Optional.empty()));
            case PROJECT_COVER -> projects.create(ADMIN, new ProjectCommand("Dominik", 2024, ProjectCategory.OTHER, Optional.empty(), Optional.empty(),
                    "Perex", "Text", Optional.of(photo), Optional.empty()));
            case ABOUT_PHOTO -> about.change(ADMIN, new AboutCommand(Optional.of(photo), Optional.empty(), Optional.empty()));
            case DONATE_BAND_PHOTO -> donateBand.change(ADMIN, new DonateBandCommand(Optional.of(photo), Optional.empty()));
            case PERSON_PORTRAIT -> people.add(ADMIN, person(Optional.of(photo)));
            case WEB_SIGNATURE -> people.setWebSignature(ADMIN, person, photo);
        }
    }

    private static PersonCommand person(Optional<MediaId> portrait) {
        return new PersonCommand("Eva Vzorová", Optional.empty(), false, Optional.empty(), false, portrait, PersonEmails.NONE);
    }

    private long waitingForLocks() {
        return jdbc.sql("select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
                .query(Long.class).single();
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
