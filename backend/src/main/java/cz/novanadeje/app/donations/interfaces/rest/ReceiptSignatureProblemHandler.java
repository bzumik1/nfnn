package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AdminReceiptSignatureController.class)
class ReceiptSignatureProblemHandler {

    static final String FIELD = "file";

    private final MessageSource messages;

    ReceiptSignatureProblemHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(UnsupportedSignatureVector.class)
    ProblemDetail handleUnsupportedVector(UnsupportedSignatureVector refused) {
        Locale locale = LocaleContextHolder.getLocale();
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(ProblemTypes.of(UnsupportedSignatureVector.CODE));
        problem.setTitle(messages.getMessage("problem." + UnsupportedSignatureVector.CODE + ".title", null, locale));
        problem.setDetail(messages.getMessage("problem." + UnsupportedSignatureVector.CODE + ".detail", null, locale));
        String code = refused.problem().code();
        Object[] name = {refused.name().orElse("")};
        problem.setProperty("errors", List.of(Map.of(
                "field", FIELD,
                "code", code,
                "message", messages.getMessage("donations.signatureVector." + code, name, locale))));
        return problem;
    }
}
