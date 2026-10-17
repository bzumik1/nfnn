package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.support.TestSupportConfiguration;
import io.cucumber.spring.CucumberContextConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@CucumberContextConfiguration
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "app.donations.fio.token=")
@Import({TestcontainersConfiguration.class, TestSupportConfiguration.class})
public class CucumberSpringConfiguration {
}
