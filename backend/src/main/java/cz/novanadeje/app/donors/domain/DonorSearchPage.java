package cz.novanadeje.app.donors.domain;

public final class DonorSearchPage {

    public static final int MAX_LIMIT = 100;

    private DonorSearchPage() {
    }

    public static void check(int page, int limit) {
        if (page < 0 || limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("A donor search page starts at zero and holds 1 to " + MAX_LIMIT + " donors");
        }
    }
}
