package cz.novanadeje.app.donors.domain;

public final class AdministratorActivityPage {

    public static final int MAX_SIZE = 200;

    private AdministratorActivityPage() {
    }

    public static void check(int size) {
        if (size < 1 || size > MAX_SIZE) {
            throw new IllegalArgumentException("The page size is between 1 and " + MAX_SIZE);
        }
    }
}
