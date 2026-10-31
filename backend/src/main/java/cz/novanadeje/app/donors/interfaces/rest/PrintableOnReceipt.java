package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.shared.domain.PrintableText;
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
@Constraint(validatedBy = PrintableOnReceipt.Validator.class)
@interface PrintableOnReceipt {

    String message() default "{donors.printableOnReceipt.invalid}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<PrintableOnReceipt, String> {

        private static final String BLANK_MESSAGE = "{jakarta.validation.constraints.NotBlank.message}";

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            if (value == null) {
                return true;
            }
            PrintableText printed = PrintableText.of(value);
            if (!printed.prints()) {
                return false;
            }
            if (value.isBlank() || !blank(printed.text())) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(BLANK_MESSAGE).addConstraintViolation();
            return false;
        }

        private static boolean blank(String text) {
            return text.codePoints().allMatch(codePoint -> Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint));
        }
    }
}
