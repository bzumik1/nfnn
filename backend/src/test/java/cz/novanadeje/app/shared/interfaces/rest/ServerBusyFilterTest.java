package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ServerBusyFilterTest {

    private final RecordingResolver resolver = new RecordingResolver();
    private final ServerBusyFilter filter = new ServerBusyFilter(resolver, czechByDefault());

    static Stream<RuntimeException> databaseWaits() {
        return Stream.of(
                new CannotCreateTransactionException("Could not open JPA EntityManager for transaction"),
                new CannotAcquireLockException("lock"),
                new QueryTimeoutException("statement"));
    }

    @ParameterizedTest
    @MethodSource("databaseWaits")
    @DisplayName("Given a filter behind it whose database wait ran out, when a request passes, then the failure goes to the exception handlers that answer 503 server-busy")
    void should_hand_failure_to_exception_handlers_when_request_passes_given_database_wait_ran_out(RuntimeException wait) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/content/home");

        filter.doFilter(request, new MockHttpServletResponse(), failingWith(wait));

        assertThat(resolver.resolved).containsExactly(wait);
    }

    @Test
    @DisplayName("Given a filter behind it failing for another reason, when a request passes, then the failure goes on unchanged")
    void should_rethrow_when_request_passes_given_other_failure() {
        DataAccessResourceFailureException other = new DataAccessResourceFailureException("other");

        assertThatThrownBy(() -> filter.doFilter(new MockHttpServletRequest("GET", "/api/content/home"), new MockHttpServletResponse(), failingWith(other)))
                .isSameAs(other);
        assertThat(resolver.resolved).isEmpty();
    }

    @Test
    @DisplayName("Given a client without Accept-Language, when its database wait in a filter runs out, then the handlers answer in the site's locale")
    void should_resolve_in_site_locale_when_wait_runs_out_given_no_accept_language() throws Exception {
        filter.doFilter(new MockHttpServletRequest("GET", "/api/content/home"), new MockHttpServletResponse(),
                failingWith(new QueryTimeoutException("statement")));

        assertThat(resolver.locales).containsExactly(Locale.of("cs"));
    }

    @Test
    @DisplayName("Given the handler of database waits, when its failures are listed, then the filter catches exactly the failures the handler answers")
    void should_catch_exactly_handled_failures_when_listed_given_server_busy_handler() throws Exception {
        ExceptionHandler handled = ServerBusyHandler.class.getDeclaredMethod("handleDatabaseWait", Exception.class, HttpServletRequest.class)
                .getAnnotation(ExceptionHandler.class);

        assertThat(handled.value()).containsExactlyInAnyOrderElementsOf(ServerBusyHandler.DATABASE_WAITS);
    }

    private static FilterChain failingWith(RuntimeException failure) {
        return (request, response) -> {
            throw failure;
        };
    }

    private static AcceptHeaderLocaleResolver czechByDefault() {
        AcceptHeaderLocaleResolver locales = new AcceptHeaderLocaleResolver();
        locales.setDefaultLocale(Locale.of("cs"));
        return locales;
    }

    private static final class RecordingResolver implements HandlerExceptionResolver {

        private final List<Exception> resolved = new ArrayList<>();
        private final List<Locale> locales = new ArrayList<>();

        @Override
        public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response, Object handler,
                                             Exception ex) {
            resolved.add(ex);
            locales.add(LocaleContextHolder.getLocale());
            return new ModelAndView();
        }
    }
}
