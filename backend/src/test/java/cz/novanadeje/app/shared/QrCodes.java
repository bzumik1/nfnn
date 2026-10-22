package cz.novanadeje.app.shared;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.NotFoundException;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Arrays;

public final class QrCodes {

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    private QrCodes() {
    }

    public static boolean isPng(byte[] image) {
        return image.length > PNG_SIGNATURE.length
                && Arrays.equals(Arrays.copyOf(image, PNG_SIGNATURE.length), PNG_SIGNATURE);
    }

    public static String decode(byte[] png) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(png));
            BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
            return new QRCodeReader().decode(bitmap).getText();
        } catch (IOException | NotFoundException | ChecksumException | FormatException unreadable) {
            throw new AssertionError("Image is not a readable QR code", unreadable);
        }
    }
}
