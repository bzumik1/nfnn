package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SignaturePathDataTest {

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80|M10 80 C40 10 65 10 95 80 S150 150 180 80|3",
            "M190,60 l20-30 h30 v20 q10 10 20 0 t20 0 z|M190 60 L210 30 H240 V50 Q250 60 260 50 T280 50 Z|7",
            "m1.5.5.25-1e2 L+3,4|M1.5 0.5 1.75 -99.5 L3 4|3",
            "  M 0.10000 -0 L 2.00049 3.0005 Z  |M0.1 0 L2 3 Z|3",
            "M0 0a10 10 0 0110 10 A 5,5 30 1 0 20 20z|M0 0 A10 10 0 0 1 10 10 A5 5 30 1 0 20 20 Z|4",
            "M5. 6 H7 V8 h-.5 v1E1 T9 9|M5 6 H7 V8 H6.5 V18 T9 9|6",
            "M10 10 c1 2 3 4 5 6 s1 1 2 2 z m5 5 l1 1|M10 10 C11 12 13 14 15 16 S16 17 17 18 Z M15 15 L16 16|6",
            "M0 0 c1 1 2 2 3 3 1 1 2 2 3 3|M0 0 C1 1 2 2 3 3 4 4 5 5 6 6|3"
    })
    @DisplayName("Given valid path data, when it is parsed, then it keeps its commands in one canonical spelling with absolute coordinates and counts its segments")
    void should_write_canonical_form_when_parsed_given_valid_path_data(String raw, String canonical, int segments) {
        SignaturePathData data = SignaturePathData.parse(raw);

        assertThat(data.value()).isEqualTo(canonical);
        assertThat(data.segments()).isEqualTo(segments);
        assertThat(SignaturePathData.parse(canonical)).isEqualTo(data);
    }

    @ParameterizedTest(name = "[{0}]")
    @ValueSource(strings = {"", "   ", "L10 10", "10 10", "M10", "M10 10 L", "M10 10 X5 5", "M10,,10", "M10 10,", "M10 10 L5 5,M0 0",
            "M10 10 Z 5 5", "M0 0 A10 10 0 2 1 5 5", "M0 0 A10 10 0 0", "M1e1000 0", "M2000000 0", "M0 0 C1 2 3 4 5", "M0 0 url(#a)",
            "M0 0 L1 1;", "M1.2.3e", "M0 0 L 1e 2", "M- 1 2", "M0 0 L1 1 <script>"})
    @DisplayName("Given path data that breaks the grammar or the limits, when it is parsed, then it is refused as path data")
    void should_refuse_when_parsed_given_malformed_path_data(String raw) {
        assertThatThrownBy(() -> SignaturePathData.parse(raw))
                .isInstanceOfSatisfying(UnsupportedSignatureVector.class,
                        refused -> assertThat(refused.problem()).isEqualTo(SignatureVectorProblem.PATH_DATA));
    }

    @Test
    @DisplayName("Given a thousand small relative steps, when the path data is parsed, then each point is rounded from its exact absolute position, so the rounding never adds up")
    void should_not_drift_when_parsed_given_many_small_relative_steps() {
        SignaturePathData data = SignaturePathData.parse("M0 0" + " l0.0004 0.0004".repeat(1000));

        String[] commands = data.value().split(" (?=[A-Z])");
        assertThat(commands).hasSize(1001);
        assertThat(commands[1]).isEqualTo("L0 0");
        assertThat(commands[2]).isEqualTo("L0.001 0.001");
        assertThat(commands[500]).isEqualTo("L0.2 0.2");
        assertThat(commands[1000]).isEqualTo("L0.4 0.4");
    }

    @Test
    @DisplayName("Given path data with more segments than a signature may have, when it is parsed, then it is refused as too complex")
    void should_refuse_as_too_complex_when_parsed_given_too_many_segments() {
        String raw = "M0 0" + " L1 1".repeat(SignatureVector.MAX_SEGMENTS);

        assertThatThrownBy(() -> SignaturePathData.parse(raw))
                .isInstanceOfSatisfying(UnsupportedSignatureVector.class,
                        refused -> assertThat(refused.problem()).isEqualTo(SignatureVectorProblem.TOO_COMPLEX));
    }

    @Test
    @DisplayName("Given a null, when path data is parsed, then it is refused as path data")
    void should_refuse_when_parsed_given_null() {
        assertThatThrownBy(() -> SignaturePathData.parse(null)).isInstanceOf(UnsupportedSignatureVector.class);
    }
}
