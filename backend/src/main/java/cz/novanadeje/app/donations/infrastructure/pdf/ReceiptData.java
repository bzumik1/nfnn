package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;

import java.time.Year;
import java.util.LinkedHashMap;
import java.util.Map;

final class ReceiptData {

    private ReceiptData() {
    }

    static Map<String, Object> of(ReceiptDocument document, ReceiptTexts czech) {
        FoundationIdentity foundation = document.foundation();
        ReceiptParty donor = document.donor();
        ReceiptLine firstLine = document.lines().getFirst();
        boolean single = document.kind() == ReceiptKind.SINGLE;
        String year = document.year().map(Year::toString).orElse(null);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("locale", document.locale().tag());
        data.put("single", single);
        data.put("bilingual", document.locale() == LocaleCode.EN);
        data.put("documentTitle", single ? czech.text("receipt.title.single") : czech.text("receipt.title.yearly", year));
        data.put("year", year);
        data.put("number", document.number().value());
        data.put("issuedOnCs", ReceiptFormats.czechDate(document.issuedOn()));
        data.put("issuedOnEn", ReceiptFormats.englishDate(document.issuedOn()));
        data.put("replaced", document.replaces().isPresent());
        data.put("replacedNumber", document.replaces().map(replaced -> replaced.number().value()).orElse(null));
        data.put("replacedOnCs", document.replaces().map(replaced -> ReceiptFormats.czechDate(replaced.issuedOn())).orElse(null));
        data.put("replacedOnEn", document.replaces().map(replaced -> ReceiptFormats.englishDate(replaced.issuedOn())).orElse(null));
        data.put("foundationName", foundation.name());
        data.put("foundationIdentifier", foundation.companyIdentifier());
        data.put("foundationAddress", foundation.address().singleLine());
        data.put("registryFile", foundation.registryFile());
        data.put("registryCourt", foundation.registryCourt());
        data.put("accountNumber", foundation.bankAccountNumber());
        data.put("issuePlace", foundation.issuePlace());
        data.put("issuePlaceEn", foundation.issuePlaceEn());
        data.put("company", donor.type() == DonorType.COMPANY);
        data.put("donorName", donor.name());
        data.put("donorIdentifier", donor.companyIdentifier().orElse(null));
        data.put("donorAddress", donor.address().singleLine());
        data.put("variableSymbol", donor.variableSymbol().value());
        data.put("giftFormKey", "receipt.gift.form." + firstLine.source().name());
        data.put("receivedOnCs", ReceiptFormats.czechDate(firstLine.receivedOn()));
        data.put("receivedOnEn", ReceiptFormats.englishDate(firstLine.receivedOn()));
        data.put("lines", document.lines().stream().map(ReceiptData::line).toList());
        data.put("count", Integer.toString(document.count()));
        data.put("totalCs", ReceiptFormats.czechAmount(document.total()));
        data.put("totalEn", ReceiptFormats.englishAmount(document.total()));
        data.put("signatoryName", document.signatory().name());
        data.put("signatoryRole", document.signatory().role());
        return data;
    }

    private static Map<String, String> line(ReceiptLine line) {
        Map<String, String> view = new LinkedHashMap<>();
        view.put("receivedOnCs", ReceiptFormats.czechDate(line.receivedOn()));
        view.put("receivedOnEn", ReceiptFormats.englishDate(line.receivedOn()));
        view.put("amountCs", ReceiptFormats.czechAmount(line.amount()));
        view.put("amountEn", ReceiptFormats.englishAmount(line.amount()));
        return view;
    }
}
