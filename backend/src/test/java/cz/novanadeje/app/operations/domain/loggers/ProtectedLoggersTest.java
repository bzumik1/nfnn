package cz.novanadeje.app.operations.domain.loggers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class ProtectedLoggersTest {

    @ParameterizedTest
    @ValueSource(strings = {"org.hibernate.orm.jdbc.bind", "org.hibernate.orm.jdbc.extract.Values", "org.hibernate.internal.util.EntityPrinter",
            "org.springframework.web.servlet.mvc.method.annotation.HttpEntityMethodProcessor", "org.springframework.web.client.RestTemplate",
            "org.apache.coyote.http11.Http11InputBuffer", "org.postgresql.core.v3", "jakarta.mail"})
    @DisplayName("Given a logger that would write bound values, bodies, raw requests or mail traffic, when it is checked, then it is protected")
    void should_protect_when_checked_given_logger_that_writes_data(String name) {
        assertThat(ProtectedLoggers.covers(new LoggerName(name))).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ROOT", "cz.novanadeje.app", "org.hibernate", "org.hibernate.SQL", "org.hibernate.orm.jdbcx", "org.springframework.web",
            "org.springframework.security", "org.apache", "liquibase"})
    @DisplayName("Given a logger above or beside the protected ones, when it is checked, then it may be raised")
    void should_allow_when_checked_given_parent_or_unrelated_logger(String name) {
        assertThat(ProtectedLoggers.covers(new LoggerName(name))).isFalse();
    }

    @Test
    @DisplayName("Given TRACE, when it is asked for a library or ROOT, then it is refused, and for the site's own code it is allowed")
    void should_allow_trace_only_for_own_code_when_checked_given_trace() {
        assertThat(ProtectedLoggers.refuses(new LoggerName("ROOT"), LogLevel.TRACE)).isTrue();
        assertThat(ProtectedLoggers.refuses(new LoggerName("org.springframework.web"), LogLevel.TRACE)).isTrue();
        assertThat(ProtectedLoggers.refuses(new LoggerName("cz.novanadeje.app.donations"), LogLevel.TRACE)).isFalse();
        assertThat(ProtectedLoggers.refuses(new LoggerName("cz.novanadeje.application"), LogLevel.TRACE)).isTrue();
        assertThat(ProtectedLoggers.refuses(new LoggerName("org.springframework.web"), LogLevel.DEBUG)).isFalse();
        assertThat(ProtectedLoggers.refuses(new LoggerName("org.postgresql"), LogLevel.DEBUG)).isTrue();
    }

    @Test
    @DisplayName("Given Tomcat's request parser, which writes an unreadable request target with its query string at INFO, when its pin is looked up, then it is WARN")
    void should_pin_at_warn_when_looked_up_given_request_parser() {
        assertThat(ProtectedLoggers.PINS).containsEntry("org.apache.coyote.http11.Http11Processor", LogLevel.WARN);
    }

    @ParameterizedTest
    @EnumSource(LogLevel.class)
    @DisplayName("Given Tomcat's request parser, when any level is asked for it, then it is refused")
    void should_refuse_when_any_level_is_asked_given_request_parser(LogLevel level) {
        assertThat(ProtectedLoggers.refuses(new LoggerName("org.apache.coyote.http11.Http11Processor"), level)).isTrue();
    }

    @Test
    @DisplayName("Given the pins, when their levels are looked up, then none is louder than INFO")
    void should_pin_no_logger_louder_than_info_when_looked_up_given_pins() {
        assertThat(ProtectedLoggers.PINS.values()).allMatch(level -> level.compareTo(LogLevel.INFO) >= 0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"org.springframework.security.web.FilterChainProxy", "org.springframework.security.web.firewall.HttpStatusRequestRejectedHandler",
            "org.springframework.web.servlet.DispatcherServlet", "org.springframework.web.filter.ForwardedHeaderFilter",
            "org.springframework.web.method.HandlerMethod", "org.springframework.web.method.support.InvocableHandlerMethod",
            "org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter"})
    @DisplayName("Given a framework logger that writes the request line, its query string, a parameter's value or the client address at DEBUG, when it is checked, then it is protected")
    void should_protect_when_checked_given_logger_that_writes_request_text(String name) {
        assertThat(ProtectedLoggers.covers(new LoggerName(name))).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"org.springframework.security.web.FilterChainProxy", "org.springframework.security.web.firewall",
            "org.springframework.web.servlet.DispatcherServlet", "org.springframework.web.filter.ForwardedHeaderFilter", "org.springframework.web.method",
            "org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter"})
    @DisplayName("Given a framework logger that writes request text at DEBUG, when its pin is looked up, then it is INFO")
    void should_pin_at_info_when_looked_up_given_logger_that_writes_request_text(String name) {
        assertThat(ProtectedLoggers.PINS).containsEntry(name, LogLevel.INFO);
    }

    @ParameterizedTest
    @ValueSource(strings = {"org.springframework.security", "org.springframework.security.web", "org.springframework.security.web.authentication",
            "org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider",
            "org.springframework.security.web.access.ExceptionTranslationFilter", "org.springframework.web.servlet",
            "org.springframework.web.servlet.mvc.support.DefaultHandlerExceptionResolver", "org.springframework.web.filter"})
    @DisplayName("Given a logger for debugging sign-in, authorization or request handling that writes no request text, when it is checked, then it may be raised")
    void should_allow_when_checked_given_debugging_logger_without_request_text(String name) {
        assertThat(ProtectedLoggers.covers(new LoggerName(name))).isFalse();
    }

    @Test
    @DisplayName("Given Tomcat's cookie parser, which writes an invalid cookie as the client wrote it at INFO, when its pin is looked up, then it is WARN and every level is refused")
    void should_pin_at_warn_and_refuse_every_level_when_looked_up_given_cookie_parser() {
        assertThat(ProtectedLoggers.PINS).containsEntry("org.apache.tomcat.util.http.parser.Cookie", LogLevel.WARN);
        assertThat(LogLevel.values()).allMatch(level -> ProtectedLoggers.refuses(new LoggerName("org.apache.tomcat.util.http.parser.Cookie"), level));
    }
}
