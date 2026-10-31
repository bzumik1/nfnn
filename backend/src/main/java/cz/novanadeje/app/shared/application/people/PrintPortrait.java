package cz.novanadeje.app.shared.application.people;

import java.util.Arrays;

public record PrintPortrait(byte[] jpeg, int side) {

    public static final int SIDE = 600;
    public static final String MEDIA_TYPE = "image/jpeg";

    public PrintPortrait {
        if (jpeg == null || jpeg.length < 3 || (jpeg[0] & 0xff) != 0xff || (jpeg[1] & 0xff) != 0xd8) {
            throw new IllegalArgumentException("A portrait prepared for print is a JPEG");
        }
        if (side != SIDE) {
            throw new IllegalArgumentException("A portrait prepared for print is " + SIDE + " pixels square");
        }
        jpeg = jpeg.clone();
    }

    @Override
    public byte[] jpeg() {
        return jpeg.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof PrintPortrait portrait && portrait.side == side && Arrays.equals(portrait.jpeg, jpeg);
    }

    @Override
    public int hashCode() {
        return 31 * Arrays.hashCode(jpeg) + side;
    }

    @Override
    public String toString() {
        return "PrintPortrait[" + jpeg.length + " bytes, " + side + " px]";
    }
}
