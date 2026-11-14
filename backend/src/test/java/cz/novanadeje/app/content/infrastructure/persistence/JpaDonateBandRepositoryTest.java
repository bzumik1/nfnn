package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.content.domain.donateband.DonateBand;
import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.donateband.DonateBandRepository;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaDonateBandRepositoryTest {

    private static final Instant BEFORE = Instant.parse("2026-11-04T10:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @Autowired
    private DonateBandRepository band;
    @Autowired
    private MediaImageRepository media;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given nothing saved, when the band is read, then there is none")
    void should_find_nothing_when_read_given_nothing_saved() {
        assertThat(band.find()).isEmpty();
    }

    @Test
    @DisplayName("Given a band with a photo and its description, when it is saved and read, then it comes back as saved")
    void should_round_trip_when_saved_given_a_photo_with_a_description() {
        DonateBand shown = DonateBand.withoutPhoto(BEFORE).show(Optional.of(new DonateBandPhoto(storedImage(), Optional.of("Děti u stolu"))), NOW);

        band.save(shown);
        flushAndClear();

        assertThat(band.find()).contains(shown);
    }

    @Test
    @DisplayName("Given a band with a photo, when it is saved again without the photo, then the one row keeps no photo and no description")
    void should_keep_one_row_without_a_description_when_the_photo_is_removed_given_a_photo() {
        DonateBand shown = DonateBand.withoutPhoto(BEFORE).show(Optional.of(new DonateBandPhoto(storedImage(), Optional.of("Popis"))), BEFORE);
        band.save(shown);
        flushAndClear();

        band.save(shown.show(Optional.empty(), NOW));
        flushAndClear();

        assertThat(band.find()).contains(DonateBand.withoutPhoto(NOW));
        assertThat(jdbc.sql("select count(*) from content_donate_band where photo_media_id is null and photo_alt is null").query(Long.class).single())
                .isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from content_donate_band").query(Long.class).single()).isEqualTo(1);
    }

    private MediaId storedImage() {
        MediaImage image = new MediaImage(MediaId.newId(NOW), 1600, 900, List.of(new MediaVariant(480, 270, "RIFF-webp-480".getBytes())), NOW);
        media.save(image);
        return image.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
