package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.bankaccount.BankAccountView;
import cz.novanadeje.app.donations.application.sync.DonorSyncSnapshot;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.receipt.DonationReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Component
class DonorSyncProjection {

    static final String DONATIONS = "donations:";
    static final String RECEIPTS = "receipts:";
    static final String BANK_ACCOUNTS = "bank-accounts";
    static final String SYMBOL_CLAIMS = "symbol-claims";

    private static final Comparator<BankAccountView> BY_ACCOUNT_THEN_CREATION = Comparator
            .comparing((BankAccountView view) -> view.link().account().display())
            .thenComparing(view -> view.link().createdAt())
            .thenComparing(view -> view.link().id().value().toString());
    private static final Comparator<SymbolClaim> BY_ACCOUNT_THEN_SYMBOL = Comparator
            .comparing((SymbolClaim claim) -> claim.account().display())
            .thenComparing(claim -> claim.symbol().value())
            .thenComparing(claim -> claim.id().value().toString());

    private final JsonMapper json;

    DonorSyncProjection(JsonMapper json) {
        this.json = json;
    }

    List<SyncChunk> chunksOf(DonorSyncSnapshot snapshot) {
        SortedMap<String, List<Object>> chunks = new TreeMap<>();
        snapshot.donations().forEach(donation -> rowsOf(chunks, DONATIONS + donation.receivedYear().getValue()).add(SyncRows.DonationRow.from(donation)));
        snapshot.receipts().forEach(receipt -> rowsOf(chunks, RECEIPTS + yearOf(receipt).getValue()).add(DonorReceiptResponse.from(receipt)));
        snapshot.bankAccounts().stream()
                .sorted(BY_ACCOUNT_THEN_CREATION)
                .forEach(view -> rowsOf(chunks, BANK_ACCOUNTS).add(SyncRows.BankAccountRow.from(view)));
        snapshot.symbolClaims().stream()
                .sorted(BY_ACCOUNT_THEN_SYMBOL)
                .forEach(claim -> rowsOf(chunks, SYMBOL_CLAIMS).add(SyncRows.SymbolClaimRow.from(claim)));
        return chunks.entrySet().stream().map(chunk -> SyncChunk.of(chunk.getKey(), json.valueToTree(chunk.getValue()))).toList();
    }

    private static List<Object> rowsOf(SortedMap<String, List<Object>> chunks, String id) {
        return chunks.computeIfAbsent(id, ignored -> new ArrayList<>());
    }

    private static Year yearOf(DonationReceipt receipt) {
        return receipt.year().orElseGet(() -> receipt.frozen().document().lines().stream()
                .map(ReceiptLine::receivedOn)
                .map(Year::from)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("A single receipt certifies one gift")));
    }
}
