package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
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

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private static MediaImage image(int width, int height, int... variantWidths) {
        List<MediaVariant> variants = java.util.Arrays.stream(variantWidths)
                .mapToObj(variantWidth -> new MediaVariant(variantWidth, variantWidth * height / width, bytes(variantWidth)))
                .toList();
        return new MediaImage(MediaId.newId(NOW), width, height, variants, NOW);
    }

    private static byte[] bytes(int width) {
        return ("RIFF-webp-" + width).getBytes();
    }
}
