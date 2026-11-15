package cz.novanadeje.app.content.domain;

public final class PublicListPage {

    public static final int MAX_SIZE = 50;

    private PublicListPage() {
    }

    public static void check(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_SIZE) {
            throw new IllegalArgumentException("The page is 0 or more and the size 1 to " + MAX_SIZE);
        }
    }
}
