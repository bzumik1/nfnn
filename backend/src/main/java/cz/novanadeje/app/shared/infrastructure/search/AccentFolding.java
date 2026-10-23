package cz.novanadeje.app.shared.infrastructure.search;

import java.util.Locale;

public final class AccentFolding {

    public static final String ACCENTED = "áäčďéěëíĺľňóôöŕřšťúůüýžÁÄČĎÉĚËÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ";
    public static final String PLAIN = "aacdeeeillnooorrstuuuyzaacdeeeillnooorrstuuuyz";

    private AccentFolding() {
    }

    public static String fold(String text) {
        StringBuilder folded = new StringBuilder(text.length());
        for (char letter : text.toCharArray()) {
            int accented = ACCENTED.indexOf(letter);
            folded.append(accented >= 0 ? PLAIN.charAt(accented) : letter);
        }
        return folded.toString().toLowerCase(Locale.ROOT);
    }
}
