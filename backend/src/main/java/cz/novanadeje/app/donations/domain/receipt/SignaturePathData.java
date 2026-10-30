package cz.novanadeje.app.donations.domain.receipt;

public final class SignaturePathData {

    private static final String COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

    private final String value;
    private final int segments;

    private SignaturePathData(String value, int segments) {
        this.value = value;
        this.segments = segments;
    }

    public static SignaturePathData parse(String raw) {
        if (raw == null) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.PATH_DATA);
        }
        SignatureScanner scanner = new SignatureScanner(raw, SignatureVectorProblem.PATH_DATA);
        StringBuilder canonical = new StringBuilder();
        int segments = 0;
        scanner.skipWhitespace();
        if (scanner.atEnd() || Character.toUpperCase(scanner.peek()) != 'M') {
            throw scanner.refused();
        }
        while (!scanner.atEnd()) {
            char command = scanner.next();
            if (COMMANDS.indexOf(command) < 0) {
                throw scanner.refused();
            }
            if (!canonical.isEmpty()) {
                canonical.append(' ');
            }
            canonical.append(command);
            int arity = arity(command);
            if (arity == 0) {
                segments = counted(segments + 1);
                scanner.skipWhitespace();
                continue;
            }
            boolean firstNumber = true;
            do {
                for (int index = 0; index < arity; index++) {
                    if (!firstNumber) {
                        canonical.append(' ');
                        if (scanner.skipSeparator() && !scanner.startsNumber()) {
                            throw scanner.refused();
                        }
                    } else {
                        scanner.skipWhitespace();
                    }
                    firstNumber = false;
                    if (isArcFlag(command, index)) {
                        canonical.append(scanner.flag());
                    } else {
                        canonical.append(SignatureNumbers.format(scanner.number()));
                    }
                }
                segments = counted(segments + 1);
                boolean comma = scanner.skipSeparator();
                if (comma && !scanner.startsNumber()) {
                    throw scanner.refused();
                }
            } while (scanner.startsNumber());
        }
        return new SignaturePathData(canonical.toString(), segments);
    }

    public String value() {
        return value;
    }

    public int segments() {
        return segments;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof SignaturePathData data && value.equals(data.value);
    }

    @Override
    public int hashCode() {
        return value.hashCode();
    }

    @Override
    public String toString() {
        return "SignaturePathData[" + segments + " segments]";
    }

    private static int counted(int segments) {
        if (segments > SignatureVector.MAX_SEGMENTS) {
            throw new UnsupportedSignatureVector(SignatureVectorProblem.TOO_COMPLEX);
        }
        return segments;
    }

    private static boolean isArcFlag(char command, int index) {
        return (command == 'A' || command == 'a') && (index == 3 || index == 4);
    }

    private static int arity(char command) {
        return switch (Character.toUpperCase(command)) {
            case 'M', 'L', 'T' -> 2;
            case 'H', 'V' -> 1;
            case 'C' -> 6;
            case 'S', 'Q' -> 4;
            case 'A' -> 7;
            default -> 0;
        };
    }
}
