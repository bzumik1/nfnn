package cz.novanadeje.app.regression;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

final class BaselineHygiene {

    private BaselineHygiene() {
    }

    static Report scan(Path root, Set<String> fixtureAddresses) throws IOException {
        return new Report(0, List.of());
    }

    static List<String> findings(String file, String text, Set<String> fixtureAddresses) {
        return List.of();
    }

    static Set<String> fixtureAddresses(Path sources) throws IOException {
        return Set.of();
    }

    record Report(int filesScanned, List<String> findings) {
    }
}
