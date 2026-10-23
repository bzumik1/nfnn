package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.Year;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

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
    public Optional<Donation> findByBankPayment(BankPaymentId bankPayment) {
        return jpa.findByBankPaymentId(bankPayment.value()).map(DonationJpaEntity::toDomain);
    }

    @Override
    public void delete(DonationId id) {
        jpa.deleteById(id.value());
        jpa.flush();
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

    @Override
    public List<Year> findReceivedYearsNewestFirst() {
        return jpa.findReceivedYearsNewestFirst().stream().map(Year::of).toList();
    }

    @Override
    public List<Donation> findBySymbolClaim(SymbolClaimId claim) {
        return jpa.findBySymbolClaimIdOrderByReceivedOnAscIdAsc(claim.value()).stream().map(DonationJpaEntity::toDomain).toList();
    }

    @Override
    public List<Donation> findBySenderAccountLink(SenderAccountLinkId link) {
        return jpa.findBySenderAccountIdOrderByReceivedOnAscIdAsc(link.value()).stream().map(DonationJpaEntity::toDomain).toList();
    }

    @Override
    public Map<SymbolClaimId, Long> countBySymbolClaims(Collection<SymbolClaimId> claims) {
        if (claims.isEmpty()) {
            return Map.of();
        }
        return jpa.countBySymbolClaimIds(claims.stream().map(SymbolClaimId::value).collect(Collectors.toSet())).stream()
                .collect(Collectors.toUnmodifiableMap(row -> new SymbolClaimId((UUID) row[0]), row -> (Long) row[1]));
    }
}
