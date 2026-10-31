package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class SignatureNumbers {

    static final int SCALE = 3;
    static final int PRECISE_SCALE = 12;
    static final BigDecimal LIMIT = BigDecimal.valueOf(1_000_000);

    private SignatureNumbers() {
    }

    static BigDecimal canonical(BigDecimal value, SignatureVectorProblem problem) {
        if (value == null || value.abs().compareTo(LIMIT) > 0) {
            throw new UnsupportedSignatureVector(problem);
        }
        BigDecimal rounded = value.setScale(SCALE, RoundingMode.HALF_EVEN).stripTrailingZeros();
        if (rounded.signum() == 0) {
            return BigDecimal.ZERO;
        }
        return rounded.scale() < 0 ? rounded.setScale(0) : rounded;
    }

    static BigDecimal precise(BigDecimal value, SignatureVectorProblem problem) {
        if (value == null || value.abs().compareTo(LIMIT) > 0) {
            throw new UnsupportedSignatureVector(problem);
        }
        return value.setScale(PRECISE_SCALE, RoundingMode.HALF_EVEN);
    }

    static String format(BigDecimal value) {
        return value.toPlainString();
    }

    static BigDecimal parseAll(String raw, SignatureVectorProblem problem) {
        if (raw == null) {
            throw new UnsupportedSignatureVector(problem);
        }
        SignatureScanner scanner = new SignatureScanner(raw, problem);
        scanner.skipWhitespace();
        BigDecimal value = scanner.number();
        scanner.skipWhitespace();
        if (!scanner.atEnd()) {
            throw new UnsupportedSignatureVector(problem);
        }
        return value;
    }
}
