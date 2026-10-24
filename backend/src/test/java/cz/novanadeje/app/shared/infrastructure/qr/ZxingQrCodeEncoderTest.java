package cz.novanadeje.app.shared.infrastructure.qr;

import cz.novanadeje.app.shared.QrCodes;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ZxingQrCodeEncoderTest {

    private static final String SPAYD = "SPD*1.0*ACC:CZ6508000000192000145399*AM:500.00*CC:CZK*X-VS:1234567890*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE";

    private final ZxingQrCodeEncoder encoder = new ZxingQrCodeEncoder();

    @Test
    @DisplayName("Given a payload, when it is encoded, then the modules scan back to that payload")
    void should_produce_modules_that_scan_back_to_the_payload_when_encoded() {
        QrMatrix matrix = encoder.encode(SPAYD, QrErrorCorrection.HIGH);

        assertThat(QrCodes.decode(matrix)).isEqualTo(SPAYD);
    }

    @Test
    @DisplayName("Given high error correction, when a payload is encoded, then it uses level H, so a logo may cover the centre")
    void should_use_level_h_when_encoded_with_high_error_correction_so_a_logo_may_cover_the_centre() {
        QrMatrix matrix = encoder.encode(SPAYD, QrErrorCorrection.HIGH);

        assertThat(QrCodes.errorCorrectionLevel(matrix)).isEqualTo("H");
    }

    @Test
    @DisplayName("Given medium error correction, when a payload is encoded, then it uses level M and fewer modules")
    void should_use_level_m_and_fewer_modules_when_encoded_with_medium_error_correction() {
        QrMatrix medium = encoder.encode(SPAYD, QrErrorCorrection.MEDIUM);

        assertThat(QrCodes.errorCorrectionLevel(medium)).isEqualTo("M");
        assertThat(QrCodes.decode(medium)).isEqualTo(SPAYD);
        assertThat(medium.size()).isLessThan(encoder.encode(SPAYD, QrErrorCorrection.HIGH).size());
    }

    @Test
    @DisplayName("Given the same payload, when it is encoded twice, then both times give the same modules")
    void should_produce_the_same_modules_when_encoded_twice_given_the_same_payload() {
        assertThat(encoder.encode(SPAYD, QrErrorCorrection.HIGH)).isEqualTo(encoder.encode(SPAYD, QrErrorCorrection.HIGH));
    }
}
