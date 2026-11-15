package cz.novanadeje.app.donations.domain.receipt;

import java.util.Arrays;
import java.util.Optional;

public enum ReceiptImageMediaType {

    PNG("image/png"),
    JPEG("image/jpeg"),
    VECTOR_JSON("application/json");

    private final String value;

    ReceiptImageMediaType(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Optional<ReceiptImageMediaType> fromValue(String value) {
        return Arrays.stream(values()).filter(type -> type.value.equals(value)).findFirst();
    }
}
