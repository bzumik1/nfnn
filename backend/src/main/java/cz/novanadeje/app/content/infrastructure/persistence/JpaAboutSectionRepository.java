package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.about.AboutSection;
import cz.novanadeje.app.content.domain.about.AboutSectionRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaAboutSectionRepository implements AboutSectionRepository {

    private final AboutSectionJpaRepository jpa;

    JpaAboutSectionRepository(AboutSectionJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<AboutSection> find() {
        return jpa.findById(AboutSectionJpaEntity.SINGLETON_ID).map(AboutSectionJpaEntity::toDomain);
    }

    @Override
    public void save(AboutSection section) {
        jpa.save(AboutSectionJpaEntity.fromDomain(section));
    }
}
