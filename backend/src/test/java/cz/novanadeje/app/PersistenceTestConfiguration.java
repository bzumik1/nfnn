package cz.novanadeje.app;

import cz.novanadeje.app.contact.infrastructure.persistence.ContactPersistenceTestConfiguration;
import cz.novanadeje.app.content.infrastructure.persistence.ContentPersistenceTestConfiguration;
import cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration;
import cz.novanadeje.app.donors.infrastructure.persistence.DonorsPersistenceTestConfiguration;
import cz.novanadeje.app.operations.infrastructure.persistence.OperationsPersistenceTestConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({TestcontainersConfiguration.class, ContactPersistenceTestConfiguration.class, ContentPersistenceTestConfiguration.class,
        BankPersistenceTestConfiguration.class, DonorsPersistenceTestConfiguration.class, OperationsPersistenceTestConfiguration.class})
public class PersistenceTestConfiguration {
}
