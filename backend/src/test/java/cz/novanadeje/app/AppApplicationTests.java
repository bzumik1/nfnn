package cz.novanadeje.app;

import io.github.bzumik1.fio.FioClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class AppApplicationTests {

	@Test
	@DisplayName("Given the test configuration, when the application starts, then its context loads")
	void should_load_context_when_started_given_test_configuration() {
	}

	@Test
	@DisplayName("Given an empty FIO_TOKEN, when the application starts, then the Fio client is the disabled one and no import is scheduled")
	void should_leave_fio_import_off_when_started_given_empty_token(ApplicationContext context) throws ClassNotFoundException {
		Class<?> scheduler = Class.forName("cz.novanadeje.app.donations.infrastructure.fio.FioImportScheduler");

		assertThat(context.getBean(FioClient.class).getClass().getSimpleName()).isEqualTo("DisabledFioClient");
		assertThat(context.getBeanNamesForType(scheduler)).isEmpty();
	}

	@Test
	@DisplayName("Given the shared integration test configuration, when the application starts, then every scheduled job is switched off")
	void should_switch_off_every_scheduled_job_when_started_given_shared_configuration(ApplicationContext context) {
		Environment environment = context.getEnvironment();

		assertThat(environment.getProperty("app.donations.fio.token")).isEmpty();
		assertThat(environment.getProperty("app.donations.report.cron")).isEqualTo("-");
		assertThat(environment.getProperty("app.contact.retention.cron")).isEqualTo("-");
		assertThat(environment.getProperty("app.content.media-cleanup.cron")).isEqualTo("-");
		assertThat(environment.getProperty("app.operations.backups.check-cron")).isEqualTo("-");
		assertThat(environment.getProperty("app.donors.registration-reminder.cron")).isEqualTo("-");
	}

}
