package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

@TestConfiguration(proxyBeanMethods = false)
@Import({JpaMediaImageRepository.class, JpaNewsArticleRepository.class, JpaProjectRepository.class,
        JpaFormerSlugs.class, JpaAboutSectionRepository.class, JpaDonateBandRepository.class, JpaPersonRepository.class, JpaFoundersNoteRepository.class, JpaPeopleFootnoteRepository.class,
        JpaProjectOrderRepository.class})
public class ContentPersistenceTestConfiguration {
}
