package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.PrintableText;
import jakarta.validation.ConstraintValidatorContext;

public final class PrintableOnReceiptCheck {

    private static final String BLANK_MESSAGE = "{jakarta.validation.constraints.NotBlank.message}";

    private PrintableOnReceiptCheck() {
    }

    public static boolean isValid(String value, ConstraintValidatorContext context) {
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
