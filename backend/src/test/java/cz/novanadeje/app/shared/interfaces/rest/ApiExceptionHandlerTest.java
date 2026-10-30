package cz.novanadeje.app.shared.interfaces.rest;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApiExceptionHandlerTest {

    private MockMvc mockMvc;

    @RestController
    static class ProbeController {

        @GetMapping("/probe")
        String probe(@RequestParam @Min(1) @Max(10) long amount, @RequestParam(required = false) @Pattern(regexp = "[0-9]{1,3}") String code) {
            return "ok";
        }

        @GetMapping("/probe-order")
        String probeOrder(@RequestParam(required = false) @Min(value = 1, message = "Zeta je malá.") Long zeta,
                          @RequestParam(required = false) @Min(value = 1, message = "Alfa je malá.") Long alpha,
                          @RequestParam(required = false) @Size(min = 3, message = "Slovo je krátké.") @Pattern(regexp = "[a-z]*", message = "Slovo je krátké.") String word) {
            return "ok";
        }

        @PostMapping("/probe-body")
        String probeBody(@Valid @RequestBody ProbeBody body) {
            return "ok";
        }
    }

    record ProbeBody(
            @Min(value = 1, message = "Zeta je malá.") Long zeta,
            @Size(min = 3, message = "Pozdější text.") @Pattern(regexp = "[a-z]*", message = "Dřívější text.") String alpha,
            @Size(min = 3, message = "Slovo je krátké.") @Pattern(regexp = "[a-z]*", message = "Slovo je krátké.") String word) {
    }

    @BeforeEach
    void setUp() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        ApiExceptionHandler handler = new ApiExceptionHandler();
        handler.setMessageSource(messages);
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(handler)
                .setValidator(validator)
                .build();
    }

    @Test
    @DisplayName("Given a query parameter outside its constraints, when requested, then the answer is a validation problem naming that parameter")
    void should_list_parameter_when_request_param_violates_constraint() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech("/probe").param("amount", "0").param("code", "12345")))
                .andExpect(jsonPath("$.errors", hasSize(2)))
                .andExpect(jsonPath("$.errors[*].field", hasItem("amount")))
                .andExpect(jsonPath("$.errors[*].field", hasItem("code")));
    }

    @Test
    @DisplayName("Given a query parameter of the wrong type, when requested, then the answer is a validation problem naming that parameter")
    void should_list_parameter_when_request_param_has_wrong_type() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech("/probe").param("amount", "abc")))
                .andExpect(jsonPath("$.errors[0].field").value("amount"))
                .andExpect(jsonPath("$.errors[0].message").value("Hodnota má nesprávný formát."));
    }

    @Test
    @DisplayName("Given a required query parameter is missing, when requested, then the answer is a validation problem naming that parameter")
    void should_list_parameter_when_required_request_param_is_missing() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech("/probe")))
                .andExpect(jsonPath("$.errors[0].field").value("amount"))
                .andExpect(jsonPath("$.errors[0].message").value("Hodnota je povinná."));
    }

    @Test
    @DisplayName("Given an English client, when a query parameter is invalid, then the problem title is in English")
    void should_answer_in_english_when_request_param_is_invalid_given_english_locale() throws Exception {
        mockMvc.perform(get("/probe").param("amount", "abc").header("Accept-Language", "en"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid data"))
                .andExpect(jsonPath("$.errors[0].message").value("The value has an invalid format."));
    }

    @Test
    @DisplayName("Given a body field that fails two constraints with the same text, when posted, then the problem lists that text once")
    void should_list_text_once_when_posted_given_body_field_failing_two_constraints_with_same_text() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech(post("/probe-body")).contentType(MediaType.APPLICATION_JSON).content("{\"word\":\"1\"}")))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value("word"))
                .andExpect(jsonPath("$.errors[0].message").value("Slovo je krátké."));
    }

    @Test
    @DisplayName("Given body fields that fail in any order, when posted, then the problem lists the errors by field and then by text")
    void should_sort_errors_by_field_and_text_when_posted_given_body_fields_failing() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech(post("/probe-body")).contentType(MediaType.APPLICATION_JSON).content("{\"zeta\":0,\"alpha\":\"1\"}")))
                .andExpect(jsonPath("$.errors", hasSize(3)))
                .andExpect(jsonPath("$.errors[0].field").value("alpha"))
                .andExpect(jsonPath("$.errors[0].message").value("Dřívější text."))
                .andExpect(jsonPath("$.errors[1].field").value("alpha"))
                .andExpect(jsonPath("$.errors[1].message").value("Pozdější text."))
                .andExpect(jsonPath("$.errors[2].field").value("zeta"));
    }

    @Test
    @DisplayName("Given a query parameter that fails two constraints with the same text, when requested, then the problem lists that text once")
    void should_list_text_once_when_requested_given_parameter_failing_two_constraints_with_same_text() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech("/probe-order").param("word", "1")))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].message").value("Slovo je krátké."));
    }

    @Test
    @DisplayName("Given query parameters declared out of order, when both fail, then the problem lists them by field")
    void should_sort_errors_by_field_when_requested_given_parameters_failing_out_of_order() throws Exception {
        expectValidationProblem(mockMvc.perform(inCzech("/probe-order").param("zeta", "0").param("alpha", "0")))
                .andExpect(jsonPath("$.errors", hasSize(2)))
                .andExpect(jsonPath("$.errors[0].field").value("alpha"))
                .andExpect(jsonPath("$.errors[1].field").value("zeta"));
    }

    private static MockHttpServletRequestBuilder inCzech(MockHttpServletRequestBuilder request) {
        return request.header("Accept-Language", "cs");
    }

    private static MockHttpServletRequestBuilder inCzech(String path) {
        return inCzech(get(path));
    }

    private ResultActions expectValidationProblem(ResultActions result) throws Exception {
        return result
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.type").value("https://nfnn.cz/problems/validation"))
                .andExpect(jsonPath("$.title").value("Neplatné údaje"))
                .andExpect(jsonPath("$.detail").value("Zkontrolujte prosím označená pole."));
    }
}
