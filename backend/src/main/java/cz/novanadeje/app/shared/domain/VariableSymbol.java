package cz.novanadeje.app.shared.domain;

import java.util.random.RandomGenerator;
import java.util.regex.Pattern;

public record VariableSymbol(String value) {

    public static final int MAX_LENGTH = 10;
    public static final String FORMAT = "[0-9]{1,10}";
    private static final Pattern SHAPE = Pattern.compile(FORMAT);

    public VariableSymbol {
        if (value == null) {
            throw new IllegalArgumentException("Variable symbol is required");
        }
        if (!SHAPE.matcher(value).matches()) {
            throw new IllegalArgumentException("Variable symbol must be one to ten digits: " + value);
        }
    }

    public static VariableSymbol random(RandomGenerator random) {
        StringBuilder digits = new StringBuilder(MAX_LENGTH);
        digits.append(random.nextInt(1, 10));
        while (digits.length() < MAX_LENGTH) {
            digits.append(random.nextInt(10));
        }
        return new VariableSymbol(digits.toString());
    }

    @Override
    public String toString() {
        return value;
    }
}
