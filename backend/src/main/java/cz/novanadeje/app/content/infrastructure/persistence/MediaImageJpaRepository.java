package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface MediaImageJpaRepository extends JpaRepository<MediaImageJpaEntity, UUID> {
}
