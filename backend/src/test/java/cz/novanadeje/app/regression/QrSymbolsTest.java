package cz.novanadeje.app.regression;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class QrSymbolsTest {

    @ParameterizedTest
    @CsvSource({"0, 1, L", "1, 2, M", "2, 3, Q", "3, 4, H", "4, 5, L", "5, 7, M", "6, 10, Q", "7, 12, H"})
    @DisplayName("Given a matrix encoded with a chosen mask, version and error correction, when its symbol is read from its modules, then it gives that mask, version and error correction")
    void should_give_the_chosen_mask_version_and_error_correction_when_the_symbol_is_read_from_its_modules_given_a_matrix_encoded_with_them(
            int mask, int version, String level) throws WriterException {
        QrMatrix matrix = matrixOf(Encoder.encode("SHARED CASES", ErrorCorrectionLevel.valueOf(level),
                Map.of(EncodeHintType.QR_MASK_PATTERN, mask, EncodeHintType.QR_VERSION, version)).getMatrix());

        assertThat(QrSymbols.maskOf(matrix)).isEqualTo(mask);
        assertThat(QrSymbols.versionOf(matrix)).isEqualTo(version);
        assertThat(QrSymbols.errorCorrectionOf(matrix)).isEqualTo(ErrorCorrectionLevel.valueOf(level));
    }

    private static QrMatrix matrixOf(ByteMatrix matrix) {
        StringBuilder modules = new StringBuilder();
        for (int row = 0; row < matrix.getHeight(); row++) {
            for (int column = 0; column < matrix.getWidth(); column++) {
                modules.append(matrix.get(column, row) == 1 ? '1' : '0');
            }
        }
        return new QrMatrix(matrix.getWidth(), modules.toString());
    }
}
