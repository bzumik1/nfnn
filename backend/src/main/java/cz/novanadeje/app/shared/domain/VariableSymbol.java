package cz.novanadeje.app.shared.domain;

import java.util.random.RandomGenerator;

public record VariableSymbol(String value) {

    public static final int MAX_LENGTH = 10;
    public static final String FORMAT = "[0-9]{1,10}";

    public VariableSymbol {
        if (value == null) {
            throw new IllegalArgumentException("Variable symbol is required");
        }
        if (!value.matches(FORMAT)) {
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
