package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankName;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public record BankLogoAdminRow(String code, String bankName, String sourceUrl, String version, UUID imageId, String imageSha256, Instant fetchedAt,
                               Instant checkedAt, String lastFailure) {

    static BankLogoAdminRow of(BankLogo logo, Optional<BankName> bankName, String version) {
        return new BankLogoAdminRow(logo.code().value(), bankName.map(BankName::value).orElse(null), logo.source().url(), version,
                logo.image().map(image -> image.id().value()).orElse(null), logo.image().map(StoredBankLogoImage::sha256).orElse(null),
                logo.fetchedAt().orElse(null), logo.checkedAt().orElse(null), logo.lastFailure().map(BankLogoFailure::word).orElse(null));
    }
}
