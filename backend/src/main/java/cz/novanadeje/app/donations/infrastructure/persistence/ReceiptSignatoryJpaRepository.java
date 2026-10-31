package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface ReceiptSignatoryJpaRepository extends JpaRepository<ReceiptSignatoryJpaEntity, Short> {

    boolean existsByIdAndPersonId(Short id, UUID personId);
}
