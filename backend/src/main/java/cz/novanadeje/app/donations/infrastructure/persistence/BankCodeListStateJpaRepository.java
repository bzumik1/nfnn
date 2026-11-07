package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface BankCodeListStateJpaRepository extends JpaRepository<BankCodeListStateJpaEntity, Short> {
}
