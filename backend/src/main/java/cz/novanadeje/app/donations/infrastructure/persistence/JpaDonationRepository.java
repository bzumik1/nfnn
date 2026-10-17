package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
class JpaDonationRepository implements DonationRepository {

    private final DonationJpaRepository jpa;

    JpaDonationRepository(DonationJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(Donation donation) {
        jpa.saveAndFlush(DonationJpaEntity.fromDomain(donation));
    }

    @Override
    public boolean existsForBankPayment(BankPaymentId bankPayment) {
        return jpa.existsByBankPaymentId(bankPayment.value());
    }

    @Override
    public List<Donation> findByDonorOrderedByReceivedOnDesc(DonorReference donor) {
        return jpa.findByDonorIdOrderByReceivedOnDesc(donor.value()).stream().map(DonationJpaEntity::toDomain).toList();
    }
}
