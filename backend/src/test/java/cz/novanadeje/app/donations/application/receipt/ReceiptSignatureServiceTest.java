package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.CurrentSignature;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureImage;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReceiptSignatureServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-23T19:30:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final byte[] UPLOAD = {1, 2, 3};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 13};
    private static final SignatureImage IMAGE = new SignatureImage(PNG, 600, 200);

    private final SignatureImageProcessor processor = mock(SignatureImageProcessor.class);
    private final ReceiptSignatureRepository signatures = mock(ReceiptSignatureRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final MutableClock clock = new MutableClock(NOW, ZoneId.of("Europe/Prague"));
    private final ReceiptSignatureService service = new ReceiptSignatureService(processor, signatures, events, clock);

    @Test
    @DisplayName("Given a stored signature, when it is asked for, then the image and the time of its upload come back")
    void should_answer_current_when_asked_given_stored_signature() {
        when(signatures.current()).thenReturn(Optional.of(new CurrentSignature(IMAGE, NOW)));

        assertThat(service.current()).contains(new CurrentSignature(IMAGE, NOW));
    }

    @Test
    @DisplayName("Given an image upload, when an administrator uploads it, then the processed image replaces the signature and the change is audited")
    void should_replace_and_audit_when_uploaded_given_image() {
        when(processor.process(UPLOAD)).thenReturn(IMAGE);

        CurrentSignature uploaded = service.upload(ADMIN, UPLOAD);

        assertThat(uploaded).isEqualTo(new CurrentSignature(IMAGE, NOW));
        verify(signatures).replace(IMAGE, NOW);
        AdminActionPerformed action = publishedAction();
        assertThat(action.adminId()).isEqualTo(ADMIN);
        assertThat(action.action()).isEqualTo("CHANGE_RECEIPT_SIGNATURE");
        assertThat(action.subjectId()).isEmpty();
        assertThat(action.details()).isEqualTo("Signature image for receipts uploaded: 600x200 px, SHA-256 " + IMAGE.digest());
        assertThat(action.performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given an upload that is no usable image, when an administrator uploads it, then it is refused and nothing changes")
    void should_change_nothing_when_uploaded_given_unusable_image() {
        when(processor.process(UPLOAD)).thenThrow(new UnsupportedSignatureImage("it is not an image"));

        assertThatThrownBy(() -> service.upload(ADMIN, UPLOAD)).isInstanceOf(UnsupportedSignatureImage.class);

        verify(signatures, never()).replace(any(), any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a stored signature, when an administrator removes it, then it is gone and the removal is audited")
    void should_remove_and_audit_when_removed_given_stored_signature() {
        when(signatures.remove()).thenReturn(true);

        service.remove(ADMIN);

        AdminActionPerformed action = publishedAction();
        assertThat(action.action()).isEqualTo("REMOVE_RECEIPT_SIGNATURE");
        assertThat(action.details()).isEqualTo("Signature image for receipts removed; new receipts carry the line and the name only");
    }

    @Test
    @DisplayName("Given no stored signature, when an administrator removes it, then nothing is audited")
    void should_audit_nothing_when_removed_given_no_signature() {
        when(signatures.remove()).thenReturn(false);

        service.remove(ADMIN);

        verifyNoInteractions(events);
    }

    private AdminActionPerformed publishedAction() {
        ArgumentCaptor<AdminActionPerformed> published = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(published.capture());
        return published.getValue();
    }
}
