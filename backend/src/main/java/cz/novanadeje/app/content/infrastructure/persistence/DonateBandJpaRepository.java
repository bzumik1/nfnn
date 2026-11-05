package cz.novanadeje.app.content.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface DonateBandJpaRepository extends JpaRepository<DonateBandJpaEntity, Short> {
}
