package cz.novanadeje.app.donors.interfaces.rest;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PasskeyOrPasswordWithCode.Validator.class)
@interface PasskeyOrPasswordWithCode {

    String message() default "{jakarta.validation.constraints.NotBlank.message}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<PasskeyOrPasswordWithCode, AdministrationUnlockRequest> {

        @Override
        public boolean isValid(AdministrationUnlockRequest request, ConstraintValidatorContext context) {
            if (request == null || request.passkey() != null) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            boolean valid = given("password", request.password(), context);
            return given("secondFactorCode", request.secondFactorCode(), context) && valid;
        }

        private static boolean given(String field, String value, ConstraintValidatorContext context) {
            if (value != null && !value.isBlank()) {
                return true;
            }
            context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                    .addPropertyNode(field)
                    .addConstraintViolation();
            return false;
        }
    }
}
