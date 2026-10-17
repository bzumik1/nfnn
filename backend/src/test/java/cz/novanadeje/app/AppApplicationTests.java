package cz.novanadeje.app;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.donations.fio.token=")
class AppApplicationTests {

	@Test
	void contextLoads() {
	}

}
