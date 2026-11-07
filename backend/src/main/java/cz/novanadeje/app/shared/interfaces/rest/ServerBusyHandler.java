package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.LOWEST_PRECEDENCE - 1)
@RestControllerAdvice
class ServerBusyHandler {

    static final String CODE = "server-busy";
    static final String RETRY_AFTER_SECONDS = "5";

    private static final Logger log = LoggerFactory.getLogger(ServerBusyHandler.class);

    private final ProblemMessages texts;

    ServerBusyHandler(MessageSource messages) {
        this.texts = new ProblemMessages(messages);
    }

    @ExceptionHandler({PessimisticLockingFailureException.class, QueryTimeoutException.class, CannotCreateTransactionException.class})
    ResponseEntity<ProblemDetail> handleDatabaseWait(Exception ex, HttpServletRequest request) {
        log.warn("Database wait ran out ({}) answered as 503 at {} {}", ex.getClass().getSimpleName(), UnhandledExceptionHandler.method(request),
                UnhandledExceptionHandler.pattern(request));
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.SERVICE_UNAVAILABLE);
        problem.setType(ProblemTypes.SERVER_BUSY);
        problem.setTitle(texts.text("problem." + CODE + ".title"));
        problem.setDetail(texts.text("problem." + CODE + ".detail"));
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.RETRY_AFTER, RETRY_AFTER_SECONDS)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }
}
