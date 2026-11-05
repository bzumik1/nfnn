package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.FocalPoint;
import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaNotFound;
import cz.novanadeje.app.content.domain.media.MediaSize;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FocalPointServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final UUID ADMIN = UUID.fromString("0199f3e0-0000-7000-8000-00000000a001");
    private static final MediaId PHOTO = MediaId.newId(NOW);

    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;

    private FocalPointService service() {
        return new FocalPointService(media, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a photo without a focal point, when one is placed, then it is stored, audited with its percentages and answered with the photo's size")
    void should_store_and_audit_the_point_when_placed_given_a_photo_without_one() {
        when(media.findSize(PHOTO)).thenReturn(Optional.of(new MediaSize(1600, 1000)));
        when(media.findFocalPoints(List.of(PHOTO))).thenReturn(Map.of());

        PhotoView view = service().place(ADMIN, PHOTO, Optional.of(new FocalPoint(42, 18)));

        assertThat(view).isEqualTo(new PhotoView(PHOTO, 1600, 1000, Optional.of(new FocalPoint(42, 18))));
        verify(media).placeFocalPoint(PHOTO, Optional.of(new FocalPoint(42, 18)));
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().action()).isEqualTo("CHANGE_PHOTO_FOCAL_POINT");
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().details()).isEqualTo("Bod výřezu fotky " + PHOTO + " nastaven na 42 % zleva a 18 % shora");
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a photo with a focal point, when it is removed, then the photo is cropped around its centre again and the removal is audited")
    void should_remove_and_audit_the_point_when_removed_given_a_photo_with_one() {
        when(media.findSize(PHOTO)).thenReturn(Optional.of(new MediaSize(1600, 1000)));
        when(media.findFocalPoints(List.of(PHOTO))).thenReturn(Map.of(PHOTO, new FocalPoint(42, 18)));

        PhotoView view = service().place(ADMIN, PHOTO, Optional.empty());

        assertThat(view.focalPoint()).isEmpty();
        verify(media).placeFocalPoint(PHOTO, Optional.empty());
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().details()).isEqualTo("Bod výřezu fotky " + PHOTO + " zrušen, fotka se ořezává kolem středu");
    }

    @Test
    @DisplayName("Given a photo whose focal point is already the one asked for, when it is placed again, then nothing is written or audited")
    void should_change_nothing_when_placed_given_the_same_point() {
        when(media.findSize(PHOTO)).thenReturn(Optional.of(new MediaSize(1600, 1000)));
        when(media.findFocalPoints(List.of(PHOTO))).thenReturn(Map.of(PHOTO, new FocalPoint(42, 18)));

        PhotoView view = service().place(ADMIN, PHOTO, Optional.of(new FocalPoint(42, 18)));

        assertThat(view.focalPoint()).contains(new FocalPoint(42, 18));
        verify(media, never()).placeFocalPoint(any(), any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given an unknown photo, when a focal point is placed, then it is refused as not found and nothing is audited")
    void should_refuse_when_placed_given_an_unknown_photo() {
        when(media.findSize(PHOTO)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().place(ADMIN, PHOTO, Optional.of(new FocalPoint(50, 50)))).isInstanceOf(MediaNotFound.class);
        verifyNoInteractions(events);
    }
}
