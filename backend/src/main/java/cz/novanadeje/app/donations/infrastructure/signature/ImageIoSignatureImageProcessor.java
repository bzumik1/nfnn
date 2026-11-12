package cz.novanadeje.app.donations.infrastructure.signature;

import cz.novanadeje.app.donations.application.receipt.SignatureImageProcessor;
import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureImage;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;

@Component
class ImageIoSignatureImageProcessor implements SignatureImageProcessor {

    static final int MAX_SIDE = 8000;
    static final long MAX_PIXELS = 48_000_000L;
    private static final int MAX_BITS_PER_SAMPLE = 8;
    private static final Semaphore ONE_AT_A_TIME = new Semaphore(1, true);
    private static final Set<String> FORMATS = Set.of("png", "jpeg", "webp");

    @Override
    public SignatureImage process(byte[] upload) {
        ONE_AT_A_TIME.acquireUninterruptibly();
        try {
            return processAlone(upload);
        } finally {
            ONE_AT_A_TIME.release();
        }
    }

    private static SignatureImage processAlone(byte[] upload) {
        BufferedImage decoded = decode(upload);
        BufferedImage fitted = fit(decoded);
        return new SignatureImage(encode(fitted), fitted.getWidth(), fitted.getHeight());
    }

    private static BufferedImage decode(byte[] upload) {
        if (upload == null || upload.length == 0) {
            throw new UnsupportedSignatureImage("it is empty");
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(upload))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new UnsupportedSignatureImage("it is not a JPEG, PNG or WebP image");
            }
            ImageReader reader = readers.next();
            try {
                if (!FORMATS.contains(reader.getFormatName().toLowerCase(Locale.ROOT))) {
                    throw new UnsupportedSignatureImage("it is not a JPEG, PNG or WebP image");
                }
                reader.setInput(input, true, true);
                if (reader.getWidth(0) > MAX_SIDE || reader.getHeight(0) > MAX_SIDE) {
                    throw new UnsupportedSignatureImage("it is larger than " + MAX_SIDE + " pixels on a side");
                }
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw new UnsupportedSignatureImage("it has more than 48 million pixels");
                }
                if (bitsPerSample(reader) > MAX_BITS_PER_SAMPLE) {
                    throw new UnsupportedSignatureImage("it has more than 8 bits per sample");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException unreadable) {
            if (unreadable instanceof UnsupportedSignatureImage refused) {
                throw refused;
            }
            throw new UnsupportedSignatureImage("it could not be decoded");
        }
    }

    private static int bitsPerSample(ImageReader reader) throws IOException {
        ImageTypeSpecifier raw = reader.getRawImageType(0);
        if (raw == null) {
            Iterator<ImageTypeSpecifier> types = reader.getImageTypes(0);
            raw = types.hasNext() ? types.next() : null;
        }
        return raw == null ? 0 : Arrays.stream(raw.getSampleModel().getSampleSize()).max().orElse(0);
    }

    private static BufferedImage fit(BufferedImage source) {
        double scale = Math.min(1.0, Math.min((double) SignatureImage.MAX_WIDTH / source.getWidth(),
                (double) SignatureImage.MAX_HEIGHT / source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        boolean alpha = source.getColorModel().hasAlpha();
        BufferedImage target = new BufferedImage(width, height, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, width, height, null);
        graphics.dispose();
        return target;
    }

    private static byte[] encode(BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(image, "png", out)) {
                throw new IllegalStateException("No PNG writer is registered");
            }
        } catch (IOException failure) {
            throw new IllegalStateException("The PNG encoding failed", failure);
        }
        return out.toByteArray();
    }
}
