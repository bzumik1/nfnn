package cz.novanadeje.app.operations.domain.clienterrors;

import java.util.Optional;
import java.util.stream.Stream;

public record ClientErrorReport(ClientErrorKind kind, ClientErrorPlace place, ClientErrorName name, ClientAppVersion appVersion,
                                ClientBrowser browser, Optional<Integer> browserMajor, ClientOperatingSystem os, ClientDisplayMode display,
                                int count) {

    public static final int MAX_COUNT = 100;
    public static final int MAX_BROWSER_MAJOR = 999;

    public ClientErrorReport {
        if (Stream.of(kind, place, name, appVersion, browser, browserMajor, os, display).anyMatch(term -> term == null)) {
            throw new IllegalArgumentException("A browser error report names every one of its terms");
        }
        if (browserMajor.filter(major -> major < 1 || major > MAX_BROWSER_MAJOR).isPresent()) {
            throw new IllegalArgumentException("A browser major version lies between 1 and " + MAX_BROWSER_MAJOR);
        }
        if (count < 1 || count > MAX_COUNT) {
            throw new IllegalArgumentException("A browser error report counts between 1 and " + MAX_COUNT + " occurrences");
        }
    }
}
