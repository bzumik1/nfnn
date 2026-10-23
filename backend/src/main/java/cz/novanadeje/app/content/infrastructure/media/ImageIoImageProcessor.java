package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.application.media.ImageProcessor;
import cz.novanadeje.app.content.application.media.ProcessedImage;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

@Component
class ImageIoImageProcessor implements ImageProcessor {

    static final int MAX_SIDE = 8000;
    private static final float QUALITY = 0.82f;
    private static final String WEBP = "webp";

    @Override
    public ProcessedImage process(byte[] upload) {
        BufferedImage decoded = decode(upload);
        BufferedImage upright = Orientation.apply(decoded, ExifOrientation.of(upload));
        List<MediaVariant> variants = new ArrayList<>();
        for (int width : variantWidths(upright.getWidth())) {
            BufferedImage scaled = scaleToWidth(upright, width);
            variants.add(new MediaVariant(scaled.getWidth(), scaled.getHeight(), encode(scaled)));
        }
        return new ProcessedImage(upright.getWidth(), upright.getHeight(), variants);
    }

    private static List<Integer> variantWidths(int originalWidth) {
        List<Integer> widths = new ArrayList<>(MediaImage.VARIANT_WIDTHS.stream().filter(width -> width < originalWidth).toList());
        int largest = Math.min(originalWidth, MediaImage.VARIANT_WIDTHS.getLast());
        if (!widths.contains(largest)) {
            widths.add(largest);
        }
        return widths;
    }

    private static BufferedImage decode(byte[] upload) {
        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(upload));
        } catch (IOException | RuntimeException unreadable) {
            throw new UnsupportedImage("it could not be decoded");
        }
        if (image == null) {
            throw new UnsupportedImage("it is not a JPEG, PNG or WebP image");
        }
        if (image.getWidth() > MAX_SIDE || image.getHeight() > MAX_SIDE) {
            throw new UnsupportedImage("it is larger than " + MAX_SIDE + " pixels on a side");
        }
        return image;
    }

    private static BufferedImage scaleToWidth(BufferedImage source, int width) {
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

    private static BufferedImage toRgb(BufferedImage source) {
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

        static BufferedImage apply(BufferedImage image, int orientation) {
            if (orientation == ExifOrientation.NORMAL) {
                return image;
            }
            int width = image.getWidth();
            int height = image.getHeight();
            boolean rotated = orientation >= 5;
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
