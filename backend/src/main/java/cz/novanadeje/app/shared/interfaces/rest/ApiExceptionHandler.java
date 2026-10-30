package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.error.AccessDenied;
import cz.novanadeje.app.shared.domain.error.AuthenticationFailure;
import cz.novanadeje.app.shared.domain.error.Conflict;
import cz.novanadeje.app.shared.domain.error.DomainException;
import cz.novanadeje.app.shared.domain.error.NotFound;
import cz.novanadeje.app.shared.domain.error.RuleViolation;
import org.apache.tomcat.util.http.InvalidParameterException;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ex.updateAndGetBody(getMessageSource(), LocaleContextHolder.getLocale());
        problem.setType(ProblemTypes.VALIDATION);
        problem.setProperty("errors", fieldErrors(ex.getFieldErrors()));
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return validationProblem(ex, parameterErrors(ex), headers, request);
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return validationProblem(ex, List.of(fieldError(ex.getPropertyName(), message("problem.validation.invalid-value"))), headers, request);
    }

    @Override
    protected ResponseEntity<Object> handleMissingServletRequestParameter(MissingServletRequestParameterException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return validationProblem(ex, List.of(fieldError(ex.getParameterName(), message("problem.validation.missing-value"))), headers, request);
    }

    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(MaxUploadSizeExceededException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONTENT_TOO_LARGE);
        problem.setType(ProblemTypes.UPLOAD_TOO_LARGE);
        problem.setTitle(message("problem.upload-too-large.title"));
        problem.setDetail(message("problem.upload-too-large.detail"));
        return handleExceptionInternal(ex, problem, headers, HttpStatus.CONTENT_TOO_LARGE, request);
    }

    @ExceptionHandler(DomainException.class)
    ProblemDetail handleDomainException(DomainException ex) {
        HttpStatus status = switch (ex) {
            case RuleViolation violation -> HttpStatus.BAD_REQUEST;
            case Conflict conflict -> HttpStatus.CONFLICT;
            case NotFound notFound -> HttpStatus.NOT_FOUND;
            case AuthenticationFailure failure -> HttpStatus.UNAUTHORIZED;
            case AccessDenied denied -> HttpStatus.FORBIDDEN;
        };
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setType(ProblemTypes.of(ex.code()));
        problem.setTitle(message("problem." + ex.code() + ".title", ex.getMessage()));
        problem.setDetail(message("problem." + ex.code() + ".detail", ex.getMessage()));
        ex.extensions().forEach(problem::setProperty);
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(ProblemTypes.VALIDATION);
        problem.setTitle(message("problem.validation.title", HttpStatus.BAD_REQUEST.getReasonPhrase()));
        problem.setDetail(ex.getMessage());
        return problem;
    }

    @ExceptionHandler(InvalidParameterException.class)
    ResponseEntity<Object> handleUndecodableParameter(InvalidParameterException ex, WebRequest request) {
        return validationProblem(ex, List.of(), new HttpHeaders(), request);
    }

    @ExceptionHandler(MultipartException.class)
    ResponseEntity<Object> handleUnreadableMultipart(MultipartException ex, WebRequest request) {
        return validationProblem(ex, List.of(), new HttpHeaders(), request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail handleAuthentication(AuthenticationException ex) {
        if (isExpiredToken(ex)) {
            return problem(HttpStatus.UNAUTHORIZED, ProblemTypes.EXPIRED_TOKEN, "problem.expired-token.title");
        }
        return problem(HttpStatus.UNAUTHORIZED, ProblemTypes.UNAUTHENTICATED, "problem.unauthenticated.title");
    }

    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        return problem(HttpStatus.FORBIDDEN, ProblemTypes.FORBIDDEN, "problem.forbidden.title");
    }

    private static boolean isExpiredToken(AuthenticationException ex) {
        return ex instanceof OAuth2AuthenticationException oauth
                && oauth.getError().getDescription() != null
                && oauth.getError().getDescription().contains("expired");
    }

    private ProblemDetail problem(HttpStatus status, URI type, String titleKey) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setType(type);
        problem.setTitle(message(titleKey, status.getReasonPhrase()));
        return problem;
    }

    private ResponseEntity<Object> validationProblem(Exception ex, List<Map<String, String>> errors, HttpHeaders headers, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(ProblemTypes.VALIDATION);
        problem.setTitle(message("problem.validation.title"));
        problem.setDetail(message("problem.validation.detail"));
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, HttpStatus.BAD_REQUEST, request);
    }

    private String message(String key) {
        return message(key, key);
    }

    private String message(String key, String fallback) {
        Locale locale = LocaleContextHolder.getLocale();
        return getMessageSource().getMessage(key, null, fallback, locale);
    }

    private static List<Map<String, String>> parameterErrors(HandlerMethodValidationException ex) {
        return ex.getParameterValidationResults().stream()
                .flatMap(result -> result instanceof ParameterErrors beanErrors
                        ? beanErrors.getFieldErrors().stream().map(error -> fieldError(error.getField(), error.getDefaultMessage()))
                        : result.getResolvableErrors().stream().map(error -> fieldError(result.getMethodParameter().getParameterName(), error.getDefaultMessage())))
                .toList();
    }

    private static Map<String, String> fieldError(String field, String message) {
        return Map.of("field", field == null ? "" : field, "message", message == null ? "" : message);
    }

    private static List<Map<String, String>> fieldErrors(List<FieldError> errors) {
        return errors.stream()
                .map(error -> Map.of(
                        "field", error.getField(),
                        "message", error.getDefaultMessage() == null ? "" : error.getDefaultMessage()
                ))
                .toList();
    }
}
