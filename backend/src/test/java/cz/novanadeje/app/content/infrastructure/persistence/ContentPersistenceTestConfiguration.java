package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({TestcontainersConfiguration.class, JpaMediaImageRepository.class, JpaNewsArticleRepository.class})
class ContentPersistenceTestConfiguration {
}
