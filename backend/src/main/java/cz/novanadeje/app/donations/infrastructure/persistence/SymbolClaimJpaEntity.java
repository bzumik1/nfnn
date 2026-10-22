package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_symbol_claim")
public class SymbolClaimJpaEntity {

    @Id
    private UUID id;

    @Column(name = "donor_id", nullable = false)
    private UUID donorId;

    @Column(name = "account_number", nullable = false, length = SenderAccount.MAX_ACCOUNT_NUMBER_LENGTH)
    private String accountNumber;

    @Column(name = "bank_code", nullable = false, length = SenderAccount.BANK_CODE_LENGTH)
    private String bankCode;

    @Column(name = "variable_symbol", nullable = false, length = VariableSymbol.MAX_LENGTH)
    private String variableSymbol;

    @Enumerated(EnumType.STRING)
    @Column(name = "answer", nullable = false, length = 16)
    private SymbolClaimAnswer answer;

    @Column(name = "answered_at", nullable = false)
    private Instant answeredAt;

    protected SymbolClaimJpaEntity() {
    }

    SymbolClaim toDomain() {
        return SymbolClaim.reconstitute(
                new SymbolClaimId(id),
                new DonorReference(donorId),
                new SenderAccount(accountNumber, bankCode),
                new VariableSymbol(variableSymbol),
                answer,
                answeredAt);
    }
}
