package cz.novanadeje.app.content.application.media;

import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.AdminActionFactsAgreement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UploadImageServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-14T10:00:00Z");
    private static final UUID ADMIN = UUID.fromString("0199f3e0-0000-7000-8000-00000000a001");
    private static final byte[] UPLOAD = {1, 2, 3};

    @Mock
    private ImageProcessor processor;
    @Mock
    private MediaImageRepository media;
    @Mock
    private ApplicationEventPublisher events;
    @Mock
    private PlatformTransactionManager transactions;

    private UploadImageService service() {
        return new UploadImageService(processor, media, new TransactionTemplate(transactions), events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given a readable image, when an administrator uploads it, then it is stored and the upload is audited with the image as its subject")
    void should_store_and_audit_the_image_when_uploaded() {
        when(processor.process(UPLOAD)).thenReturn(new ProcessedImage(1600, 1000, List.of(new MediaVariant(480, 300, new byte[] {9}))));

        UploadedImage uploaded = service().upload(ADMIN, UPLOAD);

        ArgumentCaptor<MediaImage> stored = ArgumentCaptor.forClass(MediaImage.class);
        ArgumentCaptor<AdminActionPerformed> audited = ArgumentCaptor.forClass(AdminActionPerformed.class);
        InOrder order = inOrder(media, events);
        order.verify(media).save(stored.capture());
        order.verify(events).publishEvent(audited.capture());
        audited.getAllValues().forEach(AdminActionFactsAgreement::assertFactsAgreeWithDetails);
        assertThat(stored.getValue().id()).isEqualTo(uploaded.id());
        assertThat(audited.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(audited.getValue().action()).isEqualTo("UPLOAD_IMAGE");
        assertThat(audited.getValue().subjectId()).contains(uploaded.id().value());
        assertThat(audited.getValue().details()).isEqualTo("Fotka " + uploaded.id() + " nahrána");
        assertThat(audited.getValue().performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a file that is no image, when an administrator uploads it, then it is refused and nothing is stored or audited")
    void should_store_and_audit_nothing_when_uploaded_given_no_image() {
        when(processor.process(UPLOAD)).thenThrow(new UnsupportedImage("it is no image"));

        assertThatThrownBy(() -> service().upload(ADMIN, UPLOAD)).isInstanceOf(UnsupportedImage.class);

        verifyNoInteractions(media, events);
    }
}
