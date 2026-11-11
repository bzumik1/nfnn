package cz.novanadeje.app.donations.infrastructure.banklogo;

import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.Semaphore;

final class BankLogoPictures {

    static final int SIDE = 128;
    static final int MAX_SOURCE_SIDE = 2048;
    static final long MAX_SOURCE_PIXELS = 4_000_000L;
    static final int MAX_WEBP_BYTES = 64 * 1024;
    private static final int MAX_BITS_PER_SAMPLE = 8;
    private static final float QUALITY = 0.9f;
    private static final Semaphore ONE_AT_A_TIME = new Semaphore(1, true);
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};

    private BankLogoPictures() {
    }

    static byte[] toWebp(byte[] body, String contentType) {
        Format format = Format.of(body).filter(sniffed -> sniffed.mediaType.equals(mediaType(contentType)))
                .orElseThrow(() -> new BankLogoUnavailable(BankLogoFailure.UNSUPPORTED_TYPE));
        ONE_AT_A_TIME.acquireUninterruptibly();
        try {
            return encode(square(decode(body, format)));
        } finally {
            ONE_AT_A_TIME.release();
        }
    }

    private static String mediaType(String contentType) {
        if (contentType == null) {
            return "";
        }
        int parameters = contentType.indexOf(';');
        return (parameters < 0 ? contentType : contentType.substring(0, parameters)).strip().toLowerCase(Locale.ROOT);
    }

    private static BufferedImage decode(byte[] body, Format format) {
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format.readerName);
        if (!readers.hasNext()) {
            throw new IllegalStateException("No " + format.readerName + " reader is registered");
        }
        ImageReader reader = readers.next();
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(body))) {
            reader.setInput(input, true, true);
            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            if (width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE || (long) width * height > MAX_SOURCE_PIXELS) {
                throw new BankLogoUnavailable(BankLogoFailure.IMAGE_TOO_LARGE);
            }
            if (bitsPerSample(reader) > MAX_BITS_PER_SAMPLE) {
                throw new BankLogoUnavailable(BankLogoFailure.UNSUPPORTED_TYPE);
            }
            return reader.read(0);
        } catch (BankLogoUnavailable refused) {
            throw refused;
        } catch (IOException | RuntimeException unreadable) {
            throw new BankLogoUnavailable(BankLogoFailure.UNREADABLE_IMAGE);
        } finally {
            reader.dispose();
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

    private static BufferedImage square(BufferedImage source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        int left = (source.getWidth() - side) / 2;
        int top = (source.getHeight() - side) / 2;
        boolean alpha = source.getColorModel().hasAlpha();
        BufferedImage target = new BufferedImage(SIDE, SIDE, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, SIDE, SIDE, left, top, left + side, top + side, null);
        graphics.dispose();
        return target;
    }

    private static byte[] encode(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("webp");
        if (!writers.hasNext()) {
            throw new IllegalStateException("No WebP writer is registered");
        }
        ImageWriter writer = writers.next();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionType(param.getCompressionTypes()[0]);
            param.setCompressionQuality(QUALITY);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
            stream.flush();
            byte[] webp = out.toByteArray();
            if (webp.length > MAX_WEBP_BYTES) {
                throw new IllegalStateException("A 128 pixel WebP came out larger than " + MAX_WEBP_BYTES + " bytes");
            }
            return webp;
        } catch (IOException failure) {
            throw new IllegalStateException("The WebP encoding failed", failure);
        } finally {
            writer.dispose();
        }
    }

    private enum Format {
        PNG("image/png", "png", PNG_SIGNATURE),
        JPEG("image/jpeg", "jpeg", JPEG_SIGNATURE);

        private final String mediaType;
        private final String readerName;
        private final byte[] signature;

        Format(String mediaType, String readerName, byte[] signature) {
            this.mediaType = mediaType;
            this.readerName = readerName;
            this.signature = signature;
        }

        static Optional<Format> of(byte[] body) {
            return Arrays.stream(values()).filter(format -> body.length >= format.signature.length
                    && Arrays.equals(body, 0, format.signature.length, format.signature, 0, format.signature.length)).findFirst();
        }
    }
}
