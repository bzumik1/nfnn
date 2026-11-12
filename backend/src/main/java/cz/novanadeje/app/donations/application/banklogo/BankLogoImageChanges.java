package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import cz.novanadeje.app.shared.domain.UuidV7;

import java.time.Instant;

final class BankLogoImageChanges {

    private BankLogoImageChanges() {
    }

    static BankLogo apply(BankLogoRepository logos, BankLogo locked, BankLogoSource source, FetchedBankLogo fetched, Instant now) {
        if (locked.holds(fetched.sha256())) {
            BankLogo kept = locked.unchangedFrom(source, now);
            logos.save(kept);
            return kept;
        }
        StoredBankLogoImage image = new StoredBankLogoImage(new BankLogoImageId(UuidV7.generate(now)), fetched.sha256());
        logos.storeImage(image, fetched.webp());
        BankLogo changed = locked.fetchedFrom(source, image, now);
        logos.save(changed);
        locked.image().map(StoredBankLogoImage::id).ifPresent(logos::deleteImage);
        return changed;
    }
}
