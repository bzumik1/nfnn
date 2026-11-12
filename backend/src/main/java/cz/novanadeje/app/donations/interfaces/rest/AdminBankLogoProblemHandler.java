package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.shared.interfaces.rest.ProblemMessages;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AdminBankLogosController.class)
class AdminBankLogoProblemHandler {

    static final String CODE = "donations/bank-logo-unavailable";

    private final ProblemMessages texts;

    AdminBankLogoProblemHandler(MessageSource messages) {
        this.texts = new ProblemMessages(messages);
    }

    @ExceptionHandler(BankLogoUnavailable.class)
    ProblemDetail handleUnavailable(BankLogoUnavailable unavailable) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_GATEWAY);
        problem.setType(ProblemTypes.of(CODE));
        problem.setTitle(texts.text("problem." + CODE + ".title"));
        problem.setDetail(texts.text("problem." + CODE + ".detail." + unavailable.failure().word()));
        return problem;
    }
}
