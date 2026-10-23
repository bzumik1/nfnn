package cz.novanadeje.app.operations.domain.loggers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
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
}
