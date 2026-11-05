package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.mail.MailSendException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.nio.charset.StandardCharsets;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class AdminReportProblemPrecedenceTest {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Autowired
    @Qualifier("handlerExceptionResolver")
    private HandlerExceptionResolver exceptionResolver;

    @Test
    @DisplayName("Given the running application with its catch-all, when sending the report by hand fails, then the report's own 502 problem answers")
    void should_answer_report_problem_when_resolved_given_catch_all_in_application() throws Exception {
        HandlerMethod send = handlerMapping.getHandlerMethods().values().stream()
                .filter(method -> method.getBeanType().equals(AdminReportController.class) && method.getMethod().getName().equals("send"))
                .findFirst()
                .orElseThrow();
        MockHttpServletResponse response = new MockHttpServletResponse();

        exceptionResolver.resolveException(new MockHttpServletRequest("POST", "/api/admin/donations/report/send"), response, send,
                new MonthlyReportNotDelivered(new ReportMonth(YearMonth.of(2026, 9)), new MailSendException("refused")));

        assertThat(response.getStatus()).isEqualTo(502);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("\"type\":\"https://nfnn.cz/problems/donations/report-not-delivered\"");
    }
}
