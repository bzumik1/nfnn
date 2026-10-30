package cz.novanadeje.app.regression;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.qrcode.decoder.Decoder;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import com.google.zxing.qrcode.encoder.QRCode;
import cz.novanadeje.app.shared.QrCodes;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

public final class QrSymbols {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final int ECI_MODE = 0b0111;
    private static final int FORMAT_LINE = 8;
    private static final int FORMAT_INFORMATION_MASK = 0x5412;
    private static final int LEVEL_SHIFT = 13;
    private static final int MASK_SHIFT = 10;
    private static final int MASK_BITS = 0b111;
    private static final int FINDER_SPAN = 17;
    private static final int MODULES_PER_VERSION = 4;
    private static final Map<EncodeHintType, Object> PRODUCTION_HINTS = Map.of(EncodeHintType.CHARACTER_SET, StandardCharsets.ISO_8859_1.name());

    private QrSymbols() {
    }

    public static ObjectNode describe(String payload, QrMatrix production, ErrorCorrectionLevel level) throws WriterException {
        QRCode reference = Encoder.encode(payload, level, PRODUCTION_HINTS);
        assertThat(modulesOf(reference.getMatrix())).as("ZXing's encoder reproduces the production matrix of %s", payload).isEqualTo(production.modules());
        assertThat(QrCodes.decode(production)).as("the production matrix scans back").isEqualTo(payload);
        assertThat(production.modules()).as("modules of a %s by %s matrix", production.size(), production.size()).hasSize(production.size() * production.size());
        assertThat(errorCorrectionOf(production)).as("the error correction in the production matrix's format bits").isEqualTo(level);
        assertThat(versionOf(production)).as("the version of the production matrix").isEqualTo(reference.getVersion().getVersionNumber());
        assertThat(maskOf(production)).as("the mask in the production matrix's format bits").isEqualTo(reference.getMaskPattern());
        byte[] dataCodewords = decoded(production).getRawBytes();
        int firstMode = (dataCodewords[0] >> 4) & 0x0F;
        boolean eci = firstMode == ECI_MODE;
        int payloadMode = eci ? dataCodewords[1] & 0x0F : firstMode;
        ObjectNode symbol = NODES.objectNode();
        symbol.put("errorCorrection", level.name());
        symbol.put("version", versionOf(production));
        symbol.put("mode", modeName(payloadMode));
        if (eci) {
            symbol.put("eci", ((dataCodewords[0] & 0x0F) << 4) | ((dataCodewords[1] >> 4) & 0x0F));
        } else {
            symbol.putNull("eci");
        }
        symbol.put("mask", maskOf(production));
        symbol.put("size", production.size());
        ArrayNode rows = symbol.putArray("matrix");
        for (int row = 0; row < production.size(); row++) {
            rows.add(production.modules().substring(row * production.size(), (row + 1) * production.size()));
        }
        return symbol;
    }

    static int maskOf(QrMatrix matrix) {
        return (formatInformation(matrix) >> MASK_SHIFT) & MASK_BITS;
    }

    static int versionOf(QrMatrix matrix) {
        assertThat((matrix.size() - FINDER_SPAN) % MODULES_PER_VERSION).as("a QR side of %s modules", matrix.size()).isZero();
        return (matrix.size() - FINDER_SPAN) / MODULES_PER_VERSION;
    }

    static ErrorCorrectionLevel errorCorrectionOf(QrMatrix matrix) {
        return ErrorCorrectionLevel.forBits(formatInformation(matrix) >> LEVEL_SHIFT);
    }

    private static int formatInformation(QrMatrix matrix) {
        int bits = 0;
        for (int column = 0; column <= 5; column++) {
            bits = bits << 1 | (matrix.isDark(column, FORMAT_LINE) ? 1 : 0);
        }
        bits = bits << 1 | (matrix.isDark(7, FORMAT_LINE) ? 1 : 0);
        bits = bits << 1 | (matrix.isDark(FORMAT_LINE, FORMAT_LINE) ? 1 : 0);
        bits = bits << 1 | (matrix.isDark(FORMAT_LINE, 7) ? 1 : 0);
        for (int row = 5; row >= 0; row--) {
            bits = bits << 1 | (matrix.isDark(FORMAT_LINE, row) ? 1 : 0);
        }
        return bits ^ FORMAT_INFORMATION_MASK;
    }

    private static String modeName(int bits) {
        return switch (bits) {
            case 0b0001 -> "NUMERIC";
            case 0b0010 -> "ALPHANUMERIC";
            case 0b0100 -> "BYTE";
            case 0b1000 -> "KANJI";
            default -> throw new IllegalStateException("Unexpected QR mode indicator " + bits);
        };
    }

    private static DecoderResult decoded(QrMatrix matrix) {
        BitMatrix bits = new BitMatrix(matrix.size());
        for (int row = 0; row < matrix.size(); row++) {
            for (int column = 0; column < matrix.size(); column++) {
                if (matrix.isDark(column, row)) {
                    bits.set(column, row);
                }
            }
        }
        try {
            return new Decoder().decode(bits);
        } catch (Exception unreadable) {
            throw new AssertionError("The matrix does not decode", unreadable);
        }
    }

    private static String modulesOf(ByteMatrix matrix) {
        StringBuilder modules = new StringBuilder();
        for (int row = 0; row < matrix.getHeight(); row++) {
            for (int column = 0; column < matrix.getWidth(); column++) {
                modules.append(matrix.get(column, row) == 1 ? '1' : '0');
            }
        }
        return modules.toString();
    }
}
