package cz.novanadeje.app.donations.infrastructure.signature;

import cz.novanadeje.app.donations.domain.receipt.SignatureImage;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageIoSignatureImageProcessorTest {

    private final ImageIoSignatureImageProcessor processor = new ImageIoSignatureImageProcessor();

    @Test
    @DisplayName("Given a transparent PNG within the limits, when processed, then it stays a PNG of the same size and keeps its transparency")
    void should_keep_size_and_transparency_when_processed_given_small_png() throws IOException {
        SignatureImage image = processor.process(encode(signature(600, 200, BufferedImage.TYPE_INT_ARGB), "png"));

        assertThat(image.width()).isEqualTo(600);
        assertThat(image.height()).isEqualTo(200);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(image.png()));
        assertThat(decoded.getColorModel().hasAlpha()).isTrue();
        assertThat(decoded.getRGB(0, 0) >>> 24).as("corner alpha").isZero();
        assertThat(decoded.getRGB(300, 100) >>> 24).as("stroke alpha").isEqualTo(255);
    }

    @Test
    @DisplayName("Given a JPEG scan, when processed, then it becomes a PNG of the same size")
    void should_convert_to_png_when_processed_given_jpeg() {
        SignatureImage image = processor.process(encode(signature(800, 300, BufferedImage.TYPE_INT_RGB), "jpg"));

        assertThat(image.png()).startsWith(0x89, 'P', 'N', 'G');
        assertThat(image.width()).isEqualTo(800);
        assertThat(image.height()).isEqualTo(300);
    }

    @Test
    @DisplayName("Given a scan larger than 1200 by 600 pixels, when processed, then it is scaled down to fit and keeps its proportions")
    void should_scale_down_when_processed_given_large_scan() {
        assertThat(sizeOf(processor.process(encode(signature(3000, 1000, BufferedImage.TYPE_INT_RGB), "png")))).isEqualTo("1200x400");
        assertThat(sizeOf(processor.process(encode(signature(1500, 1500, BufferedImage.TYPE_INT_RGB), "png")))).isEqualTo("600x600");
    }

    @Test
    @DisplayName("Given a text file, a GIF or an empty file, when processed, then it is refused as no usable signature image")
    void should_refuse_when_processed_given_unsupported_file() {
        assertThatThrownBy(() -> processor.process("Toto není obrázek.".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(UnsupportedSignatureImage.class)
                .hasMessageContaining("not a JPEG, PNG or WebP image");
        assertThatThrownBy(() -> processor.process(encode(signature(100, 50, BufferedImage.TYPE_INT_RGB), "gif")))
                .isInstanceOf(UnsupportedSignatureImage.class)
                .hasMessageContaining("not a JPEG, PNG or WebP image");
        assertThatThrownBy(() -> processor.process(new byte[0])).isInstanceOf(UnsupportedSignatureImage.class);
    }

    @Test
    @DisplayName("Given a PNG that declares more than 8000 pixels on a side, when processed, then it is refused before its pixels are decoded")
    void should_refuse_without_decoding_when_processed_given_huge_declared_size() {
        assertThatThrownBy(() -> processor.process(pngHeaderOnly(100_000, 100_000)))
                .isInstanceOf(UnsupportedSignatureImage.class)
                .hasMessageContaining("larger than 8000 pixels on a side");
    }

    @Test
    @DisplayName("Given a PNG cut off in the middle, when processed, then it is refused as undecodable")
    void should_refuse_when_processed_given_truncated_png() {
        byte[] whole = encode(signature(600, 200, BufferedImage.TYPE_INT_RGB), "png");
        byte[] truncated = java.util.Arrays.copyOf(whole, 60);

        assertThatThrownBy(() -> processor.process(truncated)).isInstanceOf(UnsupportedSignatureImage.class);
    }

    private static String sizeOf(SignatureImage image) {
        return image.width() + "x" + image.height();
    }

    static BufferedImage signature(int width, int height, int type) {
        BufferedImage image = new BufferedImage(width, height, type);
        Graphics2D graphics = image.createGraphics();
        if (type == BufferedImage.TYPE_INT_RGB) {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
        }
        graphics.setColor(new Color(0x1d, 0x2a, 0x5c));
        graphics.fillRect(width / 4, height / 2 - 4, width / 2, 8);
        graphics.dispose();
        return image;
    }

    static byte[] encode(BufferedImage image, String format) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, format, out);
        } catch (IOException impossible) {
            throw new UncheckedIOException(impossible);
        }
        return out.toByteArray();
    }

    private static byte[] pngHeaderOnly(int width, int height) {
        ByteBuffer header = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 8).put((byte) 6).put((byte) 0).put((byte) 0).put((byte) 0);
        byte[] type = "IHDR".getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(type);
        crc.update(header.array());
        return ByteBuffer.allocate(8 + 4 + 4 + 13 + 4)
                .put(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
                .putInt(13).put(type).put(header.array()).putInt((int) crc.getValue())
                .array();
    }
}
