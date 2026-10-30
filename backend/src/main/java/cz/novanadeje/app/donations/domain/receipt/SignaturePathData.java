package cz.novanadeje.app.donations.domain.receipt;

import java.math.BigDecimal;

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
        scanner.skipWhitespace();
        if (scanner.atEnd() || Character.toUpperCase(scanner.peek()) != 'M') {
            throw scanner.refused();
        }
        Pen pen = new Pen();
        while (!scanner.atEnd()) {
            char command = scanner.next();
            if (COMMANDS.indexOf(command) < 0) {
                throw scanner.refused();
            }
            pen.command(command);
            int arity = arity(command);
            if (arity == 0) {
                pen.close();
                scanner.skipWhitespace();
                continue;
            }
            boolean firstNumber = true;
            do {
                BigDecimal[] values = new BigDecimal[arity];
                for (int index = 0; index < arity; index++) {
                    if (!firstNumber && scanner.skipSeparator() && !scanner.startsNumber()) {
                        throw scanner.refused();
                    }
                    if (firstNumber) {
                        scanner.skipWhitespace();
                    }
                    firstNumber = false;
                    values[index] = isArcFlag(command, index) ? BigDecimal.valueOf(scanner.flag()) : scanner.preciseNumber();
                }
                pen.segment(command, values);
                boolean comma = scanner.skipSeparator();
                if (comma && !scanner.startsNumber()) {
                    throw scanner.refused();
                }
            } while (scanner.startsNumber());
        }
        return new SignaturePathData(pen.canonical.toString(), pen.segments);
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

    private static final class Pen {

        private final StringBuilder canonical = new StringBuilder();
        private int segments;
        private BigDecimal x = BigDecimal.ZERO;
        private BigDecimal y = BigDecimal.ZERO;
        private BigDecimal startX = BigDecimal.ZERO;
        private BigDecimal startY = BigDecimal.ZERO;
        private int segmentsInCommand;

        void command(char command) {
            if (!canonical.isEmpty()) {
                canonical.append(' ');
            }
            canonical.append(Character.toUpperCase(command));
            segmentsInCommand = 0;
        }

        void close() {
            segments = counted(segments + 1);
            x = startX;
            y = startY;
        }

        void segment(char command, BigDecimal[] values) {
            boolean relative = Character.isLowerCase(command);
            char absolute = Character.toUpperCase(command);
            switch (absolute) {
                case 'H' -> x = values[0] = relative ? x.add(values[0]) : values[0];
                case 'V' -> y = values[0] = relative ? y.add(values[0]) : values[0];
                default -> {
                    int firstCoordinate = absolute == 'A' ? 5 : 0;
                    for (int index = firstCoordinate; index < values.length; index += 2) {
                        if (relative) {
                            values[index] = x.add(values[index]);
                            values[index + 1] = y.add(values[index + 1]);
                        }
                    }
                    x = values[values.length - 2];
                    y = values[values.length - 1];
                }
            }
            if (absolute == 'M' && segmentsInCommand == 0) {
                startX = x;
                startY = y;
            }
            for (int index = 0; index < values.length; index++) {
                if (index > 0 || segmentsInCommand > 0) {
                    canonical.append(' ');
                }
                canonical.append(isArcFlag(command, index) ? values[index].toPlainString()
                        : SignatureNumbers.format(SignatureNumbers.canonical(values[index], SignatureVectorProblem.PATH_DATA)));
            }
            segments = counted(segments + 1);
            segmentsInCommand++;
        }
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
