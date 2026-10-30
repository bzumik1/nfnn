package cz.novanadeje.app.donations.domain.receipt;

import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SignatureVectorTest {

    static final SignatureVector SIGNATURE = new SignatureVector(SignatureViewBox.parse("0 0 300 100"), List.of(
            new SignaturePath(SignaturePathData.parse("M10 80 C40 10 65 10 95 80 S150 150 180 80 Z"), "#1d2a5c", new BigDecimal("0.9")),
            new SignaturePath(SignaturePathData.parse("m250 50 l40 40 z"), "#c0392b", BigDecimal.ONE)));

    @Test
    @DisplayName("Given a vector signature, when its canonical form is written, then it is one JSON object with only the view box and the paths, in a fixed order and without whitespace")
    void should_write_only_view_box_and_paths_as_json_when_written_given_vector() {
        assertThat(SIGNATURE.canonicalJson()).isEqualTo("{\"viewBox\":[0,0,300,100],\"paths\":["
                + "{\"d\":\"M10 80 C40 10 65 10 95 80 S150 150 180 80 Z\",\"fill\":\"#1d2a5c\",\"opacity\":0.9},"
                + "{\"d\":\"M250 50 L290 90 Z\",\"fill\":\"#c0392b\",\"opacity\":1}"
                + "]}");
        assertThat(SIGNATURE.canonicalBytes()).isEqualTo(SIGNATURE.canonicalJson().getBytes(StandardCharsets.UTF_8));
        assertThat(SIGNATURE.digest()).isEqualTo(ContentDigest.of(SIGNATURE.canonicalJson().getBytes(StandardCharsets.UTF_8)));
        assertThat(SIGNATURE.segments()).isEqualTo(7);
    }

    @Test
    @DisplayName("Given a view box and an opacity with negative and fractional numbers, when the canonical JSON is written, then every number is a plain JSON number")
    void should_write_plain_json_numbers_when_written_given_negative_and_fractional_values() {
        SignatureVector vector = new SignatureVector(SignatureViewBox.parse("-1.5 -0.25 1e3 0.5"),
                List.of(new SignaturePath(SignaturePathData.parse("M-1 -0.25 L0.5 0.125"), "#000000", new BigDecimal("0.05"))));

        assertThat(vector.canonicalJson()).isEqualTo("{\"viewBox\":[-1.5,-0.25,1000,0.5],\"paths\":["
                + "{\"d\":\"M-1 -0.25 L0.5 0.125\",\"fill\":\"#000000\",\"opacity\":0.05}]}");
    }

    @Test
    @DisplayName("Given two vectors of the same values spelled differently, when they are compared, then they are equal and share one digest")
    void should_share_digest_when_compared_given_same_values_spelled_differently() {
        SignatureVector respelled = new SignatureVector(SignatureViewBox.parse("0,0,300.000,1e2"), List.of(
                new SignaturePath(SignaturePathData.parse("M 10,80 C 40,10 65,10 95,80 S 150,150 180,80 Z"), SignaturePath.parseFill("#1D2A5C"),
                        new BigDecimal("0.90")),
                new SignaturePath(SignaturePathData.parse("M250,50L290,90z"), SignaturePath.parseFill("#C0392B"), new BigDecimal("1.000"))));

        assertThat(respelled).isEqualTo(SIGNATURE).hasSameHashCodeAs(SIGNATURE);
        assertThat(respelled.digest()).isEqualTo(SIGNATURE.digest());
        assertThat(respelled.canonicalJson()).isEqualTo(SIGNATURE.canonicalJson());
    }

    @ParameterizedTest(name = "{0} -> {1}x{2}")
    @CsvSource({"0 0 300 100, 1200, 400", "0 0 1035.3 306.6, 1200, 355", "-5 -5 10 50, 120, 600", "0 0 0.5 0.1, 1200, 240"})
    @DisplayName("Given a view box, when the vector's size is asked for, then it fits the box of a signature image keeping its proportions")
    void should_fit_signature_box_when_sized_given_view_box(String viewBox, int width, int height) {
        SignatureVector vector = new SignatureVector(SignatureViewBox.parse(viewBox), SIGNATURE.paths());

        assertThat(vector.width()).isEqualTo(width);
        assertThat(vector.height()).isEqualTo(height);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"0 0 300 100, 0 0 300 100", "'0,0,300,100', 0 0 300 100", "' -1.5 2e0  3E2,1e2 ', -1.5 2 300 100"})
    @DisplayName("Given a valid view box, when it is parsed, then it keeps four canonical numbers")
    void should_keep_canonical_numbers_when_parsed_given_valid_view_box(String raw, String canonical) {
        assertThat(SignatureViewBox.parse(raw).canonical()).isEqualTo(canonical);
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"", "0 0 300", "0 0 0 100", "0 0 300 -1", "a b c d", "0 0 300 100 5", "0 0 3000000 100", "0,,0,300,100"})
    @DisplayName("Given an invalid view box, when it is parsed, then it is refused as a view box")
    void should_refuse_when_parsed_given_invalid_view_box(String raw) {
        assertRefused(() -> SignatureViewBox.parse(raw), SignatureVectorProblem.VIEW_BOX);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"#1D2A5C, #1d2a5c", "#abc, #aabbcc", "' #000000 ', #000000"})
    @DisplayName("Given a hex colour, when a fill is parsed, then it is six lowercase hex digits")
    void should_write_six_lowercase_digits_when_parsed_given_hex_fill(String raw, String fill) {
        assertThat(SignaturePath.parseFill(raw)).isEqualTo(fill);
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"", "url(#gradient)", "red", "#12345", "#1234567", "none", "currentColor", "#ggg", "rgb(0,0,0)"})
    @DisplayName("Given a fill that is not a hex colour, when it is parsed, then it is refused as a fill")
    void should_refuse_when_parsed_given_fill_not_hex(String raw) {
        assertRefused(() -> SignaturePath.parseFill(raw), SignatureVectorProblem.FILL);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"0.9, 0.9", ".5, 0.5", "1, 1", "0, 0", "0.4444, 0.444", "1e-1, 0.1"})
    @DisplayName("Given an opacity between 0 and 1, when it is parsed, then it is a canonical number")
    void should_keep_canonical_number_when_parsed_given_opacity_in_range(String raw, String opacity) {
        assertThat(SignaturePath.parseOpacity(raw).toPlainString()).isEqualTo(opacity);
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"", "1.5", "-0.1", "50%", "abc", "0.5 0.5", "inherit"})
    @DisplayName("Given an opacity outside 0 to 1 or no number, when it is parsed, then it is refused as an opacity")
    void should_refuse_when_parsed_given_invalid_opacity(String raw) {
        assertRefused(() -> SignaturePath.parseOpacity(raw), SignatureVectorProblem.OPACITY);
    }

    @Test
    @DisplayName("Given an opacity with more than three decimals, when a path is made, then it is rounded to three")
    void should_round_opacity_when_made_given_more_than_three_decimals() {
        SignaturePath path = new SignaturePath(SignaturePathData.parse("M0 0 L1 1"), "#000000", new BigDecimal("0.9").multiply(new BigDecimal("0.133")));

        assertThat(path.opacity().toPlainString()).isEqualTo("0.12");
    }

    @Test
    @DisplayName("Given no path, when a vector is made, then it is refused for having no paths")
    void should_refuse_when_made_given_no_path() {
        assertRefused(() -> new SignatureVector(SignatureViewBox.parse("0 0 300 100"), List.of()), SignatureVectorProblem.NO_PATHS);
    }

    @Test
    @DisplayName("Given paths whose canonical JSON is exactly as large as a stored signature may be, when a vector is made, then it is accepted")
    void should_accept_when_made_given_canonical_json_at_the_limit() {
        SignatureVector vector = vectorOfCanonicalSize(SignatureVector.MAX_CANONICAL_BYTES);

        assertThat(vector.canonicalBytes()).hasSize(SignatureVector.MAX_CANONICAL_BYTES);
        assertThat(vector.segments()).isLessThanOrEqualTo(SignatureVector.MAX_SEGMENTS);
    }

    @Test
    @DisplayName("Given paths whose canonical JSON is one byte larger than a stored signature may be, when a vector is made, then it is refused as too complex")
    void should_refuse_when_made_given_canonical_json_one_byte_over_the_limit() {
        assertRefused(() -> vectorOfCanonicalSize(SignatureVector.MAX_CANONICAL_BYTES + 1), SignatureVectorProblem.TOO_COMPLEX);
    }

    @Test
    @DisplayName("Given more paths than a signature may have, when a vector is made, then it is refused as too complex")
    void should_refuse_when_made_given_too_many_paths() {
        List<SignaturePath> paths = Collections.nCopies(SignatureVector.MAX_PATHS + 1, SIGNATURE.paths().getFirst());

        assertRefused(() -> new SignatureVector(SignatureViewBox.parse("0 0 300 100"), paths), SignatureVectorProblem.TOO_COMPLEX);
    }

    @Test
    @DisplayName("Given paths that together have more segments than a signature may have, when a vector is made, then it is refused as too complex")
    void should_refuse_when_made_given_too_many_segments_in_all() {
        SignaturePath half = new SignaturePath(SignaturePathData.parse("M0 0" + " L1 1".repeat(SignatureVector.MAX_SEGMENTS / 2)), "#000000",
                BigDecimal.ONE);

        assertRefused(() -> new SignatureVector(SignatureViewBox.parse("0 0 300 100"), List.of(half, half)), SignatureVectorProblem.TOO_COMPLEX);
    }

    @Test
    @DisplayName("Given a refusal naming an overlong element, when it is made, then the name is cut to forty characters")
    void should_cut_name_when_refused_given_overlong_name() {
        UnsupportedSignatureVector refused = new UnsupportedSignatureVector(SignatureVectorProblem.ELEMENT, "x".repeat(100));

        assertThat(refused.name()).contains("x".repeat(40));
        assertThat(refused.code()).isEqualTo("donations/unsupported-signature-vector");
    }

    @Test
    @DisplayName("Given a vector signature, when it is printed, then only its path count and digest show")
    void should_print_count_and_digest_when_printed_given_vector() {
        assertThat(SIGNATURE).hasToString("SignatureVector[2 paths, " + SIGNATURE.digest() + "]");
    }

    private static SignatureVector vectorOfCanonicalSize(int size) {
        String prefix = "{\"viewBox\":[0,0,10,10],\"paths\":[{\"d\":\"M0 0";
        String suffix = "\",\"fill\":\"#000000\",\"opacity\":1}]}";
        int rest = size - prefix.length() - suffix.length();
        int shorter = Math.floorMod(-rest, 15);
        int longer = (rest - 14 * shorter) / 15;
        String data = "M0 0" + " L123456 123456".repeat(longer) + " L12345 123456".repeat(shorter);
        SignatureVector vector = new SignatureVector(SignatureViewBox.parse("0 0 10 10"),
                List.of(new SignaturePath(SignaturePathData.parse(data), "#000000", BigDecimal.ONE)));
        assertThat(vector.canonicalJson()).startsWith(prefix).endsWith(suffix);
        return vector;
    }

    private static void assertRefused(ThrowingCallable action, SignatureVectorProblem problem) {
        assertThatThrownBy(action).isInstanceOfSatisfying(UnsupportedSignatureVector.class,
                refused -> assertThat(refused.problem()).isEqualTo(problem));
    }
}
