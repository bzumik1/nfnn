package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;
import java.math.MathContext;
import java.nio.charset.StandardCharsets;
import java.util.List;

public record SignatureVector(SignatureViewBox viewBox, List<SignaturePath> paths) implements SignatureArtwork {

    public static final int MAX_UPLOAD_BYTES = 200 * 1024;
    public static final int MAX_PATHS = 1000;
    public static final int MAX_SEGMENTS = 20_000;
    public static final int MAX_CANONICAL_BYTES = 256 * 1024;

    public SignatureVector {
        if (viewBox == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.VIEW_BOX);
        }
        if (paths == null || paths.isEmpty()) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.NO_PATHS);
        }
        paths = List.copyOf(paths);
        if (paths.size() > MAX_PATHS || paths.stream().mapToLong(path -> path.data().segments()).sum() > MAX_SEGMENTS) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_COMPLEX);
        }
        if (canonicalJson(viewBox, paths).length() > MAX_CANONICAL_BYTES) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_COMPLEX);
        }
    }

    public String canonicalJson() {
        return canonicalJson(viewBox, paths);
    }

    private static String canonicalJson(SignatureViewBox viewBox, List<SignaturePath> paths) {
        StringBuilder json = new StringBuilder("{\"viewBox\":[").append(viewBox.canonical().replace(' ', ',')).append("],\"paths\":[");
        for (int index = 0; index < paths.size(); index++) {
            json.append(index == 0 ? "" : ",").append(paths.get(index).canonicalJson());
        }
        return json.append("]}").toString();
    }

    public byte[] canonicalBytes() {
        return canonicalJson().getBytes(StandardCharsets.UTF_8);
    }

    public int segments() {
        return paths.stream().mapToInt(path -> path.data().segments()).sum();
    }

    @Override
    public ContentDigest digest() {
        return ContentDigest.of(canonicalBytes());
    }

    @Override
    public int width() {
        return fitted(viewBox.width());
    }

    @Override
    public int height() {
        return fitted(viewBox.height());
    }

    @Override
    public String toString() {
        return "SignatureVector[" + paths.size() + " paths, " + digest() + "]";
    }

    private int fitted(BigDecimal side) {
        BigDecimal scale = BigDecimal.valueOf(SignatureImage.MAX_WIDTH).divide(viewBox.width(), MathContext.DECIMAL64)
                .min(BigDecimal.valueOf(SignatureImage.MAX_HEIGHT).divide(viewBox.height(), MathContext.DECIMAL64));
        long size = Math.round(side.multiply(scale).doubleValue());
        return (int) Math.max(1, size);
    }
}
