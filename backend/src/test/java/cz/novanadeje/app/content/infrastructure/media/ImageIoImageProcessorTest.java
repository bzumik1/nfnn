package cz.novanadeje.app.content.infrastructure.media;

import cz.novanadeje.app.content.application.media.ProcessedImage;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.media.UnsupportedImage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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
    @DisplayName("Given a JPEG 6000 px wide, when it is decoded, then it is read at half size and the original size is still reported")
    void should_read_at_half_size_when_decoding_given_a_jpeg_6000_px_wide() throws IOException {
        byte[] upload = TestImages.jpeg(6000, 1000);

        ImageIoImageProcessor.Decoded decoded = ImageIoImageProcessor.decode(upload, ExifOrientation.NORMAL);
        ProcessedImage processed = processor.process(upload);

        assertThat(decoded.pixels().getWidth()).isEqualTo(3000);
        assertThat(decoded.pixels().getHeight()).isEqualTo(500);
        assertThat(processed.width()).isEqualTo(6000);
        assertThat(processed.height()).isEqualTo(1000);
        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(480, 960, 1440);
        assertThat(processed.variants()).extracting(MediaVariant::height).containsExactly(80, 160, 240);
    }

    @Test
    @DisplayName("Given a PNG exactly 5760 px wide, when it is decoded, then it is read whole")
    void should_read_whole_when_decoding_given_a_png_5760_px_wide() throws IOException {
        ImageIoImageProcessor.Decoded decoded = ImageIoImageProcessor.decode(TestImages.png(5760, 100), ExifOrientation.NORMAL);

        assertThat(decoded.pixels().getWidth()).isEqualTo(5760);
    }

    @Test
    @DisplayName("Given a JPEG stored 1000 by 6000 px whose EXIF turns it upright to 6000 px wide, when it is processed, then it is read at half size and reported upright")
    void should_read_at_half_size_when_processing_given_a_rotated_jpeg_6000_px_wide_upright() throws IOException {
        byte[] upload = TestImages.jpegWithOrientation(1000, 6000, 6);

        ImageIoImageProcessor.Decoded decoded = ImageIoImageProcessor.decode(upload, 6);
        ProcessedImage processed = processor.process(upload);

        assertThat(decoded.pixels().getWidth()).isEqualTo(500);
        assertThat(processed.width()).isEqualTo(6000);
        assertThat(processed.height()).isEqualTo(1000);
        assertThat(processed.variants()).extracting(MediaVariant::width).containsExactly(480, 960, 1440);
    }

    @Test
    @DisplayName("Given a WebP 7999 px wide, when it is decoded, then it is read whole, because its reader cannot read every second pixel")
    void should_read_whole_when_decoding_given_a_webp_7999_px_wide() throws IOException {
        ImageIoImageProcessor.Decoded decoded = ImageIoImageProcessor.decode(TestImages.webp(7999, 400), ExifOrientation.NORMAL);

        assertThat(decoded.pixels().getWidth()).isEqualTo(7999);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"jpeg", "png", "png with transparency", "png in grey", "png with a palette", "webp"})
    @DisplayName("Given a detailed photo 6000 px wide, when it is read at half size, then every variant matches the one read whole within rounding")
    void should_match_the_whole_read_within_rounding_when_reading_at_half_size_given_a_detailed_photo(String kind) throws IOException {
        byte[] upload = TestImages.detailed(6000, 1200, kind);
        BufferedImage whole = ImageIoImageProcessor.toRgb(ImageIO.read(new ByteArrayInputStream(upload)));

        BufferedImage halved = ImageIoImageProcessor.toRgb(ImageIoImageProcessor.decode(upload, ExifOrientation.NORMAL).pixels());

        for (int width : MediaImage.VARIANT_WIDTHS) {
            Difference difference = Difference.between(ImageIoImageProcessor.scaleToWidth(whole, width), ImageIoImageProcessor.scaleToWidth(halved, width));
            assertThat(difference.largest()).as("largest difference at %d px", width).isLessThanOrEqualTo(2);
            assertThat(difference.mean()).as("mean difference at %d px", width).isLessThan(0.5);
        }
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

    @Test
    @DisplayName("Given a small PNG whose header claims 60000 by 60000 pixels, when it is processed, then it is refused from the header before any pixel is decoded")
    void should_refuse_from_header_when_processing_given_a_decompression_bomb() {
        assertThatThrownBy(() -> processor.process(TestImages.pngHeaderOnly(60_000, 60_000)))
                .isInstanceOf(UnsupportedImage.class)
                .hasMessageContaining("8000");
    }

    @Test
    @DisplayName("Given a PNG whose header claims 7000 by 7000 pixels, within 8000 on a side but over 48 million pixels, when it is processed, then it is refused from the header")
    void should_refuse_from_header_when_processing_given_more_than_48_million_pixels() {
        assertThatThrownBy(() -> processor.process(TestImages.pngHeaderOnly(7000, 7000)))
                .isInstanceOf(UnsupportedImage.class)
                .hasMessageContaining("48 million pixels");
    }

    @Test
    @DisplayName("Given a PNG of 16 bits per sample, when it is processed, then it is refused before its pixels are decoded")
    void should_refuse_when_processing_given_sixteen_bits_per_sample() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(20, 20, BufferedImage.TYPE_USHORT_GRAY), "png", out);

        assertThatThrownBy(() -> processor.process(out.toByteArray()))
                .isInstanceOf(UnsupportedImage.class)
                .hasMessageContaining("8 bits per sample");
    }

    record Difference(int largest, double mean) {

        static Difference between(BufferedImage expected, BufferedImage actual) {
            assertThat(actual.getWidth()).isEqualTo(expected.getWidth());
            assertThat(actual.getHeight()).isEqualTo(expected.getHeight());
            int largest = 0;
            long total = 0;
            for (int y = 0; y < expected.getHeight(); y++) {
                for (int x = 0; x < expected.getWidth(); x++) {
                    int one = expected.getRGB(x, y);
                    int other = actual.getRGB(x, y);
                    for (int shift = 0; shift <= 16; shift += 8) {
                        int channel = Math.abs((one >> shift & 0xFF) - (other >> shift & 0xFF));
                        largest = Math.max(largest, channel);
                        total += channel;
                    }
                }
            }
            return new Difference(largest, (double) total / (3L * expected.getWidth() * expected.getHeight()));
        }
    }

    static final class TestImages {

        private TestImages() {
        }

        static byte[] pngHeaderOnly(int width, int height) {
            java.nio.ByteBuffer header = java.nio.ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 1).put((byte) 0)
                    .put((byte) 0).put((byte) 0).put((byte) 0);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            out.writeBytes(new byte[]{(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
            chunk(out, "IHDR", header.array());
            chunk(out, "IDAT", new byte[]{0x78, (byte) 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01});
            chunk(out, "IEND", new byte[0]);
            return out.toByteArray();
        }

        private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
            java.util.zip.CRC32 crc = new java.util.zip.CRC32();
            crc.update(type.getBytes(StandardCharsets.US_ASCII));
            crc.update(data);
            out.writeBytes(java.nio.ByteBuffer.allocate(4).putInt(data.length).array());
            out.writeBytes(type.getBytes(StandardCharsets.US_ASCII));
            out.writeBytes(data);
            out.writeBytes(java.nio.ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
        }

        static byte[] jpeg(int width, int height) throws IOException {
            return encode(gradient(width, height), "jpeg");
        }

        static byte[] png(int width, int height) throws IOException {
            return encode(gradient(width, height), "png");
        }

        static byte[] webp(int width, int height) throws IOException {
            return encode(gradient(width, height), "webp");
        }

        static byte[] detailed(int width, int height, String kind) throws IOException {
            boolean transparent = kind.contains("transparency");
            int type = kind.contains("grey") ? BufferedImage.TYPE_BYTE_GRAY
                    : kind.contains("palette") ? BufferedImage.TYPE_BYTE_INDEXED
                    : transparent ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
            BufferedImage image = new BufferedImage(width, height, type);
            java.util.Random random = new java.util.Random(42);
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int stripes = (x % 2 == 0) == (y % 3 == 0) ? 200 : 40;
                    int red = clamp(stripes + random.nextInt(51) - 25);
                    int green = clamp((x * 255 / width) + random.nextInt(61) - 30);
                    int blue = clamp(((x / 3 + y / 2) % 2 == 0 ? 230 : 20) + random.nextInt(21) - 10);
                    int alpha = transparent ? (x + y) % 256 : 255;
                    image.setRGB(x, y, alpha << 24 | red << 16 | green << 8 | blue);
                }
            }
            return encode(image, kind.split(" ")[0]);
        }

        private static int clamp(int value) {
            return Math.max(0, Math.min(255, value));
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
