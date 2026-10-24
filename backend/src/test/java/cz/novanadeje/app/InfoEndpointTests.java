package cz.novanadeje.app;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"spring.mail.host=localhost", "spring.mail.port=1", "app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-", "app.build.revision=f00ba12"})
@AutoConfigureMockMvc
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

}
