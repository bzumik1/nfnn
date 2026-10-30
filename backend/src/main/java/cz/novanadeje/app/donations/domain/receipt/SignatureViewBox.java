package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;

public record SignatureViewBox(BigDecimal minX, BigDecimal minY, BigDecimal width, BigDecimal height) {

    public SignatureViewBox {
        minX = SignatureNumbers.canonical(minX, SignatureVectorProblem.VIEW_BOX);
        minY = SignatureNumbers.canonical(minY, SignatureVectorProblem.VIEW_BOX);
        width = SignatureNumbers.canonical(width, SignatureVectorProblem.VIEW_BOX);
        height = SignatureNumbers.canonical(height, SignatureVectorProblem.VIEW_BOX);
        if (width.signum() <= 0 || height.signum() <= 0) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.VIEW_BOX);
        }
    }

    public static SignatureViewBox parse(String raw) {
        if (raw == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.VIEW_BOX);
        }
        SignatureScanner scanner = new SignatureScanner(raw, SignatureVectorProblem.VIEW_BOX);
        BigDecimal[] values = new BigDecimal[4];
        scanner.skipWhitespace();
        for (int index = 0; index < values.length; index++) {
            if (index > 0) {
                scanner.skipSeparator();
            }
            if (!scanner.startsNumber()) {
                throw scanner.refused();
            }
            values[index] = scanner.number();
        }
        scanner.skipWhitespace();
        if (!scanner.atEnd()) {
            throw scanner.refused();
        }
        return new SignatureViewBox(values[0], values[1], values[2], values[3]);
    }

    public String canonical() {
        return SignatureNumbers.format(minX) + " " + SignatureNumbers.format(minY) + " " + SignatureNumbers.format(width) + " "
                + SignatureNumbers.format(height);
    }
}
