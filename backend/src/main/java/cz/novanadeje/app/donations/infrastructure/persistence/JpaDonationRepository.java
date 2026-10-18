package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

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
    public List<Donation> findByDonorNewestFirst(DonorReference donor) {
        return jpa.findByDonorIdOrderByReceivedOnDescRecordedAtDescIdDesc(donor.value()).stream().map(DonationJpaEntity::toDomain).toList();
    }

    @Override
    public Optional<Donation> findByIdForDonor(DonationId id, DonorReference donor) {
        return jpa.findByIdAndDonorId(id.value(), donor.value()).map(DonationJpaEntity::toDomain);
    }

    @Override
    public List<Donation> findReceivedOnBetween(LocalDate firstDay, LocalDate lastDay) {
        return jpa.findByReceivedOnBetween(firstDay, lastDay).stream().map(DonationJpaEntity::toDomain).toList();
    }
}
