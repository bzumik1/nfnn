package cz.novanadeje.app.content.application.donateband;

import cz.novanadeje.app.content.domain.donateband.DonateBand;
import cz.novanadeje.app.content.domain.donateband.DonateBandPhoto;
import cz.novanadeje.app.content.domain.donateband.DonateBandRepository;
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
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonateBandServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-11-04T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-05T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final MediaId FIRST = MediaId.newId(BEFORE);
    private static final MediaId SECOND = MediaId.newId(NOW);
    private static final MediaSize WIDE = new MediaSize(1600, 900);

    @Mock
    private DonateBandRepository band;
    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;

    private DonateBandService service() {
        return new DonateBandService(band, media, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a stored photo with a focal point, when the band is read, then it carries the photo with the size of its original, its description and its point")
    void should_carry_the_photo_its_size_and_point_when_read_given_a_stored_photo() {
        when(band.find()).thenReturn(Optional.of(shown(FIRST)));
        when(media.findSize(FIRST)).thenReturn(Optional.of(WIDE));
        when(media.findFocalPoints(List.of(FIRST))).thenReturn(Map.of(FIRST, new FocalPoint(30, 40)));

        DonateBandView view = service().read();

        assertThat(view.photo()).hasValueSatisfying(photo -> {
            assertThat(photo.id()).isEqualTo(FIRST);
            assertThat(photo.width()).isEqualTo(1600);
            assertThat(photo.height()).isEqualTo(900);
            assertThat(photo.alt()).contains("Popis");
            assertThat(photo.focalPoint()).contains(new FocalPoint(30, 40));
        });
    }

    @Test
    @DisplayName("Given nothing stored, when the band is read, then it has no photo")
    void should_have_no_photo_when_read_given_nothing_stored() {
        when(band.find()).thenReturn(Optional.empty());

        assertThat(service().read().photo()).isEmpty();
    }

    @Test
    @DisplayName("Given no photo yet, when a photo is set, then it is stored, nothing is deleted and the change is audited as set")
    void should_store_and_audit_the_photo_when_set_given_no_photo() {
        when(media.findSize(FIRST)).thenReturn(Optional.of(WIDE));
        when(band.find()).thenReturn(Optional.empty());

        DonateBandView view = service().change(ADMIN, command(FIRST));

        assertThat(view.photo()).hasValueSatisfying(photo -> assertThat(photo.width()).isEqualTo(1600));
        ArgumentCaptor<DonateBand> saved = ArgumentCaptor.forClass(DonateBand.class);
        verify(band).save(saved.capture());
        assertThat(saved.getValue().image()).contains(FIRST);
        assertThat(saved.getValue().updatedAt()).isEqualTo(NOW);
        verify(media, never()).deleteIfUnused(any());
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("CHANGE_DONATE_BAND_PHOTO");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Fotka " + FIRST + " v pruhu Přispět nastavena");
    }

    @Test
    @DisplayName("Given a photo, when another photo is set, then the old one is deleted when nothing else uses it")
    void should_delete_the_old_photo_when_replaced_given_a_photo() {
        when(media.findSize(SECOND)).thenReturn(Optional.of(WIDE));
        when(band.find()).thenReturn(Optional.of(shown(FIRST)));

        service().change(ADMIN, command(SECOND));

        verify(media).deleteIfUnused(FIRST);
        assertThat(audited().details()).isEqualTo("Fotka " + SECOND + " v pruhu Přispět nastavena");
    }

    @Test
    @DisplayName("Given a photo, when the same photo is set with another description, then it stays and the change is audited as edited")
    void should_keep_the_photo_when_its_description_changes_given_a_photo() {
        when(media.findSize(FIRST)).thenReturn(Optional.of(WIDE));
        when(band.find()).thenReturn(Optional.of(shown(FIRST)));

        service().change(ADMIN, new DonateBandCommand(Optional.of(FIRST), Optional.of("Jiný popis")));

        verify(media, never()).deleteIfUnused(any());
        assertThat(audited().details()).isEqualTo("Fotka " + FIRST + " v pruhu Přispět upravena");
    }

    @Test
    @DisplayName("Given a photo, when the photo is removed, then the band has none, the photo is deleted when nothing else uses it and the removal is audited")
    void should_remove_and_delete_the_photo_when_removed_given_a_photo() {
        when(band.find()).thenReturn(Optional.of(shown(FIRST)));

        DonateBandView view = service().change(ADMIN, removal());

        assertThat(view.photo()).isEmpty();
        ArgumentCaptor<DonateBand> saved = ArgumentCaptor.forClass(DonateBand.class);
        verify(band).save(saved.capture());
        assertThat(saved.getValue().photo()).isEmpty();
        verify(media).deleteIfUnused(FIRST);
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("REMOVE_DONATE_BAND_PHOTO");
        assertThat(action.details()).isEqualTo("Fotka " + FIRST + " v pruhu Přispět odebrána");
    }

    @Test
    @DisplayName("Given no photo, when the photo is removed, then nothing is stored, deleted or audited")
    void should_change_nothing_when_removed_given_no_photo() {
        when(band.find()).thenReturn(Optional.of(DonateBand.withoutPhoto(BEFORE)));

        DonateBandView view = service().change(ADMIN, removal());

        assertThat(view.photo()).isEmpty();
        verify(band, never()).save(any());
        verify(media, never()).deleteIfUnused(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a photo that was never uploaded, when it is set, then it is refused and nothing changes")
    void should_refuse_the_photo_when_set_given_an_unknown_image() {
        when(media.findSize(SECOND)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().change(ADMIN, command(SECOND))).isInstanceOf(MediaNotFound.class);
        verify(band, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    private AdminActionPerformed audited() {
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
        return action.getValue();
    }

    private static DonateBand shown(MediaId image) {
        return DonateBand.withoutPhoto(BEFORE).show(Optional.of(new DonateBandPhoto(image, Optional.of("Popis"))), BEFORE);
    }

    private static DonateBandCommand command(MediaId image) {
        return new DonateBandCommand(Optional.of(image), Optional.of("Popis"));
    }

    private static DonateBandCommand removal() {
        return new DonateBandCommand(Optional.empty(), Optional.empty());
    }
}
