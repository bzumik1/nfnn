package cz.novanadeje.app.donations.domain.bank;

import cz.novanadeje.app.shared.domain.VariableSymbol;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface BankPaymentRepository {

    void saveAll(List<BankPayment> payments);

    Set<BankTransactionId> findKnownTransactionIds(Collection<BankTransactionId> ids);

    Optional<BankPayment> findById(BankPaymentId id);

    List<BankPayment> findUnpairedOrderedByBooking();

    List<BankPayment> findUnpairedByMatchingVariableSymbol(VariableSymbol symbol);

    List<BankPayment> findUnpairedWithoutSymbolBySenderAccount(SenderAccount account);
}
