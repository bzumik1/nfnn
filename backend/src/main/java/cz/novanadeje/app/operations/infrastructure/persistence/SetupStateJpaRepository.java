package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface SetupStateJpaRepository extends JpaRepository<SetupStateJpaEntity, Short> {
}
