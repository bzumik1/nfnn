package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.domain.donation.DonationSource;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.PostalAddress;

import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.SortedMap;

public record FrozenReceiptResponse(int schemaVersion, ReceiptKind kind, String number, LocalDate issuedOn, String locale, Integer year,
                             ReplacedResponse replaces, FoundationResponse foundation, DonorResponse donor, List<GiftResponse> gifts,
                             AmountResponse total, SignatoryResponse signatory, TextsResponse texts, VerificationResponse verification) {

    public static FrozenReceiptResponse from(FrozenReceipt frozen) {
        ReceiptDocument document = frozen.document();
        return new FrozenReceiptResponse(frozen.schemaVersion(), document.kind(), document.number().value(), document.issuedOn(),
                document.locale().tag(), document.year().map(Year::getValue).orElse(null),
                document.replaces().map(replaced -> new ReplacedResponse(replaced.number().value(), replaced.issuedOn())).orElse(null),
                FoundationResponse.from(document.foundation()), DonorResponse.from(document.donor()),
                document.lines().stream().map(line -> new GiftResponse(line.receivedOn(), line.amount().amountMinor(), line.source())).toList(),
                new AmountResponse(document.total().amountMinor(), document.total().currency().name()),
                new SignatoryResponse(document.signatory().name(), document.signatory().role(),
                        frozen.signatureImage().map(ImageResponse::of).orElse(null)),
                new TextsResponse(frozen.texts().czech(), frozen.texts().english().orElse(null)),
                new VerificationResponse(frozen.verification().keyId().value(), frozen.verification().qrText()));
    }

    public record ReplacedResponse(String number, LocalDate issuedOn) {
    }

    public record AddressResponse(String street, String city, String postalCode) {

        static AddressResponse from(PostalAddress address) {
            return new AddressResponse(address.street(), address.city(), address.postalCode());
        }
    }

    public record FoundationResponse(String name, String companyIdentifier, AddressResponse address, String registryCourt, String registryFile,
                              String bankAccountNumber, String issuePlace, String issuePlaceEn) {

        static FoundationResponse from(FoundationIdentity foundation) {
            return new FoundationResponse(foundation.name(), foundation.companyIdentifier(), AddressResponse.from(foundation.address()),
                    foundation.registryCourt(), foundation.registryFile(), foundation.bankAccountNumber(), foundation.issuePlace(),
                    foundation.issuePlaceEn());
        }
    }

    public record DonorResponse(DonorType type, String name, String companyIdentifier, AddressResponse address, String variableSymbol) {

        static DonorResponse from(ReceiptParty donor) {
            return new DonorResponse(donor.type(), donor.name(), donor.companyIdentifier().orElse(null), AddressResponse.from(donor.address()),
                    donor.variableSymbol().value());
        }
    }

    public record GiftResponse(LocalDate receivedOn, long amountMinor, DonationSource source) {
    }

    public record AmountResponse(long amountMinor, String currency) {
    }

    public record ImageResponse(String sha256) {

        static ImageResponse of(ContentDigest digest) {
            return new ImageResponse(digest.value());
        }
    }

    public record SignatoryResponse(String name, String role, ImageResponse signatureImage) {
    }

    public record TextsResponse(SortedMap<String, String> cs, SortedMap<String, String> en) {
    }

    public record VerificationResponse(String keyId, String qrText) {
    }
}
