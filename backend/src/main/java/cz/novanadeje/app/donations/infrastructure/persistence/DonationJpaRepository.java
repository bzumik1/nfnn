package cz.novanadeje.app.donations.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DonationJpaRepository extends JpaRepository<DonationJpaEntity, UUID> {

    boolean existsByBankPaymentId(UUID bankPaymentId);

    List<DonationJpaEntity> findByDonorIdOrderByReceivedOnDescRecordedAtDesc(UUID donorId);
}
