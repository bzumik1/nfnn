package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ValidCompanyIdentifier.Validator.class)
@interface ValidCompanyIdentifier {

    String message() default "{donors.companyIdentifier.invalid}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidCompanyIdentifier, String> {

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || value.isBlank() || CompanyIdentifier.isValid(value);
        }
    }
}
