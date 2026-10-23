package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AdminReportController.class)
class AdminReportProblemHandler {

    static final String CODE = "donations/report-not-delivered";

    private static final Logger log = LoggerFactory.getLogger(AdminReportProblemHandler.class);

    private final MessageSource messages;

    AdminReportProblemHandler(MessageSource messages) {
        this.messages = messages;
    }

    @ExceptionHandler(MonthlyReportNotDelivered.class)
    ProblemDetail handleNotDelivered(MonthlyReportNotDelivered notDelivered) {
        log.error("Monthly report for {} could not be sent by hand: {}", notDelivered.month(), notDelivered.getCause().getClass().getSimpleName());
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_GATEWAY);
        problem.setType(ProblemTypes.of(CODE));
        problem.setTitle(messages.getMessage("problem." + CODE + ".title", null, LocaleContextHolder.getLocale()));
        problem.setDetail(messages.getMessage("problem." + CODE + ".detail", null, LocaleContextHolder.getLocale()));
        return problem;
    }
}
