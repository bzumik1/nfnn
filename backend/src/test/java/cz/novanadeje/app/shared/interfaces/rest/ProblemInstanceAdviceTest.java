package cz.novanadeje.app.shared.interfaces.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProblemInstanceAdviceTest {

    private MockMvc mockMvc;

    @RestController
    static class ProbeController {

        @GetMapping("/probe/{id}/refused")
        String refused(@PathVariable String id) {
            throw new ErrorResponseException(HttpStatus.CONFLICT);
        }

        @GetMapping("/probe/returned")
        ResponseEntity<ProblemDetail> returned() {
            return ResponseEntity.status(HttpStatus.GONE).body(ProblemDetail.forStatus(HttpStatus.GONE));
        }

        @GetMapping("/probe/named")
        ResponseEntity<ProblemDetail> named() {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.GONE);
            problem.setInstance(URI.create("/elsewhere"));
            return ResponseEntity.status(HttpStatus.GONE).body(problem);
        }

        @GetMapping("/probe/text")
        String text() {
            return "{\"status\":200}";
        }
    }

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        ApiExceptionHandler handler = new ApiExceptionHandler();
        handler.setMessageSource(messages);
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(handler, new ProblemInstanceAdvice())
                .build();
    }

    @Test
    @DisplayName("Given a handler that throws an error response, when requested with a query, then the problem's instance is the request path without the query")
    void should_set_instance_to_request_path_when_handler_throws_given_query() throws Exception {
        mockMvc.perform(get("/probe/7/refused").queryParam("token", "abc"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.instance").value("/probe/7/refused"));
    }

    @Test
    @DisplayName("Given a handler that returns a problem without an instance, when requested, then the problem's instance is the request path")
    void should_set_instance_to_request_path_when_problem_returned_given_no_instance() throws Exception {
        mockMvc.perform(get("/probe/returned"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.instance").value("/probe/returned"));
    }

    @Test
    @DisplayName("Given a handler that returns a problem naming its own instance, when requested, then that instance stays")
    void should_keep_instance_when_problem_returned_given_own_instance() throws Exception {
        mockMvc.perform(get("/probe/named"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.instance").value("/elsewhere"));
    }

    @Test
    @DisplayName("Given a handler that answers something other than a problem, when requested, then the answer stays as it was")
    void should_leave_answer_when_body_is_no_problem() throws Exception {
        mockMvc.perform(get("/probe/text"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.instance").doesNotExist());
    }
}
