package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.ScheduledWorkOff;
import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.support.TestSupportConfiguration;
import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@CucumberContextConfiguration
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"PAIRING_EXCLUDED_ACCOUNTS=2400000002/2010",
        "app.operations.backups.directory=build/cucumber/fork-${org.gradle.test.worker:0}/backups",
        "app.operations.backups.restore-directory=build/cucumber/fork-${org.gradle.test.worker:0}/restore",
        "app.operations.logs.directory=build/cucumber/fork-${org.gradle.test.worker:0}/logs"})
@ScheduledWorkOff
@Import({TestcontainersConfiguration.class, TestSupportConfiguration.class})
public class CucumberSpringConfiguration {
}
