package cz.novanadeje.app.shared.infrastructure.audit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface AdminActionJpaRepository extends JpaRepository<AdminActionJpaEntity, UUID> {
}
