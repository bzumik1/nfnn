package cz.novanadeje.app.content.domain.media;

public record FocalPoint(int x, int y) {

    public static final int MIN_PERCENT = 0;
    public static final int MAX_PERCENT = 100;

    public FocalPoint {
        if (outside(x) || outside(y)) {
            throw new IllegalArgumentException("A focal point lies on the photo: 0 to 100 % from its left and top edge");
        }
    }

    private static boolean outside(int percent) {
        return percent < MIN_PERCENT || percent > MAX_PERCENT;
    }
}
