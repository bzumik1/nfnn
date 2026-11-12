package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

interface FormerSlugJpaRepository extends JpaRepository<FormerSlugJpaEntity, UUID> {

    Optional<FormerSlugJpaEntity> findBySlugAndNewsIdIsNotNull(String slug);

    Optional<FormerSlugJpaEntity> findBySlugAndProjectIdIsNotNull(String slug);

    void deleteBySlugAndNewsIdIsNotNull(String slug);

    void deleteBySlugAndProjectIdIsNotNull(String slug);
}
