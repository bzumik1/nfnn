package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

record BankLogoRow(String code, String sourceUrl, UUID imageId, String sha256, Instant fetchedAt, Instant checkedAt, String lastFailure) {

    BankLogo toDomain() {
        BankCode bank = new BankCode(code);
        Optional<StoredBankLogoImage> image = Optional.ofNullable(imageId).map(id -> new StoredBankLogoImage(new BankLogoImageId(id), sha256));
        return new BankLogo(bank, new BankLogoSource(bank, sourceUrl), image, Optional.ofNullable(fetchedAt), Optional.ofNullable(checkedAt),
                Optional.ofNullable(lastFailure).map(BankLogoFailure::ofWord));
    }
}
