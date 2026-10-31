package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.about.AboutSectionRepository;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ContentPersistenceTestConfiguration.class)
class JpaAboutSectionRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Autowired
    private AboutSectionRepository about;
    @Autowired
    private MediaImageRepository media;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing saved, when the section is read, then there is none")
    void should_find_nothing_when_read_given_nothing_saved() {
        assertThat(about.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a section with a photo and its texts, when it is saved and read, then it comes back as saved")
    void should_round_trip_when_saved_given_a_photo_with_texts() {
        MediaId image = storedImage();
        AboutSection section = AboutSection.withoutPhoto(BEFORE)
                .show(Optional.of(new AboutPhoto(image, Optional.of("Chlapec v náručí"), Optional.of("Kde to začalo"))), NOW);

        about.save(section);
        flushAndClear();

        assertThat(about.find()).contains(section);
    }

    @Test
    @DisplayName("Given a section with a photo, when it is saved again without the photo, then the one row keeps no photo and no texts")
    void should_keep_one_row_without_texts_when_the_photo_is_removed_given_a_photo() {
        MediaId image = storedImage();
        AboutSection shown = AboutSection.withoutPhoto(BEFORE)
                .show(Optional.of(new AboutPhoto(image, Optional.of("Popis"), Optional.of("Popisek"))), BEFORE);
        about.save(shown);
        flushAndClear();

        about.save(shown.show(Optional.empty(), NOW));
        flushAndClear();

        assertThat(about.find()).contains(AboutSection.withoutPhoto(NOW));
        assertThat(jdbc.sql("select count(*) from content_about where photo_media_id is null and photo_alt is null and photo_caption is null")
                .query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from content_about").query(Long.class).single()).isEqualTo(1);
    }

    private MediaId storedImage() {
        MediaImage image = new MediaImage(MediaId.newId(NOW), 1413, 1884, List.of(new MediaVariant(480, 640, "RIFF-webp-480".getBytes())), NOW);
        media.save(image);
        return image.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
