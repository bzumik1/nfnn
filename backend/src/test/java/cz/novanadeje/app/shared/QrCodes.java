package cz.novanadeje.app.shared;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.ResultMetadataType;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import tools.jackson.databind.JsonNode;

import java.awt.image.BufferedImage;

public final class QrCodes {

    private static final int QUIET_ZONE_MODULES = 4;
    private static final int PIXELS_PER_MODULE = 4;
    private static final int LIGHT = 0xFFFFFF;
    private static final int DARK = 0x000000;

    private QrCodes() {
    }

    public static String decode(QrMatrix matrix) {
        return read(matrix).getText();
    }

    public static String decode(JsonNode qrCode) {
        return decode(new QrMatrix(qrCode.get("size").asInt(), qrCode.get("modules").asString()));
    }

    public static String errorCorrectionLevel(QrMatrix matrix) {
        return String.valueOf(read(matrix).getResultMetadata().get(ResultMetadataType.ERROR_CORRECTION_LEVEL));
    }

    private static Result read(QrMatrix matrix) {
        try {
            BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image(matrix))));
            return new QRCodeReader().decode(bitmap);
        } catch (NotFoundException | ChecksumException | FormatException unreadable) {
            throw new AssertionError("Modules are not a readable QR code", unreadable);
        }
    }

    private static BufferedImage image(QrMatrix matrix) {
        int side = (matrix.size() + 2 * QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;
        BufferedImage image = new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB);
        for (int py = 0; py < side; py++) {
            for (int px = 0; px < side; px++) {
                int x = px / PIXELS_PER_MODULE - QUIET_ZONE_MODULES;
                int y = py / PIXELS_PER_MODULE - QUIET_ZONE_MODULES;
                boolean inside = x >= 0 && y >= 0 && x < matrix.size() && y < matrix.size();
                image.setRGB(px, py, inside && matrix.isDark(x, y) ? DARK : LIGHT);
            }
        }
        return image;
    }
}
