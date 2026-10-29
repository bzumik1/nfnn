package cz.novanadeje.app.operations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface CarriedSettingsKeyJpaRepository extends JpaRepository<CarriedSettingsKeyJpaEntity, Short> {
}
