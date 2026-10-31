package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.shared.interfaces.rest.ProblemMessages;
import cz.novanadeje.app.shared.interfaces.rest.ProblemTypes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AdminReportController.class)
class AdminReportProblemHandler {

    static final String CODE = "donations/report-not-delivered";

    private static final Logger log = LoggerFactory.getLogger(AdminReportProblemHandler.class);

    private final ProblemMessages texts;

    AdminReportProblemHandler(MessageSource messages) {
        this.texts = new ProblemMessages(messages);
    }

    @ExceptionHandler(MonthlyReportNotDelivered.class)
    ProblemDetail handleNotDelivered(MonthlyReportNotDelivered notDelivered) {
        log.error("Monthly report for {} could not be sent by hand: {}", notDelivered.month(), notDelivered.getCause().getClass().getSimpleName());
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_GATEWAY);
        problem.setType(ProblemTypes.of(CODE));
        problem.setTitle(texts.text("problem." + CODE + ".title"));
        problem.setDetail(texts.text("problem." + CODE + ".detail"));
        return problem;
    }
}
