package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface BankCodeJpaRepository extends JpaRepository<BankCodeJpaEntity, String> {

    List<BankCodeJpaEntity> findAllByOrderByCodeAsc();
}
