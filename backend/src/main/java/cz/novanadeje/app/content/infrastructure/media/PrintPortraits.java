package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.shared.application.people.PrintPortrait;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;

public final class PrintPortraits {

    private static final float QUALITY = 0.9f;

    private PrintPortraits() {
    }

    public static PrintPortrait prepare(MediaVariant variant) {
        BufferedImage source = decode(variant.webp());
        int side = Math.min(source.getWidth(), source.getHeight());
        int left = (source.getWidth() - side) / 2;
        int top = (source.getHeight() - side) / 2;
        BufferedImage square = new BufferedImage(PrintPortrait.SIDE, PrintPortrait.SIDE, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = square.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, PrintPortrait.SIDE, PrintPortrait.SIDE);
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, PrintPortrait.SIDE, PrintPortrait.SIDE, left, top, left + side, top + side, null);
        graphics.dispose();
        return new PrintPortrait(jpeg(square), PrintPortrait.SIDE);
    }

    private static BufferedImage decode(byte[] webp) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(webp));
            if (image == null) {
                throw new IllegalStateException("A stored portrait cannot be decoded");
            }
            return image;
        } catch (IOException unreadable) {
            throw new IllegalStateException("A stored portrait cannot be decoded", unreadable);
        }
    }

    private static byte[] jpeg(BufferedImage image) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IllegalStateException("No JPEG writer is registered");
        }
        ImageWriter writer = writers.next();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(QUALITY);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
            stream.flush();
            return out.toByteArray();
        } catch (IOException failure) {
            throw new IllegalStateException("The JPEG encoding of a portrait failed", failure);
        } finally {
            writer.dispose();
        }
    }
}
