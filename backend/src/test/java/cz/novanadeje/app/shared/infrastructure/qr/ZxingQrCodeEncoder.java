package cz.novanadeje.app.shared.infrastructure.qr;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;

import java.nio.charset.StandardCharsets;
import java.util.Map;

class ZxingQrCodeEncoder implements QrCodeEncoder {

    private static final Map<EncodeHintType, Object> HINTS = Map.of(EncodeHintType.CHARACTER_SET, StandardCharsets.ISO_8859_1.name());

    @Override
    public QrMatrix encode(String payload, QrErrorCorrection errorCorrection) {
        try {
            ByteMatrix matrix = Encoder.encode(payload, levelOf(errorCorrection), HINTS).getMatrix();
            int size = matrix.getWidth();
            StringBuilder modules = new StringBuilder(size * size);
            for (int row = 0; row < size; row++) {
                for (int column = 0; column < size; column++) {
                    modules.append(matrix.get(column, row) == 1 ? '1' : '0');
                }
            }
            return new QrMatrix(size, modules.toString());
        } catch (WriterException tooLong) {
            throw new IllegalArgumentException("Payload does not fit a QR code", tooLong);
        }
    }

    private static ErrorCorrectionLevel levelOf(QrErrorCorrection errorCorrection) {
        return switch (errorCorrection) {
            case MEDIUM -> ErrorCorrectionLevel.M;
            case HIGH -> ErrorCorrectionLevel.H;
        };
    }
}
