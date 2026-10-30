package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Pattern;

public record SignaturePath(SignaturePathData data, String fill, BigDecimal opacity) {

    private static final Pattern CANONICAL_FILL = Pattern.compile("#[0-9a-f]{6}");
    private static final Pattern HEX_FILL = Pattern.compile("#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})");

    public SignaturePath {
        if (data == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.PATH_DATA);
        }
        if (fill == null || !CANONICAL_FILL.matcher(fill).matches()) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.FILL);
        }
        opacity = SignatureNumbers.canonical(opacity, SignatureVectorProblem.OPACITY);
        if (opacity.signum() < 0 || opacity.compareTo(BigDecimal.ONE) > 0) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.OPACITY);
        }
    }

    public static String parseFill(String raw) {
        String trimmed = raw == null ? "" : raw.strip();
        if (!HEX_FILL.matcher(trimmed).matches()) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.FILL);
        }
        String digits = trimmed.substring(1).toLowerCase(Locale.ROOT);
        if (digits.length() == 3) {
            digits = "" + digits.charAt(0) + digits.charAt(0) + digits.charAt(1) + digits.charAt(1) + digits.charAt(2) + digits.charAt(2);
        }
        return "#" + digits;
    }

    public static BigDecimal parseOpacity(String raw) {
        BigDecimal opacity = SignatureNumbers.parseAll(raw, SignatureVectorProblem.OPACITY);
        if (opacity.signum() < 0 || opacity.compareTo(BigDecimal.ONE) > 0) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.OPACITY);
        }
        return opacity;
    }

    String canonicalJson() {
        return "{\"d\":\"" + data.value() + "\",\"fill\":\"" + fill + "\",\"opacity\":" + SignatureNumbers.format(opacity) + "}";
    }
}
