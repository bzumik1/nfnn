package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.DonorType;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class PrintableOnReceiptTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = FACTORY.getValidator();

    @AfterAll
    static void closeFactory() {
        FACTORY.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"​", "­", "​­⁠﻿", " ‮ "})
    @DisplayName("Given a registration whose name, street and city hold only characters a receipt drops, when it is validated, then each of them is refused")
    void should_refuse_each_field_when_validated_given_only_dropped_characters(String invisible) {
        RegisterDonorRequest request = new RegisterDonorRequest(DonorType.PERSON, invisible, null,
                new AddressRequest(invisible, invisible, "434 01"), "jana@example.cz", "correct horse battery", "cs", null);

        assertThat(fields(VALIDATOR.validate(request))).contains("name", "address.street", "address.city");
    }

    @ParameterizedTest
    @ValueSource(strings = {"​", "­⁠"})
    @DisplayName("Given a profile change whose name holds only characters a receipt drops, when it is validated, then the name is refused")
    void should_refuse_name_when_profile_change_validated_given_only_dropped_characters(String invisible) {
        UpdateDonorProfileRequest request = new UpdateDonorProfileRequest(invisible, null, "cs");

        assertThat(fields(VALIDATOR.validate(request))).contains("name");
    }

    private static Set<String> fields(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream().map(violation -> violation.getPropertyPath().toString())
                .collect(Collectors.toSet());
    }
}
