package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPersonNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryNeedsRenaming;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryUnprintable;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.domain.PrintableText;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class ReceiptSignatoryService {

    static final String CHOOSE_ACTION = "CHOOSE_RECEIPT_SIGNATORY";

    private static final Logger log = LoggerFactory.getLogger(ReceiptSignatoryService.class);

    private final ReceiptSignatoryRepository signatories;
    private final FoundationPeople people;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReceiptSignatoryService(ReceiptSignatoryRepository signatories, FoundationPeople people, ApplicationEventPublisher events, Clock clock) {
        this.signatories = signatories;
        this.people = people;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ReceiptSignatoryView view() {
        return new ReceiptSignatoryView(signatories.current().flatMap(this::view));
    }

    @Transactional
    public ChosenSignatoryView choose(UUID adminId, PersonReference person, String receiptRole) {
        FoundationPerson known = people.findForUpdate(person.value()).orElseThrow(() -> new ReceiptPersonNotFound(person));
        if (known.needsCorrection()) {
            throw new ReceiptSignatoryNeedsRenaming(person);
        }
        if (!PrintableText.prints(known.name())) {
            throw new ReceiptSignatoryUnprintable(person);
        }
        Instant now = clock.instant();
        ReceiptSignatory chosen = new ReceiptSignatory(person, receiptRole, now);
        signatories.choose(chosen);
        events.publishEvent(new AdminActionPerformed(adminId, CHOOSE_ACTION, Optional.empty(),
                "Potvrzení o daru podepisuje osoba " + person, now));
        AfterCommit.run(() -> log.info("Admin {} chose person {} to sign the receipts", adminId, person));
        return view(chosen, known);
    }

    private Optional<ChosenSignatoryView> view(ReceiptSignatory chosen) {
        return people.find(chosen.person().value()).map(person -> view(chosen, person));
    }

    private ChosenSignatoryView view(ReceiptSignatory chosen, FoundationPerson person) {
        boolean printable = person.hasPortrait() && people.printPortraitOf(chosen.person().value()).isPresent();
        boolean signed = people.printSignatureOf(chosen.person().value()).isPresent();
        return new ChosenSignatoryView(chosen.person(), person.name(), chosen.receiptRole(), chosen.chosenAt(), person.hasPortrait(), printable,
                signed);
    }
}
