package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.application.receipt.ReceiptRenderingLimit;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Optional;

@Configuration(proxyBeanMethods = false)
class ReceiptConfiguration {

    @Bean
    FoundationIdentity foundationIdentity(ReceiptProperties properties, BankAccount foundationBankAccount) {
        return new FoundationIdentity(properties.foundationName(), properties.foundationCompanyIdentifier(),
                new PostalAddress(properties.foundationStreet(), properties.foundationCity(), properties.foundationPostalCode()),
                properties.registryCourt(), properties.registryFile(), foundationBankAccount.accountNumber(), properties.issuePlace(),
                properties.issuePlaceEn());
    }

    @Bean
    Signatory receiptSignatory(ReceiptProperties properties) {
        return new Signatory(properties.signatoryName(), properties.signatoryRole());
    }

    @Bean
    FirstReceiptYear firstReceiptYear(ReceiptProperties properties) {
        return new FirstReceiptYear(properties.firstReceiptYear());
    }

    @Bean
    ReceiptTemplate currentReceiptTemplate() {
        return ReceiptTemplate.fromClasspath();
    }

    @Bean
    ReceiptRenderingLimit receiptRenderingLimit(ReceiptProperties properties) {
        return new ReceiptRenderingLimit(properties.concurrentRenders());
    }

    @Bean
    ConfiguredSignatureImage configuredSignatureImage(ReceiptProperties properties) {
        return new ConfiguredSignatureImage(properties.signatureImagePath().map(ReceiptConfiguration::readSignature));
    }

    private static ReceiptImage readSignature(Path path) {
        String mediaType = mediaTypeOf(path);
        try {
            return new ReceiptImage(Files.readAllBytes(path), mediaType);
        } catch (IOException | IllegalArgumentException unreadable) {
            throw new IllegalStateException("RECEIPT_SIGNATURE_IMAGE points to " + path + ", which cannot be read as a signature image: "
                    + unreadable.getMessage(), unreadable);
        }
    }

    private static String mediaTypeOf(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".png")) {
            return "image/png";
        }
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        throw new IllegalStateException("RECEIPT_SIGNATURE_IMAGE must name a PNG or JPEG file (.png, .jpg, .jpeg), but is " + path);
    }
}
