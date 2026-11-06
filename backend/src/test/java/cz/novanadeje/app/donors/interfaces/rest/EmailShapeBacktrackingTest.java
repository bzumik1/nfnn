package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.DonorType;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Duration;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

class EmailShapeBacktrackingTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = FACTORY.getValidator();
    private static final String HOSTILE = "a@" + ".".repeat(200_000) + "@";

    @AfterAll
    static void closeFactory() {
        FACTORY.close();
    }

    static Stream<Arguments> requestsWithAnEmail() {
        return Stream.of(
                Arguments.of("registration", (Function<String, Object>) email -> new RegisterDonorRequest(DonorType.PERSON, "Jana", null,
                        new AddressRequest("Nová 1", "Most", "434 01"), email, "correct horse battery", "cs", null)),
                Arguments.of("password reset", (Function<String, Object>) PasswordResetRequest::new),
                Arguments.of("new verification link", (Function<String, Object>) email -> new EmailVerificationRequest(email, null)),
                Arguments.of("e-mail change", (Function<String, Object>) email -> new EmailChangeRequest(email, "correct horse battery", null)),
                Arguments.of("administration grant", (Function<String, Object>) GrantAdministrationRequest::new));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("requestsWithAnEmail")
    @DisplayName("Given a request whose e-mail is a long run of dots between two at signs, when it is validated, then it is refused at once")
    void should_refuse_at_once_when_validated_given_long_run_of_dots_between_at_signs(String request, Function<String, Object> withEmail) {
        Object hostile = withEmail.apply(HOSTILE);

        Set<ConstraintViolation<Object>> violations = assertTimeoutPreemptively(Duration.ofSeconds(2), () -> VALIDATOR.validate(hostile));

        assertThat(violations).isNotEmpty();
    }
}
