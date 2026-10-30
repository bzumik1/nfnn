package cz.novanadeje.app.donations.domain.receipt.proof;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.decoder.Version;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class VerificationQrSymbolTest {

    @Test
    @DisplayName("Given every QR version, when its data capacity at L and M is compared with ZXing's tables, then they agree")
    void should_agree_with_zxing_when_capacity_is_compared_given_every_version() {
        IntStream.rangeClosed(1, VerificationQrSymbol.MAX_VERSION).forEach(number -> {
            Version version = Version.getVersionForNumber(number);
            assertThat(VerificationQrSymbol.dataCodewords(number, VerificationQrSymbol.ErrorCorrection.L)).as("version %d at L", number)
                    .isEqualTo(version.getTotalCodewords() - version.getECBlocksForLevel(ErrorCorrectionLevel.L).getTotalECCodewords());
            assertThat(VerificationQrSymbol.dataCodewords(number, VerificationQrSymbol.ErrorCorrection.M)).as("version %d at M", number)
                    .isEqualTo(version.getTotalCodewords() - version.getECBlocksForLevel(ErrorCorrectionLevel.M).getTotalECCodewords());
        });
    }

    @Test
    @DisplayName("Given a proof of the largest size, when its symbol is chosen, then it fits version 40 at L, and one byte more fits no symbol")
    void should_fit_version_40_at_l_and_refuse_one_byte_more_when_chosen_given_largest_proof() {
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[VerificationQrSymbol.MAX_PROOF_BYTES])))
                .contains(new VerificationQrSymbol(VerificationQrSymbol.MAX_VERSION, VerificationQrSymbol.ErrorCorrection.L));
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[VerificationQrSymbol.MAX_PROOF_BYTES + 1]))).isEmpty();
    }

    @Test
    @DisplayName("Given proofs around the last medium version, when their symbols are chosen, then up to version 13 they keep M and above it switch to L")
    void should_switch_to_low_above_version_13_when_chosen_given_proofs_around_its_capacity() {
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[302])))
                .contains(new VerificationQrSymbol(VerificationQrSymbol.LAST_VERSION_AT_MEDIUM, VerificationQrSymbol.ErrorCorrection.M));
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[303])))
                .contains(new VerificationQrSymbol(VerificationQrSymbol.LAST_VERSION_AT_MEDIUM + 1, VerificationQrSymbol.ErrorCorrection.L));
    }
}
