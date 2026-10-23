package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.support.TestSupportConfiguration;
import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@CucumberContextConfiguration
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.operations.backups.check-cron=-",
        "app.donations.pairing.excluded-accounts=2400000002/2010", "app.operations.backups.directory=build/cucumber/backups",
        "app.operations.backups.restore-directory=build/cucumber/restore"})
@Import({TestcontainersConfiguration.class, TestSupportConfiguration.class})
public class CucumberSpringConfiguration {
}
