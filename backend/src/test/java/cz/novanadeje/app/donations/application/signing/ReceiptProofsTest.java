package cz.novanadeje.app.donations.application.signing;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedDonor;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedGift;
import cz.novanadeje.app.donations.domain.receipt.proof.SignedReceipt;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningPaused;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.shared.domain.DonorType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReceiptProofsTest {

    private static final FoundationIdentity FOUNDATION = Receipts.FOUNDATION;
    private static final SignedReceipt RECEIPT = new SignedReceipt(ReceiptKind.SINGLE, new ReceiptNumber("2026-000001"), LocalDate.parse("2026-11-05"),
            Optional.empty(), Optional.empty(), new SignedDonor(DonorType.PERSON, "Jana Vzorová", "Lipová 12", "Liberec", "460 01", Optional.empty()),
            List.of(new SignedGift(LocalDate.parse("2026-11-03"), 250000)), 250000);

    private final ReceiptSigner signer = mock(ReceiptSigner.class);

    @Test
    @DisplayName("Given the server's own key withdrawn, when a receipt is to be proved, then it is refused as paused, nothing is signed and an ERROR names the receipt and the key")
    void should_refuse_and_sign_nothing_when_proving_given_own_key_withdrawn() {
        when(signer.keyId()).thenReturn(new ReceiptSigningKeyId("21fe31df"));
        ReceiptProofs proofs = new ReceiptProofs(signer, FOUNDATION, () -> true);
        ListAppender<ILoggingEvent> lines = new ListAppender<>();
        Logger logger = (Logger) LoggerFactory.getLogger(ReceiptProofs.class);
        lines.start();
        logger.addAppender(lines);
        try {
            assertThatThrownBy(() -> proofs.prove(RECEIPT)).isInstanceOf(ReceiptSigningPaused.class)
                    .hasFieldOrPropertyWithValue("code", "donations/receipt-signing-paused");
        } finally {
            logger.detachAppender(lines);
        }

        verify(signer, never()).sign(any());
        assertThat(lines.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage())
                    .isEqualTo("Receipt 2026-000001 is not signed: the receipt signing key 21fe31df of this server is withdrawn and no new seed has replaced it");
        });
    }
}
