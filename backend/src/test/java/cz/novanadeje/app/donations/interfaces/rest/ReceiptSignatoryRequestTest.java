package cz.novanadeje.app.donations.interfaces.rest;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptSignatoryRequestTest {

    private static final String PERSON = "019a3a00-0000-7000-8000-00000000f001";
    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = FACTORY.getValidator();

    @AfterAll
    static void closeFactory() {
        FACTORY.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"předseda 😀", "předseda 王", "​", "­⁠"})
    @DisplayName("Given a receipt role with a character no receipt can print, or only characters a receipt drops, when the choice is validated, then the role is refused")
    void should_refuse_the_role_when_validated_given_an_unprintable_role(String role) {
        assertThat(fields(VALIDATOR.validate(new ReceiptSignatoryRequest(PERSON, role)))).containsExactly("receiptRole");
    }

    @Test
    @DisplayName("Given a receipt role a receipt can print, when the choice is validated, then it passes")
    void should_pass_when_validated_given_a_printable_role() {
        assertThat(VALIDATOR.validate(new ReceiptSignatoryRequest(PERSON, "předseda správní rady – Ústí"))).isEmpty();
    }

    private static Set<String> fields(Set<ConstraintViolation<ReceiptSignatoryRequest>> violations) {
        return violations.stream().map(violation -> violation.getPropertyPath().toString()).collect(Collectors.toSet());
    }
}
