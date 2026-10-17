package cz.novanadeje.app.shared.domain;

public record VariableSymbol(String value) {

    public static final String FORMAT = "[0-9]{1,10}";

    public VariableSymbol {
        if (value == null) {
            throw new IllegalArgumentException("Variable symbol is required");
        }
        if (!value.matches(FORMAT)) {
            throw new IllegalArgumentException("Variable symbol must be one to ten digits: " + value);
        }
    }

    @Override
    public String toString() {
        return value;
    }
}
