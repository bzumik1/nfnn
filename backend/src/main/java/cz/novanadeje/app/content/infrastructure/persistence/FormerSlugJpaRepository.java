package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface FormerSlugJpaRepository extends JpaRepository<FormerSlugJpaEntity, String> {
}
