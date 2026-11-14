package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.application.media.ImageProcessor;
import cz.novanadeje.app.content.application.media.ProcessedImage;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;

@Component
class ImageIoImageProcessor implements ImageProcessor {

    static final int MAX_SIDE = 8000;
    static final long MAX_PIXELS = 48_000_000L;
    private static final int MAX_BITS_PER_SAMPLE = 8;
    static final int READ_WHOLE_UP_TO = 4 * MediaImage.VARIANT_WIDTHS.getLast();
    private static final Semaphore ONE_AT_A_TIME = new Semaphore(1, true);
    private static final float QUALITY = 0.82f;
    private static final String WEBP = "webp";
    private static final Set<String> ACCEPTED_FORMATS = Set.of("jpeg", "jpg", "png", "webp");

    @Override
    public ProcessedImage process(byte[] upload) {
        ONE_AT_A_TIME.acquireUninterruptibly();
        try {
            return processAlone(upload);
        } finally {
            ONE_AT_A_TIME.release();
        }
    }

    private static ProcessedImage processAlone(byte[] upload) {
        int orientation = ExifOrientation.of(upload);
        Decoded decoded = decode(upload, orientation);
        BufferedImage upright = toRgb(Orientation.apply(decoded.pixels(), orientation));
        List<MediaVariant> variants = new ArrayList<>();
        for (int width : variantWidths(upright.getWidth())) {
            BufferedImage scaled = scaleToWidth(upright, width);
            variants.add(new MediaVariant(scaled.getWidth(), scaled.getHeight(), encode(scaled)));
        }
        return new ProcessedImage(decoded.width(), decoded.height(), variants);
    }

    private static List<Integer> variantWidths(int originalWidth) {
        List<Integer> widths = new ArrayList<>(MediaImage.VARIANT_WIDTHS.stream().filter(width -> width < originalWidth).toList());
        int largest = Math.min(originalWidth, MediaImage.VARIANT_WIDTHS.getLast());
        if (!widths.contains(largest)) {
            widths.add(largest);
        }
        return widths;
    }

    record Decoded(BufferedImage pixels, int width, int height) {
    }

    static Decoded decode(byte[] upload, int orientation) {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(upload))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new UnsupportedImage("it is not a JPEG, PNG or WebP image");
            }
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!ACCEPTED_FORMATS.contains(format)) {
                    throw new UnsupportedImage("it is not a JPEG, PNG or WebP image");
                }
                reader.setInput(input, true, true);
                if (reader.getWidth(0) > MAX_SIDE || reader.getHeight(0) > MAX_SIDE) {
                    throw new UnsupportedImage("it is larger than " + MAX_SIDE + " pixels on a side");
                }
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw new UnsupportedImage("it has more than 48 million pixels");
                }
                if (bitsPerSample(reader) > MAX_BITS_PER_SAMPLE) {
                    throw new UnsupportedImage("it has more than 8 bits per sample");
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                boolean turned = Orientation.swapsSides(orientation);
                int uprightWidth = turned ? height : width;
                boolean halved = uprightWidth > READ_WHOLE_UP_TO && !WEBP.equals(format);
                BufferedImage pixels = halved ? readHalved(reader, width, height) : reader.read(0);
                return turned ? new Decoded(pixels, height, width) : new Decoded(pixels, width, height);
            } finally {
                reader.dispose();
            }
        } catch (UnsupportedImage refused) {
            throw refused;
        } catch (IOException | RuntimeException unreadable) {
            throw new UnsupportedImage("it could not be decoded");
        }
    }

    private static BufferedImage readHalved(ImageReader reader, int width, int height) throws IOException {
        int halfWidth = width / 2;
        int halfHeight = height / 2;
        BufferedImage halved = new BufferedImage(halfWidth, halfHeight, BufferedImage.TYPE_INT_RGB);
        int[] sums = pixelsOf(halved);
        for (int offsetY = 0; offsetY < 2; offsetY++) {
            for (int offsetX = 0; offsetX < 2; offsetX++) {
                BufferedImage phase = toRgb(reader.read(0, everySecondPixel(reader, offsetX, offsetY, halfWidth, halfHeight)));
                if (phase.getWidth() != halfWidth || phase.getHeight() != halfHeight) {
                    throw new UnsupportedImage("it could not be decoded");
                }
                int[] pixels = pixelsOf(phase);
                for (int i = 0; i < sums.length; i++) {
                    sums[i] += packed(pixels[i]);
                }
            }
        }
        for (int i = 0; i < sums.length; i++) {
            sums[i] = averageOfFour(sums[i]);
        }
        return halved;
    }

    private static int[] pixelsOf(BufferedImage rgb) {
        return ((DataBufferInt) rgb.getRaster().getDataBuffer()).getData();
    }

    private static ImageReadParam everySecondPixel(ImageReader reader, int offsetX, int offsetY, int halfWidth, int halfHeight) {
        ImageReadParam param = reader.getDefaultReadParam();
        param.setSourceRegion(new Rectangle(0, 0, halfWidth * 2, halfHeight * 2));
        param.setSourceSubsampling(2, 2, offsetX, offsetY);
        return param;
    }

    private static int packed(int rgb) {
        return (rgb >> 16 & 0xFF) << 20 | (rgb >> 8 & 0xFF) << 10 | rgb & 0xFF;
    }

    private static int averageOfFour(int packed) {
        int red = ((packed >> 20) & 0x3FF) + 2 >> 2;
        int green = ((packed >> 10) & 0x3FF) + 2 >> 2;
        int blue = (packed & 0x3FF) + 2 >> 2;
        return red << 16 | green << 8 | blue;
    }

    private static int bitsPerSample(ImageReader reader) throws IOException {
        ImageTypeSpecifier raw = reader.getRawImageType(0);
        if (raw == null) {
            Iterator<ImageTypeSpecifier> types = reader.getImageTypes(0);
            raw = types.hasNext() ? types.next() : null;
        }
        return raw == null ? 0 : Arrays.stream(raw.getSampleModel().getSampleSize()).max().orElse(0);
    }

    static BufferedImage scaleToWidth(BufferedImage source, int width) {
        if (width >= source.getWidth()) {
            return toRgb(source);
        }
        BufferedImage current = toRgb(source);
        while (current.getWidth() / 2 >= width) {
            current = resize(current, current.getWidth() / 2);
        }
        return current.getWidth() == width ? current : resize(current, width);
    }

    private static BufferedImage resize(BufferedImage source, int width) {
        int height = Math.max(1, Math.round((float) source.getHeight() * width / source.getWidth()));
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, width, height, null);
        graphics.dispose();
        return target;
    }

    static BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }
        BufferedImage target = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setColor(java.awt.Color.WHITE);
        graphics.fillRect(0, 0, source.getWidth(), source.getHeight());
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        return target;
    }

    private static byte[] encode(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(WEBP);
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
            return out.toByteArray();
        } catch (IOException failure) {
            throw new IllegalStateException("The WebP encoding failed", failure);
        } finally {
            writer.dispose();
        }
    }

    private static final class Orientation {

        private Orientation() {
        }

        static boolean swapsSides(int orientation) {
            return orientation >= 5;
        }

        static BufferedImage apply(BufferedImage image, int orientation) {
            if (orientation == ExifOrientation.NORMAL) {
                return image;
            }
            int width = image.getWidth();
            int height = image.getHeight();
            boolean rotated = swapsSides(orientation);
            AffineTransform transform = new AffineTransform();
            switch (orientation) {
                case 2 -> transform.concatenate(flipHorizontal(width));
                case 3 -> transform.concatenate(rotate(Math.PI, width, height));
                case 4 -> transform.concatenate(flipVertical(height));
                case 5 -> {
                    transform.concatenate(rotate(Math.PI / 2, width, height));
                    transform.concatenate(flipHorizontal(width));
                }
                case 6 -> transform.concatenate(rotate(Math.PI / 2, width, height));
                case 7 -> {
                    transform.concatenate(rotate(-Math.PI / 2, width, height));
                    transform.concatenate(flipHorizontal(width));
                }
                case 8 -> transform.concatenate(rotate(-Math.PI / 2, width, height));
                default -> {
                    return image;
                }
            }
            BufferedImage target = new BufferedImage(rotated ? height : width, rotated ? width : height, BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = target.createGraphics();
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.drawImage(image, transform, null);
            graphics.dispose();
            return target;
        }

        private static AffineTransform rotate(double angle, int width, int height) {
            AffineTransform transform = new AffineTransform();
            boolean quarter = Math.abs(Math.abs(angle) - Math.PI / 2) < 1e-9;
            transform.translate(quarter ? height / 2.0 : width / 2.0, quarter ? width / 2.0 : height / 2.0);
            transform.rotate(angle);
            transform.translate(-width / 2.0, -height / 2.0);
            return transform;
        }

        private static AffineTransform flipHorizontal(int width) {
            AffineTransform transform = new AffineTransform(-1, 0, 0, 1, width, 0);
            return transform;
        }

        private static AffineTransform flipVertical(int height) {
            return new AffineTransform(1, 0, 0, -1, 0, height);
        }
    }
}
