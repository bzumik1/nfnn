package cz.novanadeje.app.donations.domain.receipt.proof;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.decoder.Version;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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

    @ParameterizedTest(name = "version {0} at {1} holds {2} bytes")
    @CsvSource({
            "2, M, 1, 3, M",
            "3, M, 16, 4, M",
            "4, M, 36, 5, M",
            "5, M, 58, 6, M",
            "6, M, 80, 7, M",
            "7, M, 95, 8, M",
            "8, M, 125, 9, M",
            "9, M, 153, 10, M",
            "10, M, 185, 11, M",
            "11, M, 223, 12, M",
            "12, M, 259, 13, M",
            "13, M, 302, 14, L",
            "14, L, 427, 15, L",
            "15, L, 489, 16, L",
            "16, L, 554, 17, L",
            "17, L, 611, 18, L",
            "18, L, 684, 19, L",
            "19, L, 758, 20, L",
            "20, L, 823, 21, L",
            "21, L, 893, 22, L",
            "22, L, 966, 23, L",
            "23, L, 1053, 24, L",
            "24, L, 1132, 25, L",
            "25, L, 1233, 26, L",
            "26, L, 1326, 27, L",
            "27, L, 1422, 28, L",
            "28, L, 1484, 29, L",
            "29, L, 1583, 30, L",
            "30, L, 1686, 31, L",
            "31, L, 1793, 32, L",
            "32, L, 1904, 33, L",
            "33, L, 2018, 34, L",
            "34, L, 2137, 35, L",
            "35, L, 2250, 36, L",
            "36, L, 2377, 37, L",
            "37, L, 2507, 38, L",
            "38, L, 2642, 39, L",
            "39, L, 2751, 40, L",
            "40, L, 2893, 0, -"
    })
    @DisplayName("Given the largest proof each version holds by an independent encoder, when its symbol is chosen, then it is that version, and one byte more takes the next one")
    void should_choose_the_independent_encoders_version_when_chosen_given_the_largest_proof_of_each_version(int version, String level, int largestProof,
                                                                                                           int nextVersion, String nextLevel) {
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[largestProof])))
                .contains(new VerificationQrSymbol(version, VerificationQrSymbol.ErrorCorrection.valueOf(level)));
        if (nextVersion == 0) {
            assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[largestProof + 1]))).isEmpty();
        } else {
            assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[largestProof + 1])))
                    .contains(new VerificationQrSymbol(nextVersion, VerificationQrSymbol.ErrorCorrection.valueOf(nextLevel)));
        }
    }
}
