package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;

final class SignatureScanner {

    private static final int MAX_EXPONENT_DIGITS = 3;
    private static final int MAX_NUMBER_LENGTH = 40;

    private final String text;
    private final SignatureVectorProblem problem;
    private int at;

    SignatureScanner(String text, SignatureVectorProblem problem) {
        this.text = text;
        this.problem = problem;
    }

    boolean atEnd() {
        return at >= text.length();
    }

    char peek() {
        return text.charAt(at);
    }

    char next() {
        if (atEnd()) {
            throw refused();
        }
        return text.charAt(at++);
    }

    void skipWhitespace() {
        while (!atEnd() && isWhitespace(peek())) {
            at++;
        }
    }

    boolean skipSeparator() {
        skipWhitespace();
        if (!atEnd() && peek() == ',') {
            at++;
            skipWhitespace();
            return true;
        }
        return false;
    }

    boolean startsNumber() {
        if (atEnd()) {
            return false;
        }
        char c = peek();
        return isDigit(c) || c == '.' || c == '+' || c == '-';
    }

    BigDecimal number() {
        int start = at;
        if (!atEnd() && (peek() == '+' || peek() == '-')) {
            at++;
        }
        int integerDigits = digits();
        int fractionDigits = 0;
        if (!atEnd() && peek() == '.') {
            at++;
            fractionDigits = digits();
        }
        if (integerDigits == 0 && fractionDigits == 0) {
            throw refused();
        }
        int mantissaEnd = at;
        String exponent = "";
        if (!atEnd() && (peek() == 'e' || peek() == 'E')) {
            int exponentStart = at;
            at++;
            if (!atEnd() && (peek() == '+' || peek() == '-')) {
                at++;
            }
            int exponentDigits = digits();
            if (exponentDigits == 0) {
                at = exponentStart;
            } else if (exponentDigits > MAX_EXPONENT_DIGITS) {
                throw refused();
            } else {
                exponent = text.substring(exponentStart, at);
            }
        }
        String mantissa = text.substring(start, mantissaEnd);
        if (mantissa.length() > MAX_NUMBER_LENGTH) {
            throw refused();
        }
        String plain = mantissa.startsWith("+") ? mantissa.substring(1) : mantissa;
        if (plain.endsWith(".")) {
            plain = plain.substring(0, plain.length() - 1);
        }
        if (plain.startsWith(".") || plain.startsWith("-.")) {
            plain = plain.replace(".", "0.");
        }
        return SignatureNumbers.canonical(new BigDecimal(plain + exponent), problem);
    }

    int flag() {
        char c = next();
        if (c != '0' && c != '1') {
            throw refused();
        }
        return c - '0';
    }

    UnsupportedSignatureVector refused() {
        return new UnsupportedSignatureVector(problem);
    }

    private int digits() {
        int count = 0;
        while (!atEnd() && isDigit(peek())) {
            at++;
            count++;
        }
        return count;
    }

    private static boolean isDigit(char c) {
        return c >= '0' && c <= '9';
    }

    private static boolean isWhitespace(char c) {
        return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f';
    }
}
