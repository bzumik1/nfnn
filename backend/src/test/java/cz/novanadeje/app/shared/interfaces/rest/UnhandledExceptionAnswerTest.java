package cz.novanadeje.app.shared.interfaces.rest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.Ordered;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.ControllerAdviceBean;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.handler.HandlerExceptionResolverComposite;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
class UnhandledExceptionAnswerTest {

    private static final String PROBE_PATTERN = "/api/content/probe-unhandled/{id}";
    private static final String CLIENT_VALUE = "nfnn-client-value";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    @Qualifier("handlerExceptionResolver")
    private HandlerExceptionResolver exceptionResolver;

    private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
    private RequestMappingInfo probeMapping;

    public static class FailingProbe {

        public String fail(String id) {
            throw new IllegalStateException("nfnn-exception-text: " + id);
        }
    }

    @BeforeEach
    void setUp() throws NoSuchMethodException {
        probeMapping = RequestMappingInfo.paths(PROBE_PATTERN).methods(RequestMethod.GET)
                .options(handlerMapping.getBuilderConfiguration()).build();
        handlerMapping.registerMapping(probeMapping, new FailingProbe(), FailingProbe.class.getMethod("fail", String.class));
        logged.start();
        logger().addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        handlerMapping.unregisterMapping(probeMapping);
        logger().detachAppender(logged);
        logged.stop();
    }

    @Test
    @DisplayName("Given the running application, when an endpoint throws what nothing else answers, then the answer is the uncacheable internal error problem and one line names the path pattern")
    void should_answer_uncacheable_problem_and_log_pattern_when_thrown_given_running_application() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get("/api/content/probe-unhandled/" + CLIENT_VALUE)
                        .queryParam("q", CLIENT_VALUE).header("Accept-Language", "cs"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(response.getContentType()).isEqualTo("application/problem+json");
        assertThat(response.getHeader("Cache-Control")).contains("no-store");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .contains("\"type\":\"https://nfnn.cz/problems/internal-error\"")
                .contains("\"title\":\"Něco se pokazilo\"")
                .doesNotContain("nfnn-exception-text");
        assertThat(logged.list).singleElement().satisfies(line -> {
            assertThat(line.getLevel()).isEqualTo(Level.ERROR);
            assertThat(line.getFormattedMessage()).isEqualTo("Unhandled IllegalStateException answered as 500 at GET " + PROBE_PATTERN);
            assertThat(line.getThrowableProxy()).isNull();
        });
    }

    @Test
    @DisplayName("Given the running application, when its controller advices are ordered, then the catch-all comes last, after every other advice")
    void should_order_catch_all_last_when_advices_ordered_given_running_application() {
        List<ControllerAdviceBean> advices = List.copyOf(adviceResolver().getExceptionHandlerAdviceCache().keySet());

        assertThat(advices).last().satisfies(last -> {
            assertThat(last.getBeanType()).isEqualTo(UnhandledExceptionHandler.class);
            assertThat(last.getOrder()).isEqualTo(Ordered.LOWEST_PRECEDENCE);
        });
        assertThat(advices.subList(0, advices.size() - 1))
                .isNotEmpty()
                .allSatisfy(advice -> assertThat(advice.getOrder()).isLessThan(Ordered.LOWEST_PRECEDENCE));
    }

    private ExceptionHandlerExceptionResolver adviceResolver() {
        return ((HandlerExceptionResolverComposite) exceptionResolver).getExceptionResolvers().stream()
                .filter(ExceptionHandlerExceptionResolver.class::isInstance)
                .map(ExceptionHandlerExceptionResolver.class::cast)
                .findFirst()
                .orElseThrow();
    }

    private static Logger logger() {
        return (Logger) LoggerFactory.getLogger(UnhandledExceptionHandler.class);
    }
}
