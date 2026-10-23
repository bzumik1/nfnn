package cz.novanadeje.app;

import io.github.bzumik1.fio.FioClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.operations.backups.check-cron=-"})
class AppApplicationTests {

	@Test
	void contextLoads() {
	}

	@Test
	@DisplayName("Given an empty FIO_TOKEN, when the application starts, then the Fio client is the disabled one and no import is scheduled")
	void should_leave_fio_import_off_when_started_given_empty_token(ApplicationContext context) throws ClassNotFoundException {
		Class<?> scheduler = Class.forName("cz.novanadeje.app.donations.infrastructure.fio.FioImportScheduler");

		assertThat(context.getBean(FioClient.class).getClass().getSimpleName()).isEqualTo("DisabledFioClient");
		assertThat(context.getBeanNamesForType(scheduler)).isEmpty();
	}

}
