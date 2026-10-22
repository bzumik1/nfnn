package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.BankTransactionId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
class JpaBankPaymentRepository implements BankPaymentRepository {

    private final BankPaymentJpaRepository jpa;

    JpaBankPaymentRepository(BankPaymentJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void saveAll(List<BankPayment> payments) {
        jpa.saveAll(payments.stream().map(BankPaymentJpaEntity::fromDomain).toList());
    }

    @Override
    public Set<BankTransactionId> findKnownTransactionIds(Collection<BankTransactionId> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return jpa.findTransactionIdsIn(ids.stream().map(BankTransactionId::value).collect(Collectors.toSet())).stream()
                .map(BankTransactionId::new)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public Optional<BankPayment> findById(BankPaymentId id) {
        return jpa.findById(id.value()).map(BankPaymentJpaEntity::toDomain);
    }

    @Override
    public List<BankPayment> findUnpairedOrderedByBooking() {
        return toDomain(jpa.findUnpairedOrderByBooking());
    }

    @Override
    public List<BankPayment> findUnpairedByMatchingVariableSymbol(VariableSymbol symbol) {
        return toDomain(jpa.findUnpairedByMatchingVariableSymbol(symbol.value()));
    }

    @Override
    public List<BankPayment> findUnpairedWithoutSymbolBySenderAccount(SenderAccount account) {
        return toDomain(jpa.findUnpairedWithoutSymbolBySenderAccount(account.accountNumber(), account.bankCode()));
    }

    @Override
    public List<BankPayment> findUnpairedBySenderAccountAndMatchingVariableSymbol(SenderAccount account, VariableSymbol symbol) {
        return toDomain(jpa.findUnpairedBySenderAccountAndMatchingVariableSymbol(account.accountNumber(), account.bankCode(), symbol.value()));
    }

    @Override
    public List<BankPayment> findBySenderAccount(SenderAccount account) {
        return toDomain(jpa.findBySenderAccountNumberAndSenderBankCodeOrderByBookedOnAscTransactionIdAsc(account.accountNumber(),
                account.bankCode()));
    }

    @Override
    public List<BankPayment> findByIds(Collection<BankPaymentId> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return toDomain(jpa.findAllById(ids.stream().map(BankPaymentId::value).collect(Collectors.toSet())));
    }

    @Override
    public List<BankPayment> findUnpairedBookedBetween(LocalDate firstDay, LocalDate lastDay) {
        return toDomain(jpa.findUnpairedBookedBetween(firstDay, lastDay));
    }

    private static List<BankPayment> toDomain(List<BankPaymentJpaEntity> entities) {
        return entities.stream().map(BankPaymentJpaEntity::toDomain).toList();
    }
}
