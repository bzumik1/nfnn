package cz.novanadeje.app;

import org.springframework.boot.SpringApplication;

public class TestAppApplication {

	public static void main(String[] args) {
		SpringApplication.from(AppApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
