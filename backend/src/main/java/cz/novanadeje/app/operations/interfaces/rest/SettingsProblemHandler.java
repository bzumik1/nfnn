package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.settings.SettingError;
import cz.novanadeje.app.operations.domain.settings.SettingsRejected;
import cz.novanadeje.app.shared.interfaces.rest.ProblemMessages;
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
@RestControllerAdvice(assignableTypes = {SetupController.class, AdminSettingsController.class})
class SettingsProblemHandler {

    private final ProblemMessages texts;

    SettingsProblemHandler(MessageSource messages) {
        this.texts = new ProblemMessages(messages);
    }

    @ExceptionHandler(SettingsRejected.class)
    ProblemDetail handleRejected(SettingsRejected rejected) {
        Locale locale = LocaleContextHolder.getLocale();
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(ProblemTypes.of(SettingsRejected.CODE));
        problem.setTitle(texts.text("problem." + SettingsRejected.CODE + ".title", locale));
        problem.setDetail(texts.text("problem." + SettingsRejected.CODE + ".detail", locale));
        problem.setProperty("errors", errors(rejected.errors(), locale));
        return problem;
    }

    private List<Map<String, String>> errors(List<SettingError> errors, Locale locale) {
        return errors.stream()
                .map(error -> Map.of(
                        "field", error.setting().map(Enum::name).orElse(""),
                        "code", error.problem().code(),
                        "message", texts.text("operations.settings.problem." + error.problem().code(), locale)))
                .toList();
    }
}
