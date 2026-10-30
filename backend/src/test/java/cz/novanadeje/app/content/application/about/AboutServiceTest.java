package cz.novanadeje.app.content.application.about;

import cz.novanadeje.app.content.domain.about.AboutPhoto;
import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.about.AboutSectionRepository;
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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AboutServiceTest {

    private static final Instant BEFORE = Instant.parse("2026-10-29T08:00:00Z");
    private static final Instant NOW = Instant.parse("2026-10-30T08:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final MediaId FIRST = MediaId.newId(BEFORE);
    private static final MediaId SECOND = MediaId.newId(NOW);
    private static final MediaSize PORTRAIT = new MediaSize(1413, 1884);

    @Mock
    private AboutSectionRepository about;
    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;

    private AboutService service() {
        return new AboutService(about, media, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a stored photo, when the section is read, then it carries the photo with the size of its original and its texts")
    void should_carry_the_photo_and_its_size_when_read_given_a_stored_photo() {
        when(about.find()).thenReturn(Optional.of(shown(FIRST)));
        when(media.findSize(FIRST)).thenReturn(Optional.of(PORTRAIT));

        AboutView view = service().read();

        assertThat(view.photo()).hasValueSatisfying(photo -> {
            assertThat(photo.id()).isEqualTo(FIRST);
            assertThat(photo.width()).isEqualTo(1413);
            assertThat(photo.height()).isEqualTo(1884);
            assertThat(photo.alt()).contains("Popis");
            assertThat(photo.caption()).contains("Popisek");
        });
    }

    @Test
    @DisplayName("Given nothing stored, when the section is read, then it has no photo")
    void should_have_no_photo_when_read_given_nothing_stored() {
        when(about.find()).thenReturn(Optional.empty());

        assertThat(service().read().photo()).isEmpty();
    }

    @Test
    @DisplayName("Given no photo yet, when a photo is set, then it is stored, nothing is deleted and the change is audited as set")
    void should_store_and_audit_the_photo_when_set_given_no_photo() {
        when(media.findSize(FIRST)).thenReturn(Optional.of(PORTRAIT));
        when(about.find()).thenReturn(Optional.empty());

        AboutView view = service().change(ADMIN, command(FIRST));

        assertThat(view.photo()).hasValueSatisfying(photo -> assertThat(photo.height()).isEqualTo(1884));
        ArgumentCaptor<AboutSection> saved = ArgumentCaptor.forClass(AboutSection.class);
        verify(about).save(saved.capture());
        assertThat(saved.getValue().image()).contains(FIRST);
        assertThat(saved.getValue().updatedAt()).isEqualTo(NOW);
        verify(media, never()).deleteIfUnused(any());
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("CHANGE_ABOUT_PHOTO");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Fotka " + FIRST + " v sekci O nás nastavena");
    }

    @Test
    @DisplayName("Given a photo, when another photo is set, then the old one is deleted when nothing else uses it")
    void should_delete_the_old_photo_when_replaced_given_a_photo() {
        when(media.findSize(SECOND)).thenReturn(Optional.of(PORTRAIT));
        when(about.find()).thenReturn(Optional.of(shown(FIRST)));

        service().change(ADMIN, command(SECOND));

        verify(media).deleteIfUnused(FIRST);
        assertThat(audited().details()).isEqualTo("Fotka " + SECOND + " v sekci O nás nastavena");
    }

    @Test
    @DisplayName("Given a photo, when the same photo is set with other texts, then it stays and the change is audited as edited")
    void should_keep_the_photo_when_its_texts_change_given_a_photo() {
        when(media.findSize(FIRST)).thenReturn(Optional.of(PORTRAIT));
        when(about.find()).thenReturn(Optional.of(shown(FIRST)));

        service().change(ADMIN, new AboutCommand(Optional.of(FIRST), Optional.of("Jiný popis"), Optional.empty()));

        verify(media, never()).deleteIfUnused(any());
        assertThat(audited().details()).isEqualTo("Fotka " + FIRST + " v sekci O nás upravena");
    }

    @Test
    @DisplayName("Given a photo, when the photo is removed, then the section has none, the photo is deleted when nothing else uses it and the removal is audited")
    void should_remove_and_delete_the_photo_when_removed_given_a_photo() {
        when(about.find()).thenReturn(Optional.of(shown(FIRST)));

        AboutView view = service().change(ADMIN, removal());

        assertThat(view.photo()).isEmpty();
        ArgumentCaptor<AboutSection> saved = ArgumentCaptor.forClass(AboutSection.class);
        verify(about).save(saved.capture());
        assertThat(saved.getValue().photo()).isEmpty();
        verify(media).deleteIfUnused(FIRST);
        AdminActionPerformed action = audited();
        assertThat(action.action()).isEqualTo("REMOVE_ABOUT_PHOTO");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Fotka " + FIRST + " v sekci O nás odebrána");
    }

    @Test
    @DisplayName("Given no photo, when the photo is removed, then nothing is stored, deleted or audited")
    void should_change_nothing_when_removed_given_no_photo() {
        when(about.find()).thenReturn(Optional.of(AboutSection.withoutPhoto(BEFORE)));

        AboutView view = service().change(ADMIN, removal());

        assertThat(view.photo()).isEmpty();
        verify(about, never()).save(any());
        verify(media, never()).deleteIfUnused(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given a photo that was never uploaded, when it is set, then it is refused and nothing changes")
    void should_refuse_the_photo_when_set_given_an_unknown_image() {
        when(media.findSize(SECOND)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().change(ADMIN, command(SECOND))).isInstanceOf(MediaNotFound.class);
        verify(about, never()).save(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    private AdminActionPerformed audited() {
        ArgumentCaptor<AdminActionPerformed> action = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(action.capture());
        assertThat(action.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(action.getValue().performedAt()).isEqualTo(NOW);
        return action.getValue();
    }

    private static AboutSection shown(MediaId image) {
        return AboutSection.withoutPhoto(BEFORE).show(Optional.of(new AboutPhoto(image, Optional.of("Popis"), Optional.of("Popisek"))), BEFORE);
    }

    private static AboutCommand command(MediaId image) {
        return new AboutCommand(Optional.of(image), Optional.of("Popis"), Optional.of("Popisek"));
    }

    private static AboutCommand removal() {
        return new AboutCommand(Optional.empty(), Optional.empty(), Optional.empty());
    }
}
