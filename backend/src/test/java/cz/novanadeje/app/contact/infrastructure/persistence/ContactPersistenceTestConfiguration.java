package cz.novanadeje.app.contact.infrastructure.persistence;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import(JpaContactMessageRepository.class)
public class ContactPersistenceTestConfiguration {
}
