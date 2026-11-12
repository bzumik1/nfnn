package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.shared.application.people.PrintSignature;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

public final class PrintSignatures {

    private PrintSignatures() {
    }

    public static PrintSignature prepare(MediaVariant variant) {
        BufferedImage onWhite = fitted(decode(variant.webp()));
        return new PrintSignature(png(onWhite), onWhite.getWidth(), onWhite.getHeight());
    }

    private static BufferedImage decode(byte[] webp) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(webp));
            if (image == null) {
                throw new IllegalStateException("A stored signature cannot be decoded");
            }
            return image;
        } catch (IOException unreadable) {
            throw new IllegalStateException("A stored signature cannot be decoded", unreadable);
        }
    }

    private static BufferedImage fitted(BufferedImage source) {
        double scale = Math.min(1.0, Math.min((double) PrintSignature.MAX_WIDTH / source.getWidth(),
                (double) PrintSignature.MAX_HEIGHT / source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, width, height);
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, width, height, null);
        graphics.dispose();
        return target;
    }

    private static byte[] png(BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(image, "png", out)) {
                throw new IllegalStateException("No PNG writer is registered");
            }
        } catch (IOException failure) {
            throw new IllegalStateException("The PNG encoding of a signature failed", failure);
        }
        return out.toByteArray();
    }
}
