package cz.novanadeje.app;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class InfoEndpointTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("Given the image revision, when an anonymous client asks for info, then it names the revision")
	void should_report_revision_when_info_is_asked() throws Exception {
		mockMvc.perform(get("/actuator/info"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.build.revision").value("f00ba12"));
	}

	@Test
	@DisplayName("Given no release, when an anonymous client asks for info, then it names the dev release")
	void should_report_dev_release_when_info_is_asked_given_no_release() throws Exception {
		mockMvc.perform(get("/actuator/info"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.build.version").value("dev"));
	}

}
