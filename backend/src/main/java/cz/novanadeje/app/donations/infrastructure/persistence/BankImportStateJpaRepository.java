package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BankImportStateJpaRepository extends JpaRepository<BankImportStateJpaEntity, Short> {
}
