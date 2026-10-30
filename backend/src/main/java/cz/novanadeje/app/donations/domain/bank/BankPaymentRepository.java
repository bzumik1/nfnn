package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface BankPaymentRepository {

    void saveAll(List<BankPayment> payments);

    void save(BankPayment payment);

    Set<BankTransactionId> findKnownTransactionIds(Collection<BankTransactionId> ids);

    Optional<BankPayment> findById(BankPaymentId id);

    List<BankPayment> findUnpairedOrderedByBooking();

    List<BankPayment> findUnpairedNewestFirst();

    List<BankPayment> findUnpairedByMatchingVariableSymbol(VariableSymbol symbol);

    List<BankPayment> findUnpairedWithoutSymbolBySenderAccount(SenderAccount account);

    List<BankPayment> findUnpairedBySenderAccountAndMatchingVariableSymbol(SenderAccount account, VariableSymbol symbol);

    List<BankPayment> findBySenderAccount(SenderAccount account);

    List<BankPayment> findByIds(Collection<BankPaymentId> ids);

    List<BankPayment> findUnpairedBookedBetween(LocalDate firstDay, LocalDate lastDay);

    List<Year> findBookedYearsNewestFirst();

    List<BankPayment> findImportedSince(Instant from);

    List<BankPayment> findUnpairedImportedSince(Instant from);
}
