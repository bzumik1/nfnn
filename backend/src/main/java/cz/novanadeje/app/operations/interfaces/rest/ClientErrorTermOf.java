package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorTerm;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.List;

@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ClientErrorTermOf.Validator.class)
@interface ClientErrorTermOf {

    Class<? extends ClientErrorTerm> value();

    String message() default "{operations.clientErrors.unknownValue}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ClientErrorTermOf, String> {

        private List<? extends ClientErrorTerm> terms = List.of();

        @Override
        public void initialize(ClientErrorTermOf annotation) {
            terms = List.of(annotation.value().getEnumConstants());
        }

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || ClientErrorTerm.parse(terms, value).isPresent();
        }
    }
}
