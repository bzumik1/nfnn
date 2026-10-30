package cz.novanadeje.app.donations.infrastructure.texts;

import cz.novanadeje.app.donations.application.receipt.ReceiptTextSource;
import cz.novanadeje.app.donations.domain.receipt.ReceiptTextSet;
import cz.novanadeje.app.donations.infrastructure.pdf.ReceiptTemplate;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.stereotype.Component;

@Component
public class BundleReceiptTextSource implements ReceiptTextSource {

    private final ReceiptTextSet czech;
    private final ReceiptTextSet bilingual;

    public BundleReceiptTextSource() {
        ReceiptTemplate bundle = ReceiptTemplate.fromClasspath();
        this.czech = ReceiptTextSet.czechOnly(bundle.czech());
        this.bilingual = ReceiptTextSet.bilingual(bundle.czech(), bundle.english());
    }

    @Override
    public ReceiptTextSet textsFor(LocaleCode locale) {
        return switch (locale) {
            case CS -> czech;
            case EN -> bilingual;
        };
    }
}
