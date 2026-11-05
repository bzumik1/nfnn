package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.util.DisconnectedClientHelper;

import java.util.Set;

@Order(Ordered.LOWEST_PRECEDENCE)
@RestControllerAdvice
class UnhandledExceptionHandler {

    static final String CODE = "internal-error";
    static final String UNMATCHED_PATTERN = "(unmatched)";
    static final String OTHER_METHOD = "OTHER";

    private static final Logger log = LoggerFactory.getLogger(UnhandledExceptionHandler.class);
    private static final Set<String> STANDARD_METHODS = Set.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE");

    private final ProblemMessages texts;

    UnhandledExceptionHandler(MessageSource messages) {
        this.texts = new ProblemMessages(messages);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnhandled(Exception ex, HttpServletRequest request) {
        if (DisconnectedClientHelper.isClientDisconnectedException(ex)) {
            return null;
        }
        log.error("Unhandled {} answered as 500 at {} {}", className(ex), method(request), pattern(request));
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        problem.setType(ProblemTypes.INTERNAL_ERROR);
        problem.setTitle(texts.text("problem." + CODE + ".title"));
        problem.setDetail(texts.text("problem." + CODE + ".detail"));
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    private static String className(Exception ex) {
        String simpleName = ex.getClass().getSimpleName();
        return simpleName.isEmpty() ? ex.getClass().getName() : simpleName;
    }

    private static String method(HttpServletRequest request) {
        return STANDARD_METHODS.contains(request.getMethod()) ? request.getMethod() : OTHER_METHOD;
    }

    private static String pattern(HttpServletRequest request) {
        return request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) instanceof String pattern ? pattern : UNMATCHED_PATTERN;
    }
}
