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
@SpringBootTest(properties = {"spring.mail.host=localhost", "spring.mail.port=1", "app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
@AutoConfigureMockMvc
class HealthEndpointTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	@DisplayName("Given a running database and an unreachable mail server, when an anonymous client asks for health, then the application reports UP")
	void should_report_up_when_mail_server_is_unreachable() throws Exception {
		mockMvc.perform(get("/actuator/health"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"));
	}

}
