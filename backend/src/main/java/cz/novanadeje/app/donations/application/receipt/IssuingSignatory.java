package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.ReceiptImageRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryMissing;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.donations.domain.receipt.StoredReceiptImage;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

@Component
public class IssuingSignatory {

    private final ReceiptSignatoryRepository signatories;
    private final ReceiptSignatureRepository signatures;
    private final ReceiptImageRepository images;
    private final FoundationPeople people;

    public IssuingSignatory(ReceiptSignatoryRepository signatories, ReceiptSignatureRepository signatures, ReceiptImageRepository images,
                            FoundationPeople people) {
        this.signatories = signatories;
        this.signatures = signatures;
        this.images = images;
        this.people = people;
    }

    public SignatoryAtIssue resolve(Instant at) {
        ReceiptSignatory chosen = signatories.current().orElseThrow(ReceiptSignatoryMissing::new);
        FoundationPerson person = people.find(chosen.person().value()).orElseThrow(ReceiptSignatoryMissing::new);
        Optional<ContentDigest> portrait = people.printPortraitOf(person.id()).map(print -> stored(print, at));
        return new SignatoryAtIssue(new Signatory(person.name(), chosen.receiptRole()), signatures.digestOf(chosen.person()), portrait);
    }

    private ContentDigest stored(PrintPortrait portrait, Instant at) {
        StoredReceiptImage image = new StoredReceiptImage(portrait.jpeg(), PrintPortrait.MEDIA_TYPE);
        images.storeIfAbsent(image, at);
        return image.digest();
    }
}
