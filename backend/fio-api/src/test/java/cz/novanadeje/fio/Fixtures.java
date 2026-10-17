package cz.novanadeje.fio;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

final class Fixtures {

    static final String PERIODS_STATEMENT = "periods-statement.json";
    static final String DOCUMENTATION_EXAMPLE_WITH_EPOCH_DATES = "documentation-example-epoch-dates.json";

    private Fixtures() {
    }

    static String read(String name) {
        try (InputStream stream = Fixtures.class.getResourceAsStream(name)) {
            if (stream == null) {
                throw new IllegalArgumentException("No fixture " + name);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
