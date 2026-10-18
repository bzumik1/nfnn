package cz.novanadeje.app.donations.infrastructure.pdf;

import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import cz.novanadeje.app.donations.application.receipt.DonationReceiptRenderer;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptKind;
import cz.novanadeje.app.donations.domain.receipt.ReceiptLine;
import cz.novanadeje.app.donations.domain.receipt.ReceiptParty;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.springframework.context.MessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Year;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Component
class ThymeleafPdfReceiptRenderer implements DonationReceiptRenderer {

    private static final String TEMPLATE = "pdf/donation-receipt";
    private static final String FONT_FAMILY = "DejaVu Sans";
    private static final int REGULAR = 400;
    private static final int BOLD = 700;
    private static final String PRODUCER = "Nová naděje - nadační fond";

    private final ITemplateEngine templates;
    private final ReceiptTexts czech;
    private final ReceiptTexts english;
    private final byte[] regularFont;
    private final byte[] boldFont;
    private final String logo;
    private final Optional<String> signature;

    ThymeleafPdfReceiptRenderer(ITemplateEngine templates, MessageSource messages, ConfiguredSignatureImage signature) {
        this.templates = templates;
        this.czech = new ReceiptTexts(messages, LocaleCode.CS.toLocale());
        this.english = new ReceiptTexts(messages, LocaleCode.EN.toLocale());
        this.regularFont = classpathBytes("fonts/DejaVuSans.ttf");
        this.boldFont = classpathBytes("fonts/DejaVuSans-Bold.ttf");
        this.logo = "data:image/png;base64," + Base64.getEncoder().encodeToString(classpathBytes("receipt/logo.png"));
        this.signature = signature.image().map(SignatureImage::dataUri);
    }

    @Override
    public byte[] render(ReceiptDocument document) {
        String html = templates.process(TEMPLATE, new Context(document.locale().toLocale(), variables(document)));
        ByteArrayOutputStream pdf = new ByteArrayOutputStream();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, null);
            builder.useFont(font(regularFont), FONT_FAMILY, REGULAR, FontStyle.NORMAL, true);
            builder.useFont(font(boldFont), FONT_FAMILY, BOLD, FontStyle.NORMAL, true);
            builder.withProducer(PRODUCER);
            builder.toStream(pdf);
            builder.run();
        } catch (IOException failure) {
            throw new IllegalStateException("Receipt " + document.number() + " could not be rendered", failure);
        }
        return pdf.toByteArray();
    }

    private Map<String, Object> variables(ReceiptDocument document) {
        FoundationIdentity foundation = document.foundation();
        ReceiptParty donor = document.donor();
        ReceiptLine firstLine = document.lines().getFirst();
        boolean single = document.kind() == ReceiptKind.SINGLE;
        String year = document.year().map(Year::toString).orElse(null);
        Map<String, Object> variables = new HashMap<>();
        variables.put("cs", czech);
        variables.put("en", english);
        variables.put("single", single);
        variables.put("bilingual", document.locale() == LocaleCode.EN);
        variables.put("documentTitle", single ? czech.text("receipt.title.single") : czech.text("receipt.title.yearly", year));
        variables.put("year", year);
        variables.put("number", document.number().value());
        variables.put("issuedOnCs", ReceiptFormats.czechDate(document.issuedOn()));
        variables.put("issuedOnEn", ReceiptFormats.englishDate(document.issuedOn()));
        variables.put("replaced", document.replaces().isPresent());
        variables.put("replacedNumber", document.replaces().map(replaced -> replaced.number().value()).orElse(null));
        variables.put("replacedOnCs", document.replaces().map(replaced -> ReceiptFormats.czechDate(replaced.issuedOn())).orElse(null));
        variables.put("replacedOnEn", document.replaces().map(replaced -> ReceiptFormats.englishDate(replaced.issuedOn())).orElse(null));
        variables.put("foundationName", foundation.name());
        variables.put("foundationIdentifier", foundation.companyIdentifier());
        variables.put("foundationAddress", foundation.address().singleLine());
        variables.put("registryFile", foundation.registryFile());
        variables.put("registryCourt", foundation.registryCourt());
        variables.put("accountNumber", foundation.bankAccountNumber());
        variables.put("issuePlace", foundation.issuePlace());
        variables.put("issuePlaceEn", foundation.issuePlaceEn());
        variables.put("company", donor.type() == DonorType.COMPANY);
        variables.put("donorName", donor.name());
        variables.put("donorIdentifier", donor.companyIdentifier().orElse(null));
        variables.put("donorAddress", donor.address().singleLine());
        variables.put("variableSymbol", donor.variableSymbol().value());
        variables.put("giftFormKey", "receipt.gift.form." + firstLine.source().name());
        variables.put("receivedOnCs", ReceiptFormats.czechDate(firstLine.receivedOn()));
        variables.put("receivedOnEn", ReceiptFormats.englishDate(firstLine.receivedOn()));
        variables.put("lines", document.lines().stream().map(ReceiptLineView::of).toList());
        variables.put("count", Integer.toString(document.count()));
        variables.put("totalCs", ReceiptFormats.czechAmount(document.total()));
        variables.put("totalEn", ReceiptFormats.englishAmount(document.total()));
        variables.put("signatoryName", document.signatory().name());
        variables.put("signatoryRole", document.signatory().role());
        variables.put("logo", logo);
        variables.put("signature", signature.orElse(null));
        return variables;
    }

    private static FSSupplier<InputStream> font(byte[] bytes) {
        return () -> new ByteArrayInputStream(bytes);
    }

    private static byte[] classpathBytes(String path) {
        try {
            return new ClassPathResource(path).getContentAsByteArray();
        } catch (IOException missing) {
            throw new IllegalStateException("The receipt resource " + path + " is missing from the classpath", missing);
        }
    }
}
