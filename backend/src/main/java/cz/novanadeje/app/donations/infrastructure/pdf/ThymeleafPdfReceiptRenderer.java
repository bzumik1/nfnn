package cz.novanadeje.app.donations.infrastructure.pdf;

import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.pdfboxout.PdfBoxRenderer;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import cz.novanadeje.app.donations.application.receipt.DonationReceiptRenderer;
import cz.novanadeje.app.donations.domain.receipt.ContentDigest;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.ReceiptDocument;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSnapshot;
import cz.novanadeje.app.shared.domain.LocaleCode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.StringTemplateResolver;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

@Component
class ThymeleafPdfReceiptRenderer implements DonationReceiptRenderer {

    static final int RENDER_PROFILE = 1;
    private static final String FONT_FAMILY = "DejaVu Sans";
    private static final int REGULAR = 400;
    private static final int BOLD = 700;
    private static final String PRODUCER = "Nová naděje - nadační fond";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> RASTER_TYPES = Set.of("image/png", "image/jpeg");
    private static final TypeReference<Map<String, Object>> DATA = new TypeReference<>() {
    };

    private final ReceiptResources resources;
    private final ReceiptSignatureRepository signatures;
    private final Clock clock;
    private final ReceiptTemplate template;
    private final String templateContent;
    private final ContentDigest templateDigest;
    private final ReceiptImage logo;
    private final ITemplateEngine engine = stringTemplateEngine();
    private final byte[] regularFont = classpathBytes("fonts/DejaVuSans.ttf");
    private final byte[] boldFont = classpathBytes("fonts/DejaVuSans-Bold.ttf");
    private final Map<ContentDigest, ReceiptTemplate> templates = new ConcurrentHashMap<>();
    private final Map<ContentDigest, String> images = new ConcurrentHashMap<>();

    ThymeleafPdfReceiptRenderer(ReceiptResources resources, ReceiptTemplate template, ReceiptSignatureRepository signatures, Clock clock) {
        this.resources = resources;
        this.signatures = signatures;
        this.clock = clock;
        this.template = template;
        this.templateContent = template.content();
        this.templateDigest = ContentDigest.of(templateContent.getBytes(StandardCharsets.UTF_8));
        this.logo = new ReceiptImage(classpathBytes("receipt/logo.png"), "image/png");
    }

    @Override
    public byte[] render(FrozenReceipt receipt, Instant issuedAt) {
        ReceiptDocument document = receipt.document();
        ReceiptTexts czech = new ReceiptTexts(receipt.texts().czech(), LocaleCode.CS.toLocale());
        ReceiptTexts english = new ReceiptTexts(receipt.texts().english().orElse(template.english()), LocaleCode.EN.toLocale());
        Map<String, Object> variables = new HashMap<>(JSON.readValue(JSON.writeValueAsString(ReceiptData.of(document, czech)), DATA));
        variables.put("cs", czech);
        variables.put("en", english);
        variables.put("logo", logo.dataUri());
        variables.put("signature", receipt.signatureImage().filter(this::drawnByServer).map(this::image).orElse(null));
        String html = engine.process(template.html(), new Context(document.locale().toLocale(), variables));
        return pdf(html, document.number(), issuedAt);
    }

    public ReceiptSnapshot freeze(ReceiptDocument document) {
        Instant now = clock.instant();
        resources.storeTemplate(templateDigest, templateContent, now);
        resources.storeImage(logo.digest(), logo, now);
        Optional<ReceiptImage> signature = signatures.currentScan().map(scan -> new ReceiptImage(scan.png(), "image/png"));
        signature.ifPresent(image -> resources.storeImage(image.digest(), image, now));
        String data = JSON.writeValueAsString(ReceiptData.of(document, template.texts(LocaleCode.CS)));
        return new ReceiptSnapshot(templateDigest, data, logo.digest(), signature.map(ReceiptImage::digest), RENDER_PROFILE);
    }

    public byte[] render(ReceiptSnapshot snapshot, ReceiptNumber number, Instant issuedAt) {
        if (snapshot.renderProfile() != RENDER_PROFILE) {
            throw new IllegalStateException("Receipt " + number + " needs render profile " + snapshot.renderProfile()
                    + ", which this renderer does not have");
        }
        ReceiptTemplate stored = templates.computeIfAbsent(snapshot.template(), this::storedTemplate);
        Map<String, Object> variables = new HashMap<>(JSON.readValue(snapshot.data(), DATA));
        variables.put("cs", stored.texts(LocaleCode.CS));
        variables.put("en", stored.texts(LocaleCode.EN));
        variables.put("logo", image(snapshot.logo()));
        variables.put("signature", snapshot.signature().map(this::image).orElse(null));
        LocaleCode locale = LocaleCode.fromTag((String) variables.get("locale"));
        String html = engine.process(stored.html(), new Context(locale.toLocale(), variables));
        return pdf(html, number, issuedAt);
    }

    private byte[] pdf(String html, ReceiptNumber number, Instant issuedAt) {
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.useFastMode();
        builder.withHtmlContent(html, null);
        builder.useFont(font(regularFont), FONT_FAMILY, REGULAR, FontStyle.NORMAL, true);
        builder.useFont(font(boldFont), FONT_FAMILY, BOLD, FontStyle.NORMAL, true);
        builder.withProducer(PRODUCER);
        ByteArrayOutputStream pdf = new ByteArrayOutputStream();
        try (PdfBoxRenderer renderer = builder.buildPdfRenderer()) {
            renderer.layout();
            try (PDDocument document = renderer.createPDFKeepOpen()) {
                document.getDocumentInformation().setCreationDate(calendar(issuedAt));
                document.setDocumentId(Long.parseLong(number.value().replace("-", "")));
                document.save(pdf);
            }
        } catch (IOException failure) {
            throw new IllegalStateException("Receipt " + number + " could not be rendered", failure);
        }
        return pdf.toByteArray();
    }

    private ReceiptTemplate storedTemplate(ContentDigest digest) {
        String content = resources.template(digest)
                .orElseThrow(() -> new IllegalStateException("The receipt template " + digest + " is not stored"));
        if (!ContentDigest.of(content.getBytes(StandardCharsets.UTF_8)).equals(digest)) {
            throw new IllegalStateException("The stored receipt template " + digest + " does not match its digest");
        }
        return ReceiptTemplate.fromContent(content);
    }

    private boolean drawnByServer(ContentDigest digest) {
        return resources.imageMediaType(digest).map(RASTER_TYPES::contains).orElse(true);
    }

    private String image(ContentDigest digest) {
        return images.computeIfAbsent(digest, missing -> {
            ReceiptImage image = resources.image(missing)
                    .orElseThrow(() -> new IllegalStateException("The receipt image " + missing + " is not stored"));
            if (!image.digest().equals(missing)) {
                throw new IllegalStateException("The stored receipt image " + missing + " does not match its digest");
            }
            return image.dataUri();
        });
    }

    private static Calendar calendar(Instant instant) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.setTimeInMillis(instant.toEpochMilli());
        return calendar;
    }

    private static ITemplateEngine stringTemplateEngine() {
        StringTemplateResolver resolver = new StringTemplateResolver();
        resolver.setTemplateMode(TemplateMode.HTML);
        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        return engine;
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
