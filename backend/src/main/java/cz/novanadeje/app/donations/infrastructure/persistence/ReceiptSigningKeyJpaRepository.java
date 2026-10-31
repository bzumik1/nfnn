package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

interface ReceiptSigningKeyJpaRepository extends JpaRepository<ReceiptSigningKeyJpaEntity, String> {
}
