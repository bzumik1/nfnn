package cz.novanadeje.app.donors.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface SecondFactorJpaRepository extends JpaRepository<SecondFactorJpaEntity, UUID> {
}
