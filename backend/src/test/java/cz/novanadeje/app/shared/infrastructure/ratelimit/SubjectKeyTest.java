package cz.novanadeje.app.shared.infrastructure.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubjectKeyTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = " ")
    @DisplayName("Given no subject, when a subject key is made, then it is refused, so no two anonymous requests share a window")
    void should_refuse_the_key_when_it_is_made_given_no_subject(String subject) {
        assertThatThrownBy(() -> new SubjectKey(subject)).isInstanceOf(IllegalArgumentException.class);
    }
}
