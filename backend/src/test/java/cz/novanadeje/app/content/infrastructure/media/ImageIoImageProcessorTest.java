package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.application.media.ProcessedImage;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageIoImageProcessorTest {

    private final ImageIoImageProcessor processor = new ImageIoImageProcessor();

    @Test
    @DisplayName("Given a 2000 px wide JPEG, when it is processed, then three WebP variants of 480, 960 and 1440 px keep the ratio and the original size is kept")
    void should_produce_three_webp_variants_when_processing_given_a_large_jpeg() throws IOException {
        ProcessedImage processed = processor.process(TestImages.jpeg(2000, 1200));

        assertThat(processed.width()).isEqualTo(2000);
        assertThat(processed.height()).isEqualTo(1200);
        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(480, 960, 1440);
        assertThat(processed.variants()).extracting(MediaVariant::height).containsExactly(288, 576, 864);
        for (MediaVariant variant : processed.variants()) {
            assertThat(new String(variant.webp(), 0, 4, StandardCharsets.ISO_8859_1)).isEqualTo("RIFF");
            assertThat(new String(variant.webp(), 8, 4, StandardCharsets.ISO_8859_1)).isEqualTo("WEBP");
            BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(variant.webp()));
            assertThat(decoded.getWidth()).isEqualTo(variant.width());
        }
    }

    @Test
    @DisplayName("Given a 700 px wide PNG, when it is processed, then it gets the 480 px variant and one at its own width, never an upscaled one")
    void should_never_upscale_when_processing_given_a_small_png() throws IOException {
        ProcessedImage processed = processor.process(TestImages.png(700, 500));

        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(480, 700);
    }

    @Test
    @DisplayName("Given a 300 px wide image, when it is processed, then the only variant is its own size")
    void should_keep_one_variant_when_processing_given_a_tiny_image() throws IOException {
        ProcessedImage processed = processor.process(TestImages.png(300, 200));

        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(300);
    }

    @Test
    @DisplayName("Given a JPEG whose EXIF says it was shot rotated by 90 degrees, when it is processed, then the variants are upright")
    void should_rotate_when_processing_given_exif_orientation_six() throws IOException {
        ProcessedImage processed = processor.process(TestImages.jpegWithOrientation(1200, 800, 6));

        assertThat(processed.width()).isEqualTo(800);
        assertThat(processed.height()).isEqualTo(1200);
        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(480, 800);
        BufferedImage largest = ImageIO.read(new ByteArrayInputStream(processed.variants().getLast().webp()));
        assertThat(largest.getHeight()).isGreaterThan(largest.getWidth());
    }

    @Test
    @DisplayName("Given a text file, when it is processed, then the upload is refused as unsupported")
    void should_refuse_when_processing_given_no_image() {
        assertThatThrownBy(() -> processor.process("hello".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(UnsupportedImage.class)
                .hasMessageContaining("not a JPEG, PNG or WebP");
    }

    @Test
    @DisplayName("Given an image wider than 8000 px, when it is processed, then it is refused")
    void should_refuse_when_processing_given_a_huge_image() throws IOException {
        assertThatThrownBy(() -> processor.process(TestImages.png(8001, 10)))
                .isInstanceOf(UnsupportedImage.class)
                .hasMessageContaining("8000");
    }

    static final class TestImages {

        private TestImages() {
        }

        static byte[] jpeg(int width, int height) throws IOException {
            return encode(gradient(width, height), "jpeg");
        }

        static byte[] png(int width, int height) throws IOException {
            return encode(gradient(width, height), "png");
        }

        static byte[] jpegWithOrientation(int width, int height, int orientation) throws IOException {
            byte[] plain = jpeg(width, height);
            byte[] exif = exifSegment(orientation);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            out.write(plain, 0, 2);
            out.write(exif);
            out.write(plain, 2, plain.length - 2);
            return out.toByteArray();
        }

        private static byte[] exifSegment(int orientation) {
            byte[] tiff = {
                    'M', 'M', 0, 42, 0, 0, 0, 8,
                    0, 1,
                    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte) orientation, 0, 0,
                    0, 0, 0, 0
            };
            int length = 2 + 6 + tiff.length;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            out.write(0xFF);
            out.write(0xE1);
            out.write(length >> 8);
            out.write(length & 0xFF);
            out.writeBytes(new byte[] {'E', 'x', 'i', 'f', 0, 0});
            out.writeBytes(tiff);
            return out.toByteArray();
        }

        private static BufferedImage gradient(int width, int height) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = image.createGraphics();
            graphics.setPaint(new java.awt.GradientPaint(0, 0, Color.BLUE, width, height, Color.ORANGE));
            graphics.fillRect(0, 0, width, height);
            graphics.dispose();
            return image;
        }

        private static byte[] encode(BufferedImage image, String format) throws IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, format, out);
            return out.toByteArray();
        }
    }
}
