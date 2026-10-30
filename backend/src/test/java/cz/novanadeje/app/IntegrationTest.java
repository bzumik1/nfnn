package cz.novanadeje.app;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest(properties = {"spring.mail.host=localhost", "spring.mail.port=1", "app.build.revision=f00ba12", "app.donations.receipt.first-year=2025"})
@AutoConfigureMockMvc
@ScheduledWorkOff
@Import(TestcontainersConfiguration.class)
public @interface IntegrationTest {
}
