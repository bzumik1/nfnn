package cz.novanadeje.app.donations.infrastructure.qr;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.donations.application.QrCodeRenderer;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;

@Component
class ZxingQrCodeRenderer implements QrCodeRenderer {

    private static final int QUIET_ZONE_MODULES = 2;
    private static final Map<EncodeHintType, Object> HINTS = Map.of(
            EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN, QUIET_ZONE_MODULES
    );

    @Override
    public byte[] renderPng(String payload, int sizePx) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, sizePx, sizePx, HINTS);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", png);
            return png.toByteArray();
        } catch (WriterException tooLong) {
            throw new IllegalArgumentException("Payload does not fit a QR code", tooLong);
        } catch (IOException unwritable) {
            throw new UncheckedIOException(unwritable);
        }
    }
}
