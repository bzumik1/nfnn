package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.about.AboutSectionRepository;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.Slug;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.news.NewsArticleId;
import cz.novanadeje.app.content.domain.news.NewsArticleRepository;
import cz.novanadeje.app.content.domain.news.NewsContent;
import cz.novanadeje.app.content.domain.project.Project;
import cz.novanadeje.app.content.domain.project.ProjectContent;
import cz.novanadeje.app.content.domain.project.ProjectId;
import cz.novanadeje.app.content.domain.project.ProjectRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaMediaImageRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");

    @Autowired
    private MediaImageRepository media;
    @Autowired
    private NewsArticleRepository news;
    @Autowired
    private ProjectRepository projects;
    @Autowired
    private AboutSectionRepository about;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given an image with three variants, when it is saved and read, then the variants come back by width with their bytes")
    void should_round_trip_when_saved_given_three_variants() {
        MediaImage image = image(2000, 1200, 480, 960, 1440);

        media.save(image);
        flushAndClear();

        Optional<MediaImage> found = media.findById(image.id());
        assertThat(found).isPresent();
        assertThat(found.get().width()).isEqualTo(2000);
        assertThat(found.get().variants()).extracting(MediaVariant::width).containsExactly(480, 960, 1440);
        assertThat(found.get().variants().getFirst().webp()).isEqualTo(bytes(480));
        assertThat(found.get().variantFor(Optional.of(700)).width()).isEqualTo(960);
        assertThat(found.get().variantFor(Optional.of(5000)).width()).isEqualTo(1440);
        assertThat(found.get().variantFor(Optional.empty()).width()).isEqualTo(1440);
        assertThat(media.exists(image.id())).isTrue();
    }

    @Test
    @DisplayName("Given a saved image, when it is deleted, then its variants go with it")
    void should_delete_variants_when_deleted_given_a_saved_image() {
        MediaImage image = image(700, 500, 480, 700);
        media.save(image);
        flushAndClear();

        media.delete(image.id());
        flushAndClear();

        assertThat(media.findById(image.id())).isEmpty();
        assertThat(jdbc.sql("select count(*) from content_media_variant").query(Long.class).single()).isZero();
    }

    @Test
    @DisplayName("Given photos on a news article, on a project and on nothing, when the unused ones uploaded before a moment are deleted, then only the old unused one goes")
    void should_delete_only_old_unused_photos_when_cleaned_up_given_used_and_unused_photos() {
        MediaImage onNews = image(700, 500, NOW.minusSeconds(864_000), 480);
        MediaImage onProject = image(700, 500, NOW.minusSeconds(864_000), 480);
        MediaImage oldUnused = image(700, 500, NOW.minusSeconds(864_000), 480);
        MediaImage freshUnused = image(700, 500, NOW.minusSeconds(3_600), 480);
        List.of(onNews, onProject, oldUnused, freshUnused).forEach(media::save);
        news.save(NewsArticle.create(NewsArticleId.newId(NOW), new NewsContent(new Slug("koncert"), "Koncert", Optional.empty(), "Perex", "Text",
                Optional.of(onNews.id())), NOW));
        projects.save(Project.create(ProjectId.newId(NOW), new ProjectContent(new Slug("dominik"), "Dominik", 2024, Optional.empty(), "Perex", "Text",
                Optional.of(onProject.id())), NOW));
        flushAndClear();

        int deleted = media.deleteUnusedUploadedBefore(NOW.minusSeconds(604_800));
        flushAndClear();

        assertThat(deleted).isEqualTo(1);
        assertThat(media.exists(oldUnused.id())).isFalse();
        assertThat(media.exists(onNews.id())).isTrue();
        assertThat(media.exists(onProject.id())).isTrue();
        assertThat(media.exists(freshUnused.id())).isTrue();
    }

    @Test
    @DisplayName("Given a photo on a project, when it is deleted only if unused, then it stays, and once unused it goes")
    void should_keep_a_used_photo_when_deleted_if_unused_given_a_project_uses_it() {
        MediaImage photo = image(700, 500, 480);
        MediaImage spare = image(700, 500, 480);
        media.save(photo);
        media.save(spare);
        projects.save(Project.create(ProjectId.newId(NOW), new ProjectContent(new Slug("dominik"), "Dominik", 2024, Optional.empty(), "Perex", "Text",
                Optional.of(photo.id())), NOW));
        flushAndClear();

        boolean usedDeleted = media.deleteIfUnused(photo.id());
        boolean spareDeleted = media.deleteIfUnused(spare.id());
        flushAndClear();

        assertThat(usedDeleted).isFalse();
        assertThat(spareDeleted).isTrue();
        assertThat(media.exists(photo.id())).isTrue();
        assertThat(media.exists(spare.id())).isFalse();
    }

    @Test
    @DisplayName("Given the photo the About section shows, when it is deleted only if unused or the old unused photos are cleaned up, then it stays")
    void should_keep_the_about_photo_when_cleaned_up_given_the_about_section_shows_it() {
        MediaImage shown = image(1413, 1884, NOW.minusSeconds(864_000), 480);
        media.save(shown);
        about.save(AboutSection.withoutPhoto(NOW).show(Optional.of(new AboutPhoto(shown.id(), Optional.empty(), Optional.empty())), NOW));
        flushAndClear();

        boolean deletedIfUnused = media.deleteIfUnused(shown.id());
        int cleanedUp = media.deleteUnusedUploadedBefore(NOW.minusSeconds(604_800));
        flushAndClear();

        assertThat(deletedIfUnused).isFalse();
        assertThat(cleanedUp).isZero();
        assertThat(media.exists(shown.id())).isTrue();
    }

    @Test
    @DisplayName("Given a stored image and an unknown id, when their sizes are read, then the image answers its original size without its variants and the unknown id nothing")
    void should_read_the_original_size_when_asked_given_a_stored_image() {
        MediaImage portrait = image(1413, 1884, 480, 960, 1440);
        media.save(portrait);
        flushAndClear();

        assertThat(media.findSize(portrait.id())).contains(new MediaSize(1413, 1884));
        assertThat(media.findSize(MediaId.newId(NOW))).isEmpty();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private static MediaImage image(int width, int height, int... variantWidths) {
        return image(width, height, NOW, variantWidths);
    }

    private static MediaImage image(int width, int height, Instant uploadedAt, int... variantWidths) {
        List<MediaVariant> variants = java.util.Arrays.stream(variantWidths)
                .mapToObj(variantWidth -> new MediaVariant(variantWidth, variantWidth * height / width, bytes(variantWidth)))
                .toList();
        return new MediaImage(MediaId.newId(uploadedAt), width, height, variants, uploadedAt);
    }

    private static byte[] bytes(int width) {
        return ("RIFF-webp-" + width).getBytes();
    }
}
