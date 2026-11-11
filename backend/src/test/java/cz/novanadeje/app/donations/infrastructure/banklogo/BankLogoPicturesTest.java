package cz.novanadeje.app.donations.infrastructure.banklogo;

import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
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
import java.time.Duration;
import java.util.Arrays;
import java.util.SplittableRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BankLogoPicturesTest {

    @Test
    @DisplayName("Given a wide JPEG, when it becomes a bank logo, then its centre is cut square and encoded as one 128 pixel WebP under 64 KiB")
    void should_crop_centre_to_square_webp_when_converted_given_wide_jpeg() throws IOException {
        BufferedImage wide = new BufferedImage(600, 300, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = wide.createGraphics();
        graphics.setColor(Color.RED);
        graphics.fillRect(0, 0, 600, 300);
        graphics.setColor(Color.BLUE);
        graphics.fillRect(150, 0, 300, 300);
        graphics.dispose();

        byte[] webp = BankLogoPictures.toWebp(encode(wide, "jpeg"), "image/jpeg", later());

        assertThat(new String(webp, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("RIFF");
        assertThat(new String(webp, 8, 4, StandardCharsets.US_ASCII)).isEqualTo("WEBP");
        assertThat(webp.length).isLessThanOrEqualTo(64 * 1024);
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(webp));
        assertThat(decoded.getWidth()).isEqualTo(BankLogoPictures.SIDE);
        assertThat(decoded.getHeight()).isEqualTo(BankLogoPictures.SIDE);
        Color corner = new Color(decoded.getRGB(2, 2));
        assertThat(corner.getBlue()).isGreaterThan(200);
        assertThat(corner.getRed()).isLessThan(60);
    }

    @Test
    @DisplayName("Given a PNG with transparent corners, when it becomes a bank logo, then the corners stay transparent")
    void should_keep_transparency_when_converted_given_png_with_alpha() throws IOException {
        BufferedImage round = new BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = round.createGraphics();
        graphics.setColor(Color.GREEN);
        graphics.fillOval(0, 0, 256, 256);
        graphics.dispose();

        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(BankLogoPictures.toWebp(encode(round, "png"), "image/png; charset=binary", later())));

        assertThat(decoded.getColorModel().hasAlpha()).isTrue();
        assertThat(decoded.getRGB(0, 0) >>> 24).isLessThan(16);
        assertThat(decoded.getRGB(64, 64) >>> 24).isGreaterThan(240);
    }

    @Test
    @DisplayName("Given a PNG whose header names more than 2048 pixels on a side or 4 million pixels, when it becomes a bank logo, then it is refused before decoding")
    void should_refuse_before_decoding_when_converted_given_oversized_header() throws IOException {
        for (int[] size : new int[][]{{2049, 16}, {16, 2049}, {2048, 2000}}) {
            byte[] png = encode(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png");
            byte[] claimed = withHeaderSize(png, size[0], size[1]);

            assertThatThrownBy(() -> BankLogoPictures.toWebp(claimed, "image/png", later()))
                    .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.IMAGE_TOO_LARGE));
        }
    }

    @Test
    @DisplayName("Given a PNG of 16 bits per sample, when it becomes a bank logo, then it is refused as an unsupported type")
    void should_refuse_when_converted_given_sixteen_bit_png() throws IOException {
        BufferedImage deep = new BufferedImage(32, 32, BufferedImage.TYPE_USHORT_GRAY);

        assertThatThrownBy(() -> BankLogoPictures.toWebp(encode(deep, "png"), "image/png", later()))
                .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNSUPPORTED_TYPE));
    }

    @Test
    @DisplayName("Given a PNG cut short, when it becomes a bank logo, then it is refused as unreadable")
    void should_refuse_as_unreadable_when_converted_given_corrupt_png() throws IOException {
        byte[] png = encode(new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB), "png");
        byte[] cut = Arrays.copyOf(png, 40);

        assertThatThrownBy(() -> BankLogoPictures.toWebp(cut, "image/png", later()))
                .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNREADABLE_IMAGE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"webp", "svg", "ico", "gif", "html"})
    @DisplayName("Given a WebP, SVG, ICO, GIF or a page, when it becomes a bank logo, then it is refused as an unsupported type whatever its type header says")
    void should_refuse_as_unsupported_when_converted_given_other_formats(String kind) {
        byte[] body = switch (kind) {
            case "webp" -> new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};
            case "svg" -> "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes(StandardCharsets.UTF_8);
            case "ico" -> new byte[]{0, 0, 1, 0, 1, 0, 16, 16};
            case "gif" -> "GIF89a".getBytes(StandardCharsets.US_ASCII);
            default -> "<html></html>".getBytes(StandardCharsets.UTF_8);
        };

        for (String type : new String[]{"image/png", "image/jpeg", "image/" + kind}) {
            assertThatThrownBy(() -> BankLogoPictures.toWebp(body, type, later()))
                    .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNSUPPORTED_TYPE));
        }
    }

    @Test
    @DisplayName("Given a PNG sent as a JPEG or without a type, when it becomes a bank logo, then it is refused as an unsupported type")
    void should_refuse_when_converted_given_type_that_disagrees_with_bytes() throws IOException {
        byte[] png = encode(new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB), "png");

        for (String type : new String[]{"image/jpeg", "", "application/octet-stream"}) {
            assertThatThrownBy(() -> BankLogoPictures.toWebp(png, type, later()))
                    .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.UNSUPPORTED_TYPE));
        }
    }

    @Test
    @DisplayName("Given a deadline that has already passed, when a picture becomes a bank logo, then it is refused as timed out before decoding")
    void should_time_out_before_decoding_when_converted_given_passed_deadline() throws IOException {
        byte[] png = encode(new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB), "png");

        assertThatThrownBy(() -> BankLogoPictures.toWebp(png, "image/png", System.nanoTime() - 1))
                .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.TIMEOUT));
    }

    @Test
    @DisplayName("Given a large noisy PNG and a deadline that runs out while it decodes, when it becomes a bank logo, then the decoding is cut short and refused as timed out")
    void should_time_out_when_converted_given_deadline_during_decoding() throws IOException {
        byte[] png = encode(noise(2000, 2000), "png");
        BankLogoPictures.toWebp(png, "image/png", later());
        long started = System.nanoTime();
        BankLogoPictures.toWebp(png, "image/png", later());
        long decoding = System.nanoTime() - started;

        assertThatThrownBy(() -> BankLogoPictures.toWebp(png, "image/png", System.nanoTime() + decoding / 4))
                .isInstanceOfSatisfying(BankLogoUnavailable.class, refused -> assertThat(refused.failure()).isEqualTo(BankLogoFailure.TIMEOUT));
    }

    private static long later() {
        return System.nanoTime() + Duration.ofSeconds(30).toNanos();
    }

    private static BufferedImage noise(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        SplittableRandom random = new SplittableRandom(7);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, random.nextInt(0x1000000));
            }
        }
        return image;
    }

    static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, out)).isTrue();
        return out.toByteArray();
    }

    private static byte[] withHeaderSize(byte[] png, int width, int height) {
        byte[] changed = png.clone();
        writeInt(changed, 16, width);
        writeInt(changed, 20, height);
        return changed;
    }

    private static void writeInt(byte[] target, int offset, int value) {
        target[offset] = (byte) (value >>> 24);
        target[offset + 1] = (byte) (value >>> 16);
        target[offset + 2] = (byte) (value >>> 8);
        target[offset + 3] = (byte) value;
    }
}
