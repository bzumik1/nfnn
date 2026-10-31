package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.PrintableText;
import cz.novanadeje.app.shared.domain.error.Conflict;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public class ReceiptUnprintable extends Conflict {

    public static final String CODE = "donations/receipt-unprintable";

    public ReceiptUnprintable(DonorReference donor) {
        super(CODE, "The printed data of the receipt for donor " + donor + " holds a character outside the printable set, so no receipt is numbered");
    }

    public static void refuseUnlessPrintable(DonorRecord record, FoundationIdentity foundation, Signatory signatory) {
        List<String> printed = new ArrayList<>();
        printed.add(record.name());
        record.companyIdentifier().ifPresent(printed::add);
        printed.addAll(lines(record.address()));
        printed.addAll(List.of(foundation.name(), foundation.companyIdentifier(), foundation.registryCourt(), foundation.registryFile(),
                foundation.bankAccountNumber(), foundation.issuePlace(), foundation.issuePlaceEn()));
        printed.addAll(lines(foundation.address()));
        printed.addAll(List.of(signatory.name(), signatory.role(), record.variableSymbol().value()));
        if (!printed.stream().allMatch(PrintableText::prints)) {
            throw new ReceiptUnprintable(record.id());
        }
    }

    private static List<String> lines(PostalAddress address) {
        return Stream.of(address.street(), address.city(), address.postalCode()).toList();
    }
}
