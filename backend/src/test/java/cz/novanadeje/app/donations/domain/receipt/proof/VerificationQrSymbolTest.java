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
    @DisplayName("Given every QR version, when its data capacity at L and H is compared with ZXing's tables, then they agree")
    void should_agree_with_zxing_when_capacity_is_compared_given_every_version() {
        IntStream.rangeClosed(1, VerificationQrSymbol.MAX_VERSION).forEach(number -> {
            Version version = Version.getVersionForNumber(number);
            assertThat(VerificationQrSymbol.dataCodewords(number, VerificationQrSymbol.ErrorCorrection.L)).as("version %d at L", number)
                    .isEqualTo(version.getTotalCodewords() - version.getECBlocksForLevel(ErrorCorrectionLevel.L).getTotalECCodewords());
            assertThat(VerificationQrSymbol.dataCodewords(number, VerificationQrSymbol.ErrorCorrection.H)).as("version %d at H", number)
                    .isEqualTo(version.getTotalCodewords() - version.getECBlocksForLevel(ErrorCorrectionLevel.H).getTotalECCodewords());
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
    @DisplayName("Given proofs around what H holds at version 40, when their symbols are chosen, then up to it they take H, so the receipt can draw its star, and above it L")
    void should_take_h_while_it_holds_and_l_above_when_chosen_given_proofs_around_its_capacity() {
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[1232])))
                .contains(new VerificationQrSymbol(VerificationQrSymbol.MAX_VERSION, VerificationQrSymbol.ErrorCorrection.H));
        assertThat(VerificationQrSymbol.of(ReceiptProofText.of(new byte[1233])))
                .contains(new VerificationQrSymbol(25, VerificationQrSymbol.ErrorCorrection.L));
    }

    @ParameterizedTest(name = "version {0} at {1} holds {2} bytes")
    @CsvSource({
            "4, H, 9, 5, H",
            "5, H, 18, 6, H",
            "6, H, 32, 7, H",
            "7, H, 38, 8, H",
            "8, H, 58, 9, H",
            "9, H, 72, 10, H",
            "10, H, 92, 11, H",
            "11, H, 110, 12, H",
            "12, H, 128, 13, H",
            "13, H, 150, 14, H",
            "14, H, 166, 15, H",
            "15, H, 192, 16, H",
            "16, H, 222, 17, H",
            "17, H, 252, 18, H",
            "18, H, 281, 19, H",
            "19, H, 309, 20, H",
            "20, H, 352, 21, H",
            "21, H, 373, 22, H",
            "22, H, 408, 23, H",
            "23, H, 430, 24, H",
            "24, H, 480, 25, H",
            "25, H, 504, 26, H",
            "26, H, 561, 27, H",
            "27, H, 592, 28, H",
            "28, H, 625, 29, H",
            "29, H, 664, 30, H",
            "30, H, 708, 31, H",
            "31, H, 755, 32, H",
            "32, H, 807, 33, H",
            "33, H, 862, 34, H",
            "34, H, 921, 35, H",
            "35, H, 946, 36, H",
            "36, H, 1013, 37, H",
            "37, H, 1054, 38, H",
            "38, H, 1100, 39, H",
            "39, H, 1179, 40, H",
            "40, H, 1232, 25, L",
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
