package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UnusedMediaCleanupServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-30T02:45:00Z");

    private final MediaImageRepository media = mock(MediaImageRepository.class);

    @Test
    @DisplayName("Given a grace of 7 days, when unused photos are deleted, then those uploaded more than 7 days before now go")
    void should_delete_photos_uploaded_before_seven_days_ago_when_cleaning_up_given_default_grace() {
        when(media.deleteUnusedUploadedBefore(Instant.parse("2026-10-23T02:45:00Z"))).thenReturn(2);

        MediaCleanup cleanup = service(Duration.ofDays(7)).deleteUnusedMedia();

        verify(media).deleteUnusedUploadedBefore(Instant.parse("2026-10-23T02:45:00Z"));
        assertThat(cleanup).isEqualTo(new MediaCleanup(Instant.parse("2026-10-23T02:45:00Z"), 2));
    }

    @Test
    @DisplayName("Given a grace of one day, when unused photos are deleted, then the cutoff moves with it")
    void should_cut_off_at_configured_grace_when_cleaning_up_given_one_day() {
        MediaCleanup cleanup = service(Duration.ofDays(1)).deleteUnusedMedia();

        verify(media).deleteUnusedUploadedBefore(Instant.parse("2026-10-29T02:45:00Z"));
        assertThat(cleanup.deleted()).isZero();
    }

    private UnusedMediaCleanupService service(Duration maxAge) {
        return new UnusedMediaCleanupService(media, new UnusedMediaCleanupProperties(maxAge), Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
