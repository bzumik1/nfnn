package cz.novanadeje.app.donors.domain;

import java.util.Arrays;
import java.util.Optional;

public enum RegistrationReturn {

    DONATE("/#prispet");

    public static final String PATHS = "/#prispet";
    public static final int MAX_PATH_LENGTH = 32;

    private final String path;

    RegistrationReturn(String path) {
        this.path = path;
    }

    public static Optional<RegistrationReturn> ofPath(String path) {
        return Arrays.stream(values()).filter(candidate -> candidate.path.equals(path)).findFirst();
    }

    public String path() {
        return path;
    }
}
