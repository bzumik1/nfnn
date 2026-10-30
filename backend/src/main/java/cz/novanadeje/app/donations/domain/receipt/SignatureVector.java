package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;
import java.math.MathContext;
import java.nio.charset.StandardCharsets;
import java.util.List;

public record SignatureVector(SignatureViewBox viewBox, List<SignaturePath> paths) implements SignatureArtwork {

    public static final int MAX_UPLOAD_BYTES = 200 * 1024;
    public static final int MAX_PATHS = 1000;
    public static final int MAX_SEGMENTS = 20_000;

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
    }

    public String canonicalSvg() {
        StringBuilder svg = new StringBuilder("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"").append(viewBox.canonical()).append("\">");
        paths.forEach(path -> svg.append(path.canonicalSvg()));
        return svg.append("</svg>").toString();
    }

    public byte[] canonicalBytes() {
        return canonicalSvg().getBytes(StandardCharsets.UTF_8);
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
